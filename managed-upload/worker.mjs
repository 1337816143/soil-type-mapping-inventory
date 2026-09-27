/**
 * Candidate server-side upload service. Not loaded by the production site.
 * Only this Worker reads the two secret bindings. Never proxies arbitrary URLs.
 * SQLite-backed Durable Object serializes writes and retains operation receipts.
 */
import {ApiError,requireThat,REPOSITORY,ORIGIN,PART_BYTES,INDEX_PATH,managedPath,uuid,hash,normalizePassword,prepareBatch,importManifest} from './policy.mjs';
const encoder=new TextEncoder();
const SESSION_MS=20*60*1000, UPLOAD_MS=24*60*60*1000, RECEIPT_MS=7*24*60*60*1000;
const JSON_LIMIT=256*1024;
export async function sha256(value) {
  const bytes=typeof value==='string'?encoder.encode(value):value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
}
function equal(a,b) {
  if(a.length!==b.length)return false;
  let different=0;for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);return different===0;
}
function base64(bytes) {
  const chunks=[];for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));return btoa(chunks.join(''));
}
function headers(origin) {
  const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin===ORIGIN)Object.assign(h,{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Content-SHA256','Access-Control-Expose-Headers':'X-Request-ID','Access-Control-Max-Age':'600'});
  return h;
}
function json(payload,status,origin,requestId) {
  return new Response(JSON.stringify(payload),{status,headers:{...headers(origin),'X-Request-ID':requestId}});
}
async function boundedBytes(request,limit) {
  const declared=request.headers.get('Content-Length');
  if(declared!==null)requireThat(/^\d+$/.test(declared)&&Number(declared)<=limit,413,'BODY_TOO_LARGE','请求内容过大。');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const parts=[];let size=0;
  try{while(true){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new ApiError(413,'BODY_TOO_LARGE','请求内容过大。');}parts.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}return bytes;
}
async function readJSON(request,limit=JSON_LIMIT) {
  requireThat((request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()==='application/json',415,'CONTENT_TYPE','请使用JSON请求。');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBytes(request,limit)));}
  catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,'INVALID_JSON','请求格式错误。');}
}
function configured(env) {
  return typeof env.GITHUB_UPLOAD_TOKEN==='string'&&env.GITHUB_UPLOAD_TOKEN.trim().length>0&&typeof env.SOIL_ADMIN_PASSWORD==='string'&&normalizePassword(env.SOIL_ADMIN_PASSWORD).length>=6;
}
/** No raw GitHub error text is sent to clients; network failure is not a 401. */
export function upstreamError(status, responseHeaders) {
  if(status===401)return new ApiError(503,'SERVICE_CREDENTIAL','平台服务凭证需要维护，无需在网页填写凭证。');
  if(status===429||(status===403&&(responseHeaders?.get('x-ratelimit-remaining')==='0'||responseHeaders?.get('retry-after'))))return new ApiError(429,'SERVICE_RATE_LIMIT','上传服务暂时限流，请稍后重试。');
  if(status===403)return new ApiError(503,'SERVICE_PERMISSION','平台服务权限或访问策略需要维护。');
  if(status===409||status===422)return new ApiError(409,'UPSTREAM_CONFLICT','仓库状态发生变化，请重新核对操作结果。');
  if(status>=500)return new ApiError(502,'SERVICE_UNAVAILABLE','GitHub服务暂时异常，请稍后查询本次操作结果。');
  return new ApiError(502,'SERVICE_HTTP','上传服务返回异常，请凭请求编号联系维护人员。');
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url),origin=request.headers.get('Origin')||'',requestId=crypto.randomUUID();
    if(request.method==='GET'&&url.pathname==='/health'){const ready=configured(env)&&!!env.SOIL_STATE;return json({ok:ready,service:'soil-managed-upload',apiVersion:1,productionCutover:false},ready?200:503,origin,requestId);}
    if(origin!==ORIGIN)return json({ok:false,code:'ORIGIN_DENIED',message:'请求来源不在允许范围。',requestId},403,origin,requestId);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
    if(!configured(env))return json({ok:false,code:'SERVICE_NOT_CONFIGURED',message:'平台后台尚未配置完成，请联系维护人员。',requestId},503,origin,requestId);
    if(!env.SOIL_STATE)return json({ok:false,code:'SERVICE_NOT_CONFIGURED',message:'平台后台存储尚未配置完成。',requestId},503,origin,requestId);
    const stub=env.SOIL_STATE.get(env.SOIL_STATE.idFromName('managed-upload-v1'));
    const forwarded=new Request(request);forwarded.headers.set('X-Soil-Request-ID',requestId);
    // Ignore a caller-supplied helper header. CF-Connecting-IP is set by the edge.
    forwarded.headers.set('X-Soil-Client-IP',request.headers.get('CF-Connecting-IP')||'unknown');
    try{return await stub.fetch(forwarded);}
    catch{return json({ok:false,code:'SERVICE_UNAVAILABLE',message:'平台后台暂时不可用，请稍后重试。',requestId},503,origin,requestId);}
  }
};
export class SoilManagedState {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.tail=Promise.resolve();}
  fetch(request){
    // A request can yield during GitHub I/O; keep state changes serialized.
    const run=this.tail.then(()=>this.respond(request));this.tail=run.catch(()=>{});return run;
  }
  async respond(request){
    const origin=request.headers.get('Origin')||'',requestId=request.headers.get('X-Soil-Request-ID')||crypto.randomUUID();
    try{
      requireThat(origin===ORIGIN,403,'ORIGIN_DENIED','请求来源不在允许范围。');
      requireThat(configured(this.env),503,'SERVICE_NOT_CONFIGURED','平台后台尚未配置完成。');
      const result=await this.handle(request);
      return json({ok:true,...result},result.httpStatus||200,origin,requestId);
    }catch(error){
      const known=error instanceof ApiError;
      return json({ok:false,code:known?error.code:'INTERNAL_ERROR',message:known?error.message:'后台处理异常，请保留文件并凭请求编号联系维护人员。',requestId},known?error.status:500,origin,requestId);
    }
  }
  async put(key,value,expiresAt){await this.ctx.storage.put(key,{...value,expiresAt});await this.ctx.storage.setAlarm(Date.now()+15*60*1000);}
  async read(key){const value=await this.ctx.storage.get(key);if(value&&value.expiresAt<Date.now()){await this.ctx.storage.delete(key);return null;}return value||null;}
  async alarm(){
    const now=Date.now(), all=await this.ctx.storage.list();let retained=false;
    for(const[k,v]of all){if(v.expiresAt&&v.expiresAt<now)await this.ctx.storage.delete(k);else retained=true;}
    if(retained)await this.ctx.storage.setAlarm(now+15*60*1000);
  }
  async github(path,{method='GET',body,missing=false}={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch('https://api.github.com/repos/'+REPOSITORY+path,{method,redirect:'error',cache:'no-store',signal:controller.signal,
        headers:{Authorization:'Bearer '+this.env.GITHUB_UPLOAD_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'soil-managed-upload','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(response.status===404&&missing)return null;
      if(!response.ok)throw upstreamError(response.status,response.headers);
      if(response.status===204)return{};
      const text=await response.text();
      try{return text?JSON.parse(text):{};}catch{throw new ApiError(502,'SERVICE_RESPONSE','上传服务响应格式异常。');}
    }catch(error){
      if(error instanceof ApiError)throw error;
      throw new ApiError(502,error?.name==='AbortError'?'SERVICE_TIMEOUT':'SERVICE_NETWORK','后台未收到GitHub的确认，请保留文件并查询本次操作状态；这不是管理员密码错误。');
    }finally{clearTimeout(timeout);}
  }
  async login(request){
    const data=await readJSON(request,1024),now=Date.now();
    const ip=request.headers.get('X-Soil-Client-IP')||'unknown', ipHash=await sha256(ip);
    const ipKey='rate:ip:'+ipHash, globalKey='rate:all';
    const ipRow=await this.read(ipKey)||{count:0,expiresAt:now+15*60*1000};
    const globalRow=await this.read(globalKey)||{count:0,expiresAt:now+15*60*1000};
    requireThat(ipRow.count<5&&globalRow.count<100,429,'LOGIN_RATE_LIMIT','密码尝试次数过多，请15分钟后重试。');
    await this.put(ipKey,{count:ipRow.count+1},ipRow.expiresAt);await this.put(globalKey,{count:globalRow.count+1},globalRow.expiresAt);
    const password=normalizePassword(data.password);
    const expected=await sha256(normalizePassword(this.env.SOIL_ADMIN_PASSWORD));
    requireThat(equal(await sha256(password),expected),401,'ADMIN_PASSWORD','管理员密码错误。');
    await this.ctx.storage.delete(ipKey);
    const access=randomToken(),session={id:crypto.randomUUID(),origin:ORIGIN,passwordTag:expected,createdAt:now};
    await this.put('session:'+await sha256(access),session,now+SESSION_MS);
    return{accessToken:access,expiresAt:now+SESSION_MS,role:'admin'};
  }
  async session(request){
    const value=request.headers.get('Authorization')||'';
    requireThat(/^Bearer [a-f0-9]{64}$/.test(value),401,'SESSION_REQUIRED','请输入管理员密码。');
    const key='session:'+await sha256(value.slice(7)),s=await this.read(key);
    requireThat(s&&s.origin===ORIGIN&&s.passwordTag===await sha256(normalizePassword(this.env.SOIL_ADMIN_PASSWORD)),401,'SESSION_EXPIRED','操作验证已过期，请重新输入管理员密码。');
    return{...s,key};
  }
  async handle(request){
    const {pathname:path,search}=new URL(request.url);
    requireThat(!search && !/%|\\/.test(path),400,'INVALID_ROUTE','接口路径格式错误。');
    if(path==='/v1/login'&&request.method==='POST')return this.login(request);
    const s=await this.session(request);
    if(path==='/v1/logout'&&request.method==='POST'){await this.ctx.storage.delete(s.key);return{loggedOut:true};}
    if(path==='/v1/check'&&request.method==='POST'){await this.github('/git/ref/heads/main');return{service:'available'};}
    if(path==='/v1/uploads'&&request.method==='POST')return this.createUpload(s,await readJSON(request));
    const parts=path.match(/^\/v1\/uploads\/([a-f0-9-]+)\/files\/(\d+)\/parts\/(\d+)$/);
    if(parts&&request.method==='PUT')return this.uploadPart(s,uuid(parts[1]),Number(parts[2]),Number(parts[3]),request);
    const upload=path.match(/^\/v1\/uploads\/([a-f0-9-]+)\/(commit|status|cancel)$/);
    if(upload){
      const id=uuid(upload[1]),action=upload[2];
      if(action==='status'&&request.method==='GET')return this.uploadStatus(s,id);
      if(action==='commit'&&request.method==='POST')return this.commitUpload(s,id);
      if(action==='cancel'&&request.method==='POST')return this.cancelUpload(s,id);
    }
    if(path==='/v1/deletions/preview'&&request.method==='POST')return this.previewDeletion(s,await readJSON(request));
    if(path==='/v1/deletions/commit'&&request.method==='POST')return this.commitDeletion(s,await readJSON(request));
    if(path==='/v1/deletions/cancel'&&request.method==='POST')return this.cancelDeletion(s,await readJSON(request));
    throw new ApiError(404,'NOT_FOUND','接口不存在。');
  }
  async createUpload(s,input){
    const key=uuid(input.idempotencyKey),fingerprint=await sha256(JSON.stringify(input));
    const existing=await this.read('upload-key:'+s.id+':'+key);
    if(existing){requireThat(existing.fingerprint===fingerprint,409,'REQUEST_REUSED','同一请求标识不能用于不同文件。');return{uploadId:existing.uploadId,partBytes:PART_BYTES,reused:true};}
    const id=crypto.randomUUID(),batch=prepareBatch(input,id);batch.owner=s.id;batch.createdAt=Date.now();
    await this.put('upload:'+id,batch,Date.now()+UPLOAD_MS);
    await this.put('upload-key:'+s.id+':'+key,{uploadId:id,fingerprint},Date.now()+UPLOAD_MS);
    return{uploadId:id,partBytes:PART_BYTES,state:'receiving',httpStatus:201};
  }
  async owned(s,id){const b=await this.read('upload:'+id);requireThat(b&&b.owner===s.id,404,'UPLOAD_NOT_FOUND','未找到本会话的上传任务。');return b;}
  async uploadPart(s,id,fi,pi,request){
    const b=await this.owned(s,id);
    requireThat(b.state==='receiving',409,'UPLOAD_LOCKED','本次上传已提交或取消。');
    const f=b.files[fi];requireThat(f&&Number.isSafeInteger(pi)&&pi>=0&&pi<f.partCount,400,'PART_INDEX','文件分块编号无效。');
    const expected=hash(request.headers.get('X-Content-SHA256'));
    const bytes=await boundedBytes(request,PART_BYTES),size=Math.min(PART_BYTES,f.size-pi*PART_BYTES);
    requireThat(bytes.length===size,400,'PART_SIZE','文件分块大小不一致。');
    requireThat(await sha256(bytes)===expected,400,'PART_HASH','文件分块校验失败，请重试。');
    if(f.parts[pi]){requireThat(f.parts[pi].hash===expected,409,'PART_CHANGED','重试分块内容与原分块不同。');return{received:true,reused:true};}
    const blob=await this.github('/git/blobs',{method:'POST',body:{content:base64(bytes),encoding:'base64'}});
    requireThat(/^[0-9a-f]{40}$/.test(blob.sha),502,'SERVICE_RESPONSE','上传服务未返回文件确认。');
    f.parts[pi]={sha:blob.sha,hash:expected,size};
    await this.put('upload:'+id,b,Date.now()+UPLOAD_MS);return{received:true,fileIndex:fi,partIndex:pi};
  }
  async commitUpload(s,id){
    const b=await this.owned(s,id);
    requireThat(b.state!=='cancelled',409,'UPLOAD_CANCELLED','本次上传已取消。');
    if(['submitted','archived'].includes(b.state))return{uploadId:id,state:b.state,commit:b.finalCommit||'',reused:true};
    if(!b.stageCommit){
      const ref=await this.github('/git/ref/heads/main'),base=ref.object.sha;
      const commit=await this.github('/git/commits/'+base),{manifest,entries,root}=importManifest(b,base);
      const manifestPath=`${root}/${id}/manifest.json`;
      entries.push({path:manifestPath,mode:'100644',type:'blob',content:JSON.stringify(manifest)});
      entries.push({path:root+'/ready.json',mode:'100644',type:'blob',content:JSON.stringify({schemaVersion:3,uploadId:id,manifestPath})});
      const tree=await this.github('/git/trees',{method:'POST',body:{base_tree:commit.tree.sha,tree:entries}});
      const next=await this.github('/git/commits',{method:'POST',body:{message:'stage: managed upload '+id,tree:tree.sha,parents:[base]}});
      b.stageCommit=next.sha;b.branch=manifest.sourceBranch;b.state='prepared';
      await this.put('upload:'+id,b,Date.now()+UPLOAD_MS);
    }
    // A lost POST response must not create a second branch/job.
    const finished=await this.findArchived(b);
    if(finished)return{uploadId:id,state:'archived',commit:finished};
    const previous=await this.github('/git/ref/heads/'+b.branch,{missing:true});
    if(previous){requireThat(previous.object.sha===b.stageCommit,409,'STAGE_CONFLICT','本次暂存分支出现冲突，请联系维护人员。');}
    else{
      if(b.publishAttempted)return{uploadId:id,state:'confirmation-pending',message:'上次提交尚未确认，请查询状态，不会重复创建归档任务。'};
      b.publishAttempted=true;await this.put('upload:'+id,b,Date.now()+UPLOAD_MS);
      try{await this.github('/git/refs',{method:'POST',body:{ref:'refs/heads/'+b.branch,sha:b.stageCommit}});}
      catch(error){
        // No forced retries of unknown write results. Persist uncertainty and
        // reconcile in a subsequent status/commit request.
        b.state='prepared';await this.put('upload:'+id,b,Date.now()+UPLOAD_MS);throw error;
      }
    }
    b.state='submitted';await this.put('upload:'+id,b,Date.now()+RECEIPT_MS);
    return{uploadId:id,state:'submitted',message:'文件已暂存，后台正在归档；尚未确认归档成功。'};
  }
  async findArchived(b){
    const commits=await this.github('/commits?sha=main&per_page=100');
    const expected=(b.kind==='reference'?'docs: import reference files ':'docs: import staged files ')+b.id;
    const done=Array.isArray(commits)&&commits.find(c=>c.commit?.message?.split('\n')[0]===expected);
    if(!done)return '';
    b.state='archived';b.finalCommit=done.sha;await this.put('upload:'+b.id,b,Date.now()+RECEIPT_MS);return done.sha;
  }
  async uploadStatus(s,id){
    const b=await this.owned(s,id);
    if(b.state==='archived'||b.state==='cancelled'||b.state==='receiving')return{uploadId:id,state:b.state,commit:b.finalCommit||''};
    const finished=await this.findArchived(b);
    if(finished)return{uploadId:id,state:'archived',commit:finished};
    const current=await this.github('/git/ref/heads/'+b.branch,{missing:true});
    if(current&&current.object.sha===b.stageCommit&&b.state==='prepared'){b.state='submitted';await this.put('upload:'+id,b,Date.now()+RECEIPT_MS);}
    return{uploadId:id,state:b.state,message:'尚未取得最终归档确认，请继续查询；不要重新建立上传任务。'};
  }
  async cancelUpload(s,id){
    const b=await this.owned(s,id);requireThat(b.state==='receiving',409,'ALREADY_SUBMITTED','已提交的归档任务不能当作未提交任务取消。');
    b.state='cancelled';await this.put('upload:'+id,b,Date.now()+RECEIPT_MS);return{uploadId:id,state:'cancelled'};
  }
  async snapshot(){
    const ref=await this.github('/git/ref/heads/main'),sha=ref.object.sha;
    const commit=await this.github('/git/commits/'+sha),tree=await this.github('/git/trees/'+commit.tree.sha+'?recursive=1');
    requireThat(tree.truncated!==true&&Array.isArray(tree.tree),503,'TREE_INCOMPLETE','文件清单不完整，已停止删除操作。');
    const indexEntry=tree.tree.find(x=>x.path===INDEX_PATH);let index=[];
    if(indexEntry){
      requireThat(indexEntry.type==='blob'&&indexEntry.mode==='100644',409,'INDEX_INVALID','成果索引不是普通文件，已停止操作。');
      const blob=await this.github('/git/blobs/'+indexEntry.sha);
      requireThat(blob.encoding==='base64'&&typeof blob.content==='string'&&blob.size<2*1024*1024,503,'INDEX_INVALID','成果索引过大或不可读取。');
      try{index=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(blob.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));}catch{throw new ApiError(503,'INDEX_INVALID','成果索引无法解析，已停止删除操作。');}
      requireThat(Array.isArray(index)&&index.every(x=>x&&typeof x==='object'&&typeof x.path==='string'),503,'INDEX_INVALID','成果索引格式异常，已停止删除操作。');
    }
    return{sha,treeSha:commit.tree.sha,entries:tree.tree,index};
  }
  async previewDeletion(s,input){
    requireThat(Array.isArray(input.paths)&&input.paths.length>0&&input.paths.length<=20,400,'DELETE_SELECTION','每次请选择1至20个明确文件。');
    const paths=[...new Set(input.paths.map(managedPath))],snap=await this.snapshot();
    const entries=paths.map(path=>{
      const x=snap.entries.find(e=>e.path===path);requireThat(x&&x.type==='blob'&&x.mode==='100644',409,'FILE_CHANGED','所选文件不存在或不是普通文件，请重新核对。');return{path,sha:x.sha,size:x.size};
    });
    const planId=crypto.randomUUID();
    const plan={owner:s.id,createdAt:Date.now(),base:snap.sha,baseTree:snap.treeSha,entries,state:'preview',filteredIndex:snap.index.filter(x=>!paths.includes(x.path)),indexChanged:snap.index.some(x=>paths.includes(x.path))};
    await this.put('delete:'+planId,plan,Date.now()+5*60*1000);
    return{planId,expiresAt:Date.now()+5*60*1000,files:entries,associationsRemoved:snap.index.length-plan.filteredIndex.length,requiresConfirmation:true};
  }
  async commitDeletion(s,input){
    const id=uuid(input.planId),p=await this.read('delete:'+id);
    requireThat(p&&p.owner===s.id,404,'PLAN_EXPIRED','删除预览已失效，请重新预览。');
    requireThat(input.confirmation==='DELETE',400,'DELETE_CONFIRMATION','请确认删除预览中的文件。');
    requireThat(p.state!=='cancelled',409,'PLAN_CANCELLED','删除已取消。');
    if(p.state==='done')return{state:'deleted',commit:p.commit,files:p.entries.map(x=>x.path),reused:true};
    const latest=await this.github('/git/ref/heads/main');
    if(p.commit&&latest.object.sha!==p.base){
      let applied=latest.object.sha===p.commit;
      if(!applied){const comparison=await this.github('/compare/'+p.commit+'...'+latest.object.sha);applied=comparison.merge_base_commit?.sha===p.commit;}
      if(applied){p.state='done';await this.put('delete:'+id,p,Date.now()+RECEIPT_MS);return{state:'deleted',commit:p.commit,files:p.entries.map(x=>x.path),reconciled:true};}
    }
    requireThat(latest.object.sha===p.base,409,'PREVIEW_STALE','预览后仓库已有更新，未执行删除，请重新预览。');
    if(!p.commit){
      const entries=p.entries.map(x=>({path:x.path,mode:'100644',type:'blob',sha:null}));
      if(p.indexChanged)entries.push({path:INDEX_PATH,mode:'100644',type:'blob',content:JSON.stringify(p.filteredIndex,null,2)+'\n'});
      const tree=await this.github('/git/trees',{method:'POST',body:{base_tree:p.baseTree,tree:entries}});
      const commit=await this.github('/git/commits',{method:'POST',body:{message:'chore: managed deletion '+id,tree:tree.sha,parents:[p.base]}});
      p.commit=commit.sha;p.state='prepared';await this.put('delete:'+id,p,Date.now()+RECEIPT_MS);
    }
    // API uses a non-fast-forward rejection instead of overwriting other work.
    await this.github('/git/refs/heads/main',{method:'PATCH',body:{sha:p.commit,force:false}});
    p.state='done';await this.put('delete:'+id,p,Date.now()+RECEIPT_MS);
    return{state:'deleted',commit:p.commit,files:p.entries.map(x=>x.path)};
  }
  async cancelDeletion(s,input){const id=uuid(input.planId),p=await this.read('delete:'+id);requireThat(p&&p.owner===s.id,404,'PLAN_EXPIRED','删除预览已失效。');requireThat(p.state==='preview',409,'DELETE_STARTED','已执行的删除不能取消。');p.state='cancelled';await this.put('delete:'+id,p,Date.now()+RECEIPT_MS);return{state:'cancelled'};}
}
