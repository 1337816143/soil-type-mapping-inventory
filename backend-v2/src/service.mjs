import {Problem,need,text,exactKeys,descriptors,manifest,deletePath,REPO,BRANCH,CHUNK,QUALITY_ROOT,REFERENCE_ROOT,INDEX_PATH} from './policy.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder();
export async function sha(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value)),b=>b.toString(16).padStart(2,'0')).join('');}
function base64(value){let s='';const b=new Uint8Array(value);for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);}
function token(){return base64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function normalizePassword(v){return String(v||'').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').trim();}
function constantEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function bytes(request,max){
  const len=Number(request.headers.get('content-length')||0);need(!len||len<=max,'请求体过大','BODY_TOO_LARGE',413);
  need(request.body,'请求体为空');const reader=request.body.getReader(),chunks=[];let size=0;
  let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reader.cancel().catch(()=>{});reject(new Problem(408,'BODY_TIMEOUT','接收文件超时，请保留原任务稍后续传'));},max>65536?60000:10000);});
  try{for(;;){const {done,value}=await Promise.race([reader.read(),timeout]);if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Problem(413,'BODY_TOO_LARGE','请求体过大');}chunks.push(value);}}finally{clearTimeout(timer);reader.releaseLock();}
  const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
}
async function body(request,max=64*1024){
  need((request.headers.get('content-type')||'').split(';')[0]==='application/json','需要JSON请求','CONTENT_TYPE',415);
  try{return JSON.parse(decoder.decode(await bytes(request,max)));}catch(e){if(e instanceof Problem)throw e;throw new Problem(400,'INVALID_JSON','请求JSON格式无效');}
}
const messages={GITHUB_CREDENTIAL:'后台上传凭证未通过校验，请联系平台维护人员；无需在网页输入凭证。',GITHUB_PERMISSION:'后台上传服务权限不足或请求被限制，请联系平台维护人员。',GITHUB_RATE_LIMIT:'上传服务请求受限，请稍后查询状态，不要重复上传。',GITHUB_UNAVAILABLE:'GitHub服务暂时不可用，请稍后查询原上传任务。',GITHUB_NETWORK:'后台连接GitHub失败，请稍后重试原任务。',GITHUB_TIMEOUT:'后台连接GitHub超时，请稍后查询原任务状态。'};
export function upstreamProblem(status,headers){
  let code=status===401?'GITHUB_CREDENTIAL':status===403?'GITHUB_PERMISSION':status>=500?'GITHUB_UNAVAILABLE':'GITHUB_ERROR';
  if(status===429||(status===403&&(headers?.get('x-ratelimit-remaining')==='0'||headers?.get('retry-after'))))code='GITHUB_RATE_LIMIT';
  return new Problem(code==='GITHUB_RATE_LIMIT'?503:502,code,messages[code]||'仓库请求失败，请联系维护人员。',{upstreamStatus:status});
}
export class Git {
  constructor(env,fetcher=fetch){this.env=env;this.fetcher=fetcher;}
  async request(suffix,method='GET',payload){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const r=await this.fetcher('https://api.github.com/repos/'+REPO+suffix,{method,redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+this.env.GITHUB_UPLOAD_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'soil-managed-backend-v2','Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
      if(!r.ok){const e=upstreamProblem(r.status,r.headers);e.upstreamStatus=r.status;throw e;}
      if(r.status===204)return null;try{return await r.json();}catch(e){if(e?.name==='SyntaxError')throw new Problem(502,'GITHUB_RESPONSE','后台收到的GitHub响应格式异常，请联系维护人员。');throw e;}
    }catch(e){if(e instanceof Problem)throw e;const timeout=e?.name==='AbortError';throw new Problem(timeout?504:503,timeout?'GITHUB_TIMEOUT':'GITHUB_NETWORK',messages[timeout?'GITHUB_TIMEOUT':'GITHUB_NETWORK']);}
    finally{clearTimeout(timer);}
  }
  async snapshot(){const r=await this.request('/git/ref/heads/main');const c=await this.request('/git/commits/'+r.object.sha);return {head:r.object.sha,tree:c.tree.sha};}
  async blob(data){return (await this.request('/git/blobs','POST',{content:base64(data),encoding:'base64'})).sha;}
  async jsonFile(path,ref){
    const d=await this.request('/contents/'+path.split('/').map(encodeURIComponent).join('/')+'?ref='+ref);
    need(d.encoding==='base64'&&typeof d.content==='string'&&d.content.length<3*1024*1024,'仓库索引过大或格式异常，已停止修改','INDEX_UNSAFE',409);
    try{return JSON.parse(decoder.decode(Uint8Array.from(atob(d.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));}catch{throw new Problem(409,'INDEX_UNSAFE','仓库索引格式异常，已停止修改');}
  }
  async commit(tree,entries,parent,message){const t=await this.request('/git/trees','POST',{base_tree:tree,tree:entries});return (await this.request('/git/commits','POST',{tree:t.sha,parents:[parent],message})).sha;}
}
export class Service {
  constructor(env,storage,{fetcher=fetch,now=()=>Date.now()}={}){this.env=env;this.storage=storage;this.now=now;this.git=new Git(env,fetcher);}
  async scheduleCleanup(){const at=this.now()+3600000,current=this.storage.getAlarm?await this.storage.getAlarm():null;if(current===null||current>at)await this.storage.setAlarm(at);}
  async save(key,value,ttl=48*3600000){await this.storage.put(key,{...value,expires:this.now()+ttl});await this.scheduleCleanup();}
  async read(key){const value=await this.storage.get(key);if(value&&value.expires<=this.now()){await this.storage.delete(key);return null;}return value;}
  configured(){return !!(this.env.GITHUB_UPLOAD_TOKEN&&this.env.SOIL_ADMIN_PASSWORD&&String(this.env.SESSION_SECRET||'').length>=32);}
  writes(){need(this.env.WRITES_ENABLED==='true','后台尚处于只读验收模式，未开启写入','READ_ONLY',503);}
  async throttle(scope,request,maximum,windowMs){
    const ip=request.headers.get('cf-connecting-ip')||'local-unidentified';
    const key='rate:'+await sha(this.env.SESSION_SECRET+':'+scope+':'+ip);
    let r=await this.read(key);if(!r)r={count:0,expires:this.now()+windowMs};
    need(r.count<maximum,'操作过于频繁，请稍后重试','RATE_LIMIT',429);r.count++;
    await this.storage.put(key,r);await this.scheduleCleanup();
  }
  async login(request){
    await this.throttle('login',request,10,15*60000);
    const b=await body(request,2048);exactKeys(b,['password']);need(typeof b.password==='string'&&b.password.length<=128,'密码格式无效');
    const expected=await sha(this.env.SESSION_SECRET+normalizePassword(this.env.SOIL_ADMIN_PASSWORD));
    const actual=await sha(this.env.SESSION_SECRET+normalizePassword(b.password));
    need(constantEqual(expected,actual),'管理员密码错误','ADMIN_PASSWORD',401);
    const credential=token();await this.save('session:'+await sha(credential),{created:this.now()},30*60000);
    return {session:credential,expiresIn:1800};
  }
  async authorize(request){
    const v=request.headers.get('authorization')||'';
    need(/^Bearer [A-Za-z0-9_-]{43}$/.test(v),'请先输入管理员密码','SESSION_REQUIRED',401);
    const key='session:'+await sha(v.slice(7)),s=await this.read(key);need(s,'管理会话已过期，请重新输入管理员密码','SESSION_EXPIRED',401);return {key,...s};
  }
  async createUpload(request){
    this.writes();await this.throttle('create',request,30,3600000);
    const key=text(request.headers.get('idempotency-key'),80);need(/^[a-zA-Z0-9-]{16,80}$/.test(key),'缺少有效的请求唯一编号');
    const input=descriptors(await body(request)),digest=await sha(JSON.stringify(input)),cacheKey='create:'+key;
    const existing=await this.read(cacheKey);
    if(existing){need(existing.digest===digest,'同一个请求编号对应的内容发生变化','IDEMPOTENCY_CONFLICT',409);return this.publicOperation(await this.requireOp(existing.id));}
    const snap=await this.git.snapshot(),id='svc-'+crypto.randomUUID(),branch=(input.kind==='quality'?'soil-upload-':'reference-upload-')+id;
    const op={...input,id,branch,baseHead:snap.head,baseTree:snap.tree,createdAt:new Date(this.now()).toISOString(),state:'receiving'};
    need(encoder.encode(JSON.stringify(op)).length<=110*1024,'归档元数据过多，请减小批次','METADATA_TOO_LARGE',413);
    await this.save('op:'+id,op);await this.save(cacheKey,{id,digest});return this.publicOperation(op);
  }
  async requireOp(id){need(/^svc-[a-f0-9-]{36}$/.test(id),'上传编号无效');const op=await this.read('op:'+id);need(op,'上传任务不存在或已过期','UPLOAD_NOT_FOUND',404);return op;}
  publicOperation(op){return {uploadId:op.id,state:op.state,chunkBytes:CHUNK,files:op.files.map(f=>({index:f.index,name:f.name,partCount:f.partCount})),...(op.archiveCommit?{commit:op.archiveCommit}:{})};}
  async chunk(request,id,fileIndex,part){
    this.writes();const op=await this.requireOp(id);need(op.state==='receiving','任务已经提交，不能替换内容','UPLOAD_STATE',409);
    const f=op.files[fileIndex];need(f&&Number.isInteger(part)&&part>=0&&part<f.partCount,'分块编号无效');
    need(request.headers.get('content-type')==='application/octet-stream','请使用二进制分块上传','CONTENT_TYPE',415);
    const data=await bytes(request,CHUNK),expected=Math.min(CHUNK,f.size-part*CHUNK);need(data.length===expected,'分块大小与申报文件不一致','CHUNK_SIZE',422);
    const digest=await sha(data),key=`part:${id}:${fileIndex}:${part}`,old=await this.read(key);
    if(old){need(old.digest===digest,'重复分块内容不一致，未覆盖原文件','CHUNK_CHANGED',409);return {accepted:true,reused:true};}
    if(f.partCount===1)need(digest===f.sha256,'文件内容校验不一致','HASH_MISMATCH',422);
    const blob=await this.git.blob(data);await this.save(key,{digest,blob,size:data.length});return {accepted:true,reused:false};
  }
  async finalize(id){
    this.writes();let op=await this.requireOp(id);if(op.state!=='receiving')return this.publicOperation(op);
    const data=manifest(op),entries=[];
    for(const f of op.files)for(let p=0;p<f.partCount;p++){
      const chunk=await this.read(`part:${id}:${f.index}:${p}`);need(chunk,'文件分块尚未全部到达','PARTS_INCOMPLETE',409);
      const item=data.files[f.index],ref=item.whole||item.chunks[p];entries.push({path:ref.path,mode:'100644',type:'blob',sha:chunk.blob});
    }
    if(!op.stagingCommit){
      const prefix=op.kind==='quality'?'.soil-upload':'.reference-upload',manifestPath=`${prefix}/${id}/manifest.json`;
      entries.push({path:manifestPath,mode:'100644',type:'blob',content:JSON.stringify(data,null,2)+'\n'});
      entries.push({path:prefix+'/ready.json',mode:'100644',type:'blob',content:JSON.stringify({schemaVersion:3,uploadId:id,manifestPath})});
      op.stagingCommit=await this.git.commit(op.baseTree,entries,op.baseHead,'stage: managed upload '+id);await this.save('op:'+id,op);
    }
    // Reconcile a lost acknowledgement before attempting to create the branch.
    let ref=null;try{ref=await this.git.request('/git/ref/heads/'+op.branch);}catch(e){if(e.upstreamStatus!==404)throw e;}
    if(ref)need(ref.object.sha===op.stagingCommit,'暂存分支已被其他提交修改，请人工核对','STAGE_CONFLICT',409);
    else{
      try{await this.git.request('/git/refs','POST',{ref:'refs/heads/'+op.branch,sha:op.stagingCommit});}
      catch(e){let check;try{check=await this.git.request('/git/ref/heads/'+op.branch);}catch{throw e;}need(check.object.sha===op.stagingCommit,'暂存分支状态不一致','STAGE_CONFLICT',409);}
    }
    op.state='archiving';await this.save('op:'+id,op);return this.publicOperation(op);
  }
  async status(id){
    const op=await this.requireOp(id);if(op.state==='archiving'){
      for(let p=1;p<=3;p++){
        const commits=await this.git.request('/commits?sha=main&per_page=100&page='+p+'&since='+encodeURIComponent(op.createdAt));
        need(Array.isArray(commits),'归档查询结果异常','STATUS_INVALID',502);
        const expected=(op.kind==='reference'?'docs: import reference files ':'docs: import staged files ')+id;
        const found=commits.find(c=>c.commit?.message?.split('\n')[0]===expected);
        if(found){op.state='complete';op.archiveCommit=found.sha;await this.save('op:'+id,op);break;}if(commits.length<100)break;
      }
    }
    return this.publicOperation(op);
  }
  async deletePlan(request){
    this.writes();await this.throttle('delete',request,20,3600000);const b=await body(request,20000);exactKeys(b,['paths']);
    need(Array.isArray(b.paths)&&b.paths.length&&b.paths.length<=50,'每次删除1至50项');const paths=[...new Set(b.paths.map(deletePath))];
    const snap=await this.git.snapshot(),tree=await this.git.request('/git/trees/'+snap.tree+'?recursive=1');
    need(!tree.truncated&&Array.isArray(tree.tree),'仓库目录不完整，已停止删除','TREE_INCOMPLETE',409);
    const index=await this.git.jsonFile(INDEX_PATH,snap.head);need(Array.isArray(index),'质控索引格式异常，已停止删除','INDEX_UNSAFE',409);
    const files=paths.map(path=>{const found=tree.tree.find(n=>n.path===path);need(!found||(found.type==='blob'&&found.mode==='100644'),'不允许删除非普通文件','PATH_FORBIDDEN',403);need(found||index.some(r=>r.path===path),'待删除文件不存在','FILE_NOT_FOUND',404);return {path,sha:found?.sha||null};});
    const count=index.filter(r=>paths.includes(r.path)).length,id='del-'+crypto.randomUUID();
    await this.save('plan:'+id,{id,files,head:snap.head,tree:snap.tree,associations:count,state:'planned'},10*60000);
    return {planId:id,files:files.map(f=>f.path),associationsToRemove:count,expiresIn:600,requiresConfirmation:true};
  }
  async confirmDeletion(request,id){
    this.writes();const b=await body(request,1024);exactKeys(b,['confirmed']);need(b.confirmed===true,'请明确确认删除');
    const plan=await this.read('plan:'+id);need(plan,'删除确认已过期，请重新核对','PLAN_EXPIRED',409);
    if(plan.state==='complete')return {deleted:plan.files.map(f=>f.path),commit:plan.commit};
    let snap=await this.git.snapshot();
    if(plan.commit){
      // If a PATCH response was lost, an ancestor check distinguishes committed
      // deletion from a genuinely stale plan. Never replay a destructive write.
      let done=snap.head===plan.commit;
      if(!done){const cmp=await this.git.request('/compare/'+plan.commit+'...'+snap.head);done=['ahead','identical'].includes(cmp.status);}
      if(done){plan.state='complete';await this.save('plan:'+id,plan);return {deleted:plan.files.map(f=>f.path),commit:plan.commit};}
    }
    need(snap.head===plan.head,'核对后仓库已有新提交，未执行删除，请重新核对','STALE_DELETE_PLAN',409);
    if(!plan.commit){
      const index=await this.git.jsonFile(INDEX_PATH,plan.head);need(Array.isArray(index),'索引格式异常','INDEX_UNSAFE',409);
      const paths=new Set(plan.files.map(f=>f.path)),next=index.filter(r=>!paths.has(r.path));
      const entries=plan.files.filter(f=>f.sha).map(f=>({path:f.path,mode:'100644',type:'blob',sha:null}));
      if(next.length!==index.length)entries.push({path:INDEX_PATH,mode:'100644',type:'blob',content:JSON.stringify(next,null,2)+'\n'});
      plan.commit=await this.git.commit(plan.tree,entries,plan.head,'chore: managed deletion '+id);await this.save('plan:'+id,plan);
    }
    await this.git.request('/git/refs/heads/main','PATCH',{sha:plan.commit,force:false});plan.state='complete';await this.save('plan:'+id,plan);
    return {deleted:plan.files.map(f=>f.path),commit:plan.commit};
  }
  async handle(request){
    const requestId=crypto.randomUUID(),origin=request.headers.get('origin')||'';
    const allowed=new Set(String(this.env.ALLOWED_ORIGINS||'https://1337816143.github.io').split(',').map(s=>s.trim()));
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin','X-Request-ID':requestId};
    if(allowed.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Idempotency-Key','Access-Control-Expose-Headers':'X-Request-ID'});
    const respond=(data,status=200)=>new Response(JSON.stringify({...data,requestId}),{status,headers});
    try{
      const url=new URL(request.url),p=url.pathname;
      if(p==='/health'&&request.method==='GET')return respond({ok:true,service:'soil-managed-upload-v2',configured:this.configured(),writesEnabled:this.env.WRITES_ENABLED==='true'});
      need(allowed.has(origin),'该页面来源不被允许','ORIGIN_DENIED',403);
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      need(this.configured(),'后台服务尚未完成配置，请联系平台维护人员','SERVICE_NOT_CONFIGURED',503);
      if(p==='/v1/login'&&request.method==='POST')return respond({ok:true,...await this.login(request)});
      await this.authorize(request);await this.throttle('requests',request,300,60000);
      if(p==='/v1/logout'&&request.method==='POST'){const s=await this.authorize(request);await this.storage.delete(s.key);return respond({ok:true});}
      if(p==='/v1/readiness'&&request.method==='GET'){await this.git.snapshot();return respond({ok:true,repositoryReadable:true,writesEnabled:this.env.WRITES_ENABLED==='true'});}
      if(p==='/v1/uploads'&&request.method==='POST')return respond({ok:true,...await this.createUpload(request)},201);
      const match=p.match(/^\/v1\/uploads\/(svc-[a-f0-9-]{36})(?:\/files\/(\d+)\/parts\/(\d+)|\/(finalize))?$/);
      if(match){if(match[2]!==undefined&&request.method==='PUT')return respond({ok:true,...await this.chunk(request,match[1],+match[2],+match[3])});if(match[4]&&request.method==='POST')return respond({ok:true,...await this.finalize(match[1])});if(!match[2]&&!match[4]&&request.method==='GET')return respond({ok:true,...await this.status(match[1])});}
      if(p==='/v1/delete-plans'&&request.method==='POST')return respond({ok:true,...await this.deletePlan(request)},201);
      const deletion=p.match(/^\/v1\/delete-plans\/(del-[a-f0-9-]{36})\/confirm$/);
      if(deletion&&request.method==='POST')return respond({ok:true,...await this.confirmDeletion(request,deletion[1])});
      throw new Problem(404,'NOT_FOUND','接口不存在');
    }catch(e){return respond({ok:false,code:e instanceof Problem?e.code:'INTERNAL_ERROR',message:e instanceof Problem?e.message:'服务处理失败，请提供请求编号联系平台维护人员。',...(e instanceof Problem?e.details:{})},e instanceof Problem?e.status:500);}
  }
}
