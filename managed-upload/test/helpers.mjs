import cryptoNode from 'node:crypto';
import worker,{SoilManagedState} from '../worker.mjs';
import {REPOSITORY,ORIGIN,INDEX_PATH} from '../policy.mjs';
export class Storage {
  constructor(){this.map=new Map();}
  async get(k){return this.map.has(k)?structuredClone(this.map.get(k)):undefined;}
  async put(k,v){this.map.set(k,structuredClone(v));}
  async delete(k){return this.map.delete(k);}
  async list(){return new Map(Array.from(this.map,([k,v])=>[k,structuredClone(v)]));}
  async setAlarm(value){this.alarmAt=value;}
}
function gitHash(v){return cryptoNode.createHash('sha1').update(v).digest('hex');}
export class GithubMock {
  constructor(){this.calls=[];this.blobs=new Map();this.trees=new Map();this.commits=new Map();this.branches=new Map();this.seq=0;this.hook=null;this.base=this.commit({},'baseline',null);this.branches.set('main',this.base);}
  blob(bytes){const b=Buffer.from(bytes),sha=gitHash(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b]));this.blobs.set(sha,b);return sha;}
  commit(files,message,parent){const entries={};for(const[path,bytes]of Object.entries(files))entries[path]={sha:this.blob(bytes),mode:'100644',type:'blob',path,size:Buffer.byteLength(bytes)};const tree=this.saveTree(entries);const id=gitHash('commit '+(++this.seq));this.commits.set(id,{sha:id,tree:{sha:tree},message,parent});return id;}
  saveTree(entries){const sha=gitHash(JSON.stringify(entries));this.trees.set(sha,structuredClone(entries));return sha;}
  entries(head=this.branches.get('main')){return structuredClone(this.trees.get(this.commits.get(head).tree.sha));}
  setFiles(files){const head=this.commit(files,'seed',this.branches.get('main'));this.branches.set('main',head);return head;}
  advance(message='other change'){const parent=this.branches.get('main'),c=this.commits.get(parent),id=gitHash('commit '+(++this.seq));this.commits.set(id,{sha:id,tree:{sha:c.tree.sha},message,parent});this.branches.set('main',id);return id;}
  ancestor(target,head){for(let i=0;head&&i<1000;i++){if(target===head)return true;head=this.commits.get(head)?.parent;}return false;}
  getFile(path){const e=this.entries()[path];return e?this.blobs.get(e.sha):null;}
  async fetch(url,options={}){
    const root='https://api.github.com/repos/'+REPOSITORY;
    if(!String(url).startsWith(root))throw Error('Unexpected external host');
    if(options.headers.Authorization!=='Bearer unit-test-server-only-secret')throw Error('Credential not supplied by server');
    const path=String(url).slice(root.length),method=options.method||'GET',body=options.body?JSON.parse(options.body):undefined;
    const call={path,method,body};this.calls.push(call);
    if(this.hook){const override=await this.hook(call,this);if(override)return override;}
    const output=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
    if(path.startsWith('/git/ref/heads/')&&method==='GET'){const sha=this.branches.get(path.slice('/git/ref/heads/'.length));return sha?output({object:{sha}}):output({message:'Not Found'},404);}
    if(path.startsWith('/git/commits/')&&method==='GET'){const c=this.commits.get(path.slice('/git/commits/'.length));return c?output(c):output({},404);}
    if(path==='/git/blobs'&&method==='POST'){const bytes=body.encoding==='base64'?Buffer.from(body.content,'base64'):Buffer.from(body.content);return output({sha:this.blob(bytes)},201);}
    if(path.startsWith('/git/blobs/')&&method==='GET'){const b=this.blobs.get(path.slice('/git/blobs/'.length));return b?output({encoding:'base64',content:b.toString('base64'),size:b.length}):output({},404);}
    if(path.startsWith('/git/trees/')&&method==='GET'){const id=path.slice('/git/trees/'.length).split('?')[0],tree=this.trees.get(id);return output({tree:Object.values(tree||{}),truncated:false});}
    if(path==='/git/trees'&&method==='POST'){
      const tree=structuredClone(this.trees.get(body.base_tree)||{});
      for(const e of body.tree){if(e.sha===null)delete tree[e.path];else{const sha=e.sha||this.blob(Buffer.from(e.content));tree[e.path]={path:e.path,type:e.type,mode:e.mode,sha,size:this.blobs.get(sha)?.length||0};}}
      return output({sha:this.saveTree(tree)},201);
    }
    if(path==='/git/commits'&&method==='POST'){const id=gitHash('commit '+(++this.seq));this.commits.set(id,{sha:id,tree:{sha:body.tree},message:body.message,parent:body.parents[0]});return output({sha:id},201);}
    if(path==='/git/refs'&&method==='POST'){const branch=body.ref.replace('refs/heads/','');if(this.branches.has(branch))return output({},422);this.branches.set(branch,body.sha);return output({ref:body.ref,object:{sha:body.sha}},201);}
    if(path==='/git/refs/heads/main'&&method==='PATCH'){if(body.force!==false||!this.ancestor(this.branches.get('main'),body.sha))return output({},422);this.branches.set('main',body.sha);return output({object:{sha:body.sha}});}
    if(path.startsWith('/commits?')&&method==='GET'){const out=[];let id=this.branches.get('main');for(let i=0;id&&i<100;i++){const c=this.commits.get(id);out.push({sha:id,commit:{message:c.message}});id=c.parent;}return output(out);}
    if(path.startsWith('/compare/')&&method==='GET'){const[a,b]=path.slice(9).split('...');return output({merge_base_commit:{sha:this.ancestor(a,b)?a:this.commits.get(a)?.parent}});}
    throw Error('Unexpected GitHub operation '+method+' '+path);
  }
}
export async function harness(fn){
  const storage=new Storage(),git=new GithubMock(),env={GITHUB_UPLOAD_TOKEN:'unit-test-server-only-secret',SOIL_ADMIN_PASSWORD:'test-password-987654'};
  const state=new SoilManagedState({storage},env);
  env.SOIL_STATE={idFromName:name=>name,get:()=>state};
  const native=globalThis.fetch;globalThis.fetch=git.fetch.bind(git);
  let access='';
  const h={storage,git,env,state,
    async request(path,{method='GET',body,bytes,token=access,origin=ORIGIN,headers={},ip='192.0.2.1'}={}){
      const reqHeaders={...(origin===null?{}:{Origin:origin}),'CF-Connecting-IP':ip,...headers};
      if(token)reqHeaders.Authorization='Bearer '+token;
      if(body!==undefined)reqHeaders['Content-Type']='application/json';
      const req=new Request('https://soil-managed.test'+path,{method,headers:reqHeaders,...(bytes?{body:bytes}:body===undefined?{}:{body:JSON.stringify(body)})});
      const response=await worker.fetch(req,env);const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=null;}
      return{status:response.status,data,headers:response.headers,text};
    },
    async login(password=env.SOIL_ADMIN_PASSWORD,options={}){const r=await h.request('/v1/login',{method:'POST',body:{password},token:'',...options});if(r.status===200)access=r.data.accessToken;return r;},
    get token(){return access;},
    async seedUpload(kind='quality',override={}){
      const bytes=new Uint8Array([97,98,99]);const {sha256}=await import('../worker.mjs');
      const body={kind,idempotencyKey:crypto.randomUUID(),files:[{name:'沧州市_市级_测试.txt',size:bytes.length,sha256:await sha256(bytes),...(kind==='quality'?{quality:quality()}:{}),...override}]};
      const r=await h.request('/v1/uploads',{method:'POST',body});return{...r,body,bytes,id:r.data?.uploadId};
    }
  };
  try{return await fn(h);}finally{globalThis.fetch=native;}
}
export function quality(key='soilType',status='matched'){
  const unit=key==='soilType'?'沧州华江工程勘察设计有限公司':'河北平普数政科技有限公司';
  return{assignmentVersion:2,complete:true,batch:'2026年第二次第1批',dataKeys:[key],associationsByDataKey:{[key]:[{dataKey:key,city:'沧州市',unit,district:'沧州市',directoryStatus:status}]}};
}
