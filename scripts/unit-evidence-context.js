'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
function context(root=path.resolve(__dirname,'..')){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const master=html.match(/var masterList = \[[\s\S]*?\n\];/)[0];
 const mapping=fs.readFileSync(path.join(root,'task-unit-mappings.js'),'utf8');
 const document={readyState:'complete',getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},head:{appendChild(){}},createElement(){return {style:{},appendChild(){},classList:{add(){},toggle(){}}};}};
 const w={addEventListener(){},dispatchEvent(){},calculateDashboardStats(){return {};},renderMissingBanner(){},renderCities(){},mergeSubDistricts:{},SoilAdminImport:{state:{files:[]}}};w.window=w;
 const ctx={window:w,document,console,Set,Map,Event:function(){},CustomEvent:function(){},setTimeout(){},clearTimeout(){},fetch(){return Promise.resolve({ok:false});}};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('var masterList ='),html.indexOf('var soilTypeData =')),ctx);w.masterList=ctx.masterList;w.isDistrictMatched=ctx.isDistrictMatched;w.isMunicipalTask=ctx.isMunicipalTask;w.mergeSubDistricts=ctx.mergeSubDistricts;
 vm.runInContext(fs.readFileSync(path.join(root,'page-enhancements-core.js'),'utf8'),ctx);
 vm.runInContext(mapping,ctx);document.readyState='loading';
 for(const file of ['quality-file-routing.js','batch-policy.js','admin-auto-classifier.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
 const C=w.SoilAdminAutoClassifier,records=[],legacy={};
 for(const [key,name] of Object.entries({soilType:'soilTypeData',soilAttr:'soilAttrData',farmland:'farmlandData'})){
   const m=html.match(new RegExp('var '+name+' = (\\[[\\s\\S]*?\\n\\]);'));
   if(!m)throw Error('Missing legacy data '+name);
   legacy[name]=JSON.parse(m[1]);
   for(const c of legacy[name])for(const u of c.units)for(const d of u.districts)for(const doc of d.docs||[])records.push({dataKey:key,city:c.name,unit:u.name,district:d.label,batch:doc.batch,path:'data/'+doc.file,origin:'legacy',...Object.fromEntries(['unitCorrection','unitReviewRequired','unitReviewMessage'].filter(k=>k in doc).map(k=>[k,doc[k]]))});
 }
 const index=JSON.parse(fs.readFileSync(path.join(root,'data/admin-import-index.json'),'utf8'));
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'data/north-quality-feedback-package.json'),'utf8'));w.SoilQualityFileRouting.setAuthority(pkg);C.loadCatalogData(pkg);
 for(const record of index){
  if(record.kind!=='quality-control')continue;
  if(record.dataKey)records.push({...record,origin:'index'});
  else if(record.sharedSource){
   for(const k of record.dataKeys||[])for(const a of w.SoilQualityFileRouting.resolveTargets(record.targets,k,record.name).associations)records.push({...a,path:record.path,dataKey:k,batch:record.batch,origin:'shared-authority'});
  }
 }
 const lists={},hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 for(const key of Object.keys(C.typeLabels))lists[key]=C.listForKey(key);
 records.forEach(r=>{r.directory=C.directoryStatus(r.dataKey,r.city,r.unit,r.district);});
 return {root,w,ctx,C,html,legacy,index,records,lists,hashes:{master:hash(master),mapping:hash(mapping)}};
}
module.exports=context;
if(require.main===module){
 const c=context();
 if(process.argv.includes('--decide')){
  const inputs=JSON.parse(fs.readFileSync(0,'utf8'));
  process.stdout.write(JSON.stringify(inputs.map(r=>({directory:c.C.directoryStatus(r.dataKey,r.city,r.unit,r.district),evidence:c.C.unitEvidence(r.dataKey,r.city,r.district,r.unit)}))));
 }else process.stdout.write(JSON.stringify({lists:c.lists,records:c.records,hashes:c.hashes},null,2));
}
