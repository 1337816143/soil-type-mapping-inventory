// Standalone candidate client; not loaded by the current production page.
// The only credential it accepts from a user is the administrator password.
// The GitHub token never reaches this module. Upload descriptors/files stay
// owned by the caller so a failed request cannot clear a draft or file picker.
export class ManagedUploadClient {
  #session='';
  constructor(endpoint,{fetcher=fetch,onProgress=()=>{}}={}){
    const url=new URL(endpoint);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('后台地址必须使用HTTPS');
    this.endpoint=url.origin;this.fetcher=fetcher;this.onProgress=onProgress;
  }
  async request(path,{method='GET',json,binary,key,timeout=45000}={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const headers={};if(this.#session)headers.Authorization='Bearer '+this.#session;
      if(key)headers['Idempotency-Key']=key;
      if(json!==undefined)headers['Content-Type']='application/json';
      if(binary!==undefined)headers['Content-Type']='application/octet-stream';
      const response=await this.fetcher(this.endpoint+path,{method,headers,body:json!==undefined?JSON.stringify(json):binary,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
      let data;try{data=await response.json();}catch{throw Object.assign(Error('后台返回了无法识别的响应，请保留当前任务并联系维护人员。'),{code:'INVALID_RESPONSE'});}
      if(!response.ok){if(data.code==='SESSION_EXPIRED')this.#session='';throw Object.assign(Error(data.message||'后台请求失败'),{code:data.code,requestId:data.requestId,status:response.status});}
      return data;
    }catch(e){
      if(e.name==='AbortError')throw Object.assign(Error('连接后台超时，请保留当前任务并查询状态，不要重复上传。'),{code:'BROWSER_TIMEOUT'});
      if(e instanceof TypeError)throw Object.assign(Error('浏览器未能连接后台，请检查网络或浏览器拦截。管理员密码无需更改。'),{code:'BROWSER_NETWORK'});
      throw e;
    }finally{clearTimeout(timer);}
  }
  async login(password){const data=await this.request('/v1/login',{method:'POST',json:{password}});this.#session=data.session;return {expiresIn:data.expiresIn};}
  async logout(){try{return await this.request('/v1/logout',{method:'POST'});}finally{this.#session='';}}
  async create(descriptor,key){return this.request('/v1/uploads',{method:'POST',json:descriptor,key});}
  async transfer(operation,files){
    if(operation.state!=='receiving')return operation;
    for(const spec of operation.files){const file=files[spec.index];if(!file)throw Error('缺少原文件，请重新选择相同文件后续传');
      for(let part=0;part<spec.partCount;part++){
        this.onProgress({stage:'uploading',uploadId:operation.uploadId,file:spec.index,part,total:spec.partCount});
        await this.request(`/v1/uploads/${operation.uploadId}/files/${spec.index}/parts/${part}`,{method:'PUT',binary:file.slice(part*operation.chunkBytes,(part+1)*operation.chunkBytes)});
      }
    }
    this.onProgress({stage:'finalizing',uploadId:operation.uploadId});
    return this.request('/v1/uploads/'+operation.uploadId+'/finalize',{method:'POST'});
  }
  async status(id){return this.request('/v1/uploads/'+id);}
  async planDelete(paths){return this.request('/v1/delete-plans',{method:'POST',json:{paths}});}
  async confirmDelete(planId){return this.request('/v1/delete-plans/'+planId+'/confirm',{method:'POST',json:{confirmed:true}});}
}
