/** Integration client only. No script tag or production handler is installed. */
export class ManagedUploadError extends Error {
  constructor(message,code,requestId='',status=0){super(message);this.code=code;this.requestId=requestId;this.status=status;}
}
async function digest(blob){const bytes=blob instanceof Blob?await blob.arrayBuffer():blob;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export class ManagedUploadClient {
  #base;#session='';#expires=0;
  constructor(baseURL){
    const u=new URL(baseURL);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new TypeError('后台地址必须是没有附加参数的HTTPS地址。');
    this.#base=u.href.replace(/\/$/,'');
  }
  async #request(path,{method='GET',body,bytes,sha,publicRoute=false}={}){
    const headers={};
    if(!publicRoute){if(!this.#session||Date.now()>=this.#expires)throw new ManagedUploadError('请重新输入管理员密码。','SESSION_EXPIRED');headers.Authorization='Bearer '+this.#session;}
    if(bytes){headers['Content-Type']='application/octet-stream';headers['X-Content-SHA256']=sha;}
    else if(body!==undefined)headers['Content-Type']='application/json';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
    try{
      const r=await fetch(this.#base+path,{method,headers,body:bytes||(body===undefined?undefined:JSON.stringify(body)),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
      let data;try{data=await r.json();}catch{throw new ManagedUploadError('后台响应格式异常，请保留本次上传编号。','SERVICE_RESPONSE',r.headers.get('X-Request-ID')||'',r.status);}
      if(!r.ok||!data.ok){if(data.code==='SESSION_EXPIRED'||data.code==='SESSION_REQUIRED'){this.#session='';this.#expires=0;}throw new ManagedUploadError(data.message||'后台操作失败。',data.code||'SERVICE_HTTP',data.requestId||'',r.status);}
      return data;
    }catch(e){
      if(e instanceof ManagedUploadError)throw e;
      throw new ManagedUploadError(e?.name==='AbortError'?'连接后台超时。请查询本次操作状态，不要重复建立上传任务。':'未能连接后台。请检查网络、代理或浏览器拦截；这不是密码错误。',e?.name==='AbortError'?'SERVICE_TIMEOUT':'SERVICE_NETWORK');
    }finally{clearTimeout(timer);}
  }
  async login(password){const r=await this.#request('/v1/login',{method:'POST',body:{password},publicRoute:true});this.#session=r.accessToken;this.#expires=r.expiresAt;return{expiresAt:r.expiresAt};}
  async logout(){try{if(this.#session)await this.#request('/v1/logout',{method:'POST'});}finally{this.#session='';this.#expires=0;}}
  async check(){return this.#request('/v1/check',{method:'POST'});}
  /** Keep the returned draft while retrying; never generate another key after an unknown POST result. */
  async prepare(kind,items){
    if(!Array.isArray(items)||!items.length)throw new TypeError('请先选择文件。');
    const files=[];
    for(const item of items){if(!(item.file instanceof Blob))throw new TypeError('文件数据不可用。');files.push({name:item.file.name,size:item.file.size,sha256:await digest(item.file),sourcePath:item.sourcePath||item.file.name,...(kind==='quality'?{quality:item.quality}:{directory:item.directory,relativePath:item.relativePath||item.file.name})});}
    return{idempotencyKey:crypto.randomUUID(),kind,files,uploadId:'',partBytes:0};
  }
  async begin(draft){const r=await this.#request('/v1/uploads',{method:'POST',body:{idempotencyKey:draft.idempotencyKey,kind:draft.kind,files:draft.files}});draft.uploadId=r.uploadId;draft.partBytes=r.partBytes;return r;}
  /** Binary parts are idempotent and verified by SHA-256. Native file objects stay with the caller. */
  async send(draft,items,onProgress=()=>{}){
    if(!draft.uploadId)await this.begin(draft);
    if(items.length!==draft.files.length)throw new TypeError('重试文件与本次上传不一致。');
    let uploaded=0,total=draft.files.reduce((n,f)=>n+f.size,0);
    for(let fi=0;fi<items.length;fi++){
      const file=items[fi].file,meta=draft.files[fi];
      if(file.name!==meta.name||file.size!==meta.size||await digest(file)!==meta.sha256)throw new TypeError('重试文件内容发生变化。');
      for(let offset=0,pi=0;offset<file.size;offset+=draft.partBytes,pi++){
        const part=file.slice(offset,offset+draft.partBytes);
        await this.#request(`/v1/uploads/${draft.uploadId}/files/${fi}/parts/${pi}`,{method:'PUT',bytes:part,sha:await digest(part)});
        uploaded+=part.size;onProgress({phase:'transferring',uploaded,total,percent:Math.floor(uploaded/total*90),uploadId:draft.uploadId});
      }
    }
    const r=await this.#request(`/v1/uploads/${draft.uploadId}/commit`,{method:'POST'});
    onProgress({phase:r.state,percent:r.state==='archived'?100:94,uploadId:draft.uploadId});return r;
  }
  async status(uploadId){return this.#request(`/v1/uploads/${uploadId}/status`);}
  async cancelUpload(uploadId){return this.#request(`/v1/uploads/${uploadId}/cancel`,{method:'POST'});}
  async previewDelete(paths){return this.#request('/v1/deletions/preview',{method:'POST',body:{paths}});}
  async confirmDelete(planId){return this.#request('/v1/deletions/commit',{method:'POST',body:{planId,confirmation:'DELETE'}});}
  async cancelDelete(planId){return this.#request('/v1/deletions/cancel',{method:'POST',body:{planId}});}
}
