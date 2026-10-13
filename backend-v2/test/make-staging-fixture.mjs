import fs from 'node:fs';
import path from 'node:path';
import {descriptors,manifest,TYPES,CHUNK,REFERENCE_ROOT} from '../src/policy.mjs';
import {sha} from '../src/service.mjs';
import DIRECTORY from '../src/directory.mjs';
const root=path.resolve(process.argv[2]),kind=process.argv[3],payloads=[];
const file=async(name,kindKey,large=false)=>{
 const data=large?new Uint8Array(CHUNK+29).fill(38):new TextEncoder().encode('ISOLATED BACKEND BYTE FIXTURE '+name);
 payloads.push(data);
 const f={name,size:data.length,sha256:await sha(data)};
 if(kind==='quality'){
  const task=DIRECTORY.tasks[kindKey].find(r=>r.city==='沧州市'&&r.district==='沧州市');
  Object.assign(f,{batch:'2026年第二次第1批',associations:[{dataKey:kindKey,city:task.city,unit:task.unit,district:task.district}]});
 }else f.directory=REFERENCE_ROOT+'/后台测试';
 return f;
};
const files=[];
if(kind==='quality'){
 for(const [key,name] of Object.entries(TYPES)){
  for(const subtype of key==='reports'?['总体报告','工作报告','数据报告']:[name])files.push(await file('沧州市_市级_'+subtype+'_测试.txt',key,key==='soilType'));
 }
}else{files.push(await file('参考文件整文件测试.txt'));files.push(await file('参考文件分块测试.txt',null,true));}
const normalized=descriptors({kind,files}),id='svc-00000000-0000-4000-8000-000000000001';
const op={...normalized,id,baseHead:'0'.repeat(40),createdAt:new Date().toISOString(),branch:(kind==='quality'?'soil-upload-':'reference-upload-')+id};
const m=manifest(op),prefix=kind==='quality'?'.soil-upload':'.reference-upload';
function write(p,data){const dst=path.join(root,p);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,data);}
for(const [i,f] of m.files.entries())for(const [j,p] of (f.whole?[f.whole]:f.chunks).entries())write(p.path,payloads[i].slice(j*CHUNK,(j+1)*CHUNK));
const manifestPath=prefix+'/'+id+'/manifest.json';write(manifestPath,JSON.stringify(m));write(prefix+'/ready.json',JSON.stringify({schemaVersion:3,uploadId:id,manifestPath}));
write('expectation.json',JSON.stringify(m.files.map((f,i)=>({target:f.targetPath,sha256:files[i].sha256}))));
