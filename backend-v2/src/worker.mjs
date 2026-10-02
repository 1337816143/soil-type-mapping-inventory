import {DurableObject} from 'cloudflare:workers';
import {Service} from './service.mjs';
// One durable coordinator serializes this small collaboration site's mutations.
// No requests are forwarded to caller-provided hosts or repository paths.
export class UploadCoordinator extends DurableObject {
  constructor(state,env){super(state,env);this.env=env;this.state=state;this.service=new Service(env,state.storage);this.tail=Promise.resolve();this.waiting=0;}
  async fetch(request){
    if(this.waiting>=24){const origin=request.headers.get('origin')||'',headers={'Cache-Control':'no-store','Vary':'Origin'};if(String(this.env.ALLOWED_ORIGINS||'https://1337816143.github.io').split(',').map(s=>s.trim()).includes(origin))headers['Access-Control-Allow-Origin']=origin;return Response.json({ok:false,code:'BUSY',message:'上传服务忙，请稍后重试原任务。',requestId:crypto.randomUUID()},{status:503,headers});}
    this.waiting++;
    const job=this.tail.then(()=>this.service.handle(request));this.tail=job.catch(()=>{});
    try{return await job;}finally{this.waiting--;}
  }
  async alarm(){
    const expired=[];let startAfter;
    do {const entries=await this.state.storage.list({limit:500,...(startAfter?{startAfter}:{})});
      if(!entries.size)break;for(const [key,value] of entries){if(value.expires<=Date.now())expired.push(key);startAfter=key;}
      if(entries.size<500)break;
    } while(expired.length<1000);
    for(let i=0;i<expired.length;i+=128)await this.state.storage.delete(expired.slice(i,i+128));
    await this.state.storage.setAlarm(Date.now()+3600000);
  }
}
export default {async fetch(request,env){const id=env.COORDINATOR.idFromName('soil-managed-upload-v2');return env.COORDINATOR.get(id).fetch(request);}};
