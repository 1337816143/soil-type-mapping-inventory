'use strict';
// Execute the real classifier, importer normalizer and staged-manifest builder.
// The owner has removed document-nature checking, not metadata validation.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {C,w,ctx,records,hashes}=require('./unit-evidence-context')();
const roster=JSON.stringify(w.SoilTaskUnitLists),original=JSON.stringify(records);
const selectors={
 'adm-kind':{value:'quality'},'adm-data-key':{value:'reports'},'adm-batch':{value:'2026年第三次第1批'},
 'adm-directory':{value:'data/质控意见反馈_管理员导入'},'adm-new-directory':{value:''}
};
ctx.document.getElementById=id=>selectors[id]||null;
let count=0;function check(ok,message){assert(ok,message);count++;}
function sample(name,extra={}){let item={file:{name,size:32,lastModified:100,slice(){}},path:name,sourcePath:name,...extra};return {item,meta:C.applyItemMetadata(item)};}
const rawName='元氏县_总体、工作、数据报告-河北湛泸软件开发有限公司_2026年第二次第1批.pdf';
const attributeName='黄骅市_土壤属性制图_河北玛恩农业科技有限公司_2026年第三次第1批.pdf';
const {item:raw,meta}=sample(rawName);
check(meta.dataKeys.join()==='reports'&&meta.assignment.complete,'Screenshot 1 works unchanged, no content confirmation');
check(raw.city==='石家庄市'&&raw.unit==='河北湛泸软件开发有限公司'&&raw.district==='元氏县','Use other roster');
check(!('reportOpinion' in meta)&&!C.reportOpinionState&&!C.confirmReportOpinion,'No document-nature APIs or flags');
const stale=sample(rawName,{qualityOpinionConfirmation:{signature:'old',kind:'quality-opinion'}});
check(stale.meta.assignment.complete&&!('reportOpinion' in stale.meta),'Old optional confirmation cannot block or override metadata');
const renamed=sample(rawName.replace('数据报告-','数据报告质控意见-'));
check(renamed.meta.assignment.complete&&renamed.item.unit===raw.unit,'Adding opinion marker is optional');
const attr=sample(attributeName);
check(attr.meta.dataKeys.join()==='soilAttr'&&attr.item.unit==='河北玛恩农业科技有限公司','Property alias uses other list, never type-map list');
check(attr.meta.assignment.complete&&attr.item.batch==='2026年第三次第1批','Third-round first batch preserved');
for(const [word,key] of [['土壤属性图','soilAttr'],['土壤属性制图','soilAttr'],['土壤类型图','soilType'],['土壤类型制图','soilType']]){
 const x=sample('平山县_'+word+'_2026年第三次第1批.pdf');
 check(x.meta.dataKeys.join()===key&&x.meta.assignment.complete,word+' needs no opinion marker');
 check(x.item.unit===(key==='soilType'?'中地科勘察设计有限公司':'河北湛泸软件开发有限公司'),'No cross-type company borrowing');
}
const manual={city:'沧州市',unit:'河北玛恩农业科技有限公司',district:'黄骅市'};
const unknown=sample('附件01.pdf',{manualAssociation:manual});
check(!unknown.meta.assignment.complete&&C.matchingDescription(unknown.meta).includes('尚未填写：成果类型。'),'Only genuine missing metadata blocks');
unknown.item.manualDataKey='soilAttr';
check(C.applyItemMetadata(unknown.item).assignment.complete,'Manual type does not require filename classification');
for(const text of ['总体报告模板.pdf','工作报告编制指南.docx','数据报告编制要求.pdf']){
 const m=sample(text).meta;check(m.kind==='reference'&&!m.dataKeys.includes('reports'),'Reference routing unchanged');
}
for(const text of ['总体报告','工作报告','数据报告','总体、工作、数据报告','总体、工作、数据报告-反馈']){
 for(const marker of ['','_质控意见']){
  const x=sample('元氏县_'+text+marker+'.pdf');
  check(x.meta.dataKeys.join()==='reports'&&x.meta.assignment.complete,'Marker-free report category is a routing hint, not content classification');
 }
}
const explicit=sample('附件03.pdf',{manualDataKey:'reports',manualAssociation:{city:'石家庄市',unit:'河北湛泸软件开发有限公司',district:'平山县'}});
check(explicit.meta.assignment.complete,'Reports can be explicitly selected without any report keywords');
const pkg=JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json','utf8'));
for(const doc of pkg.documents){const m=sample(doc.filename,{file:{name:doc.filename,size:doc.size}}).meta;check(m.catalogMatched&&!m.dataKeys.includes('reports'),'Authority scope remains three original types');}
w.SoilRepoAdmin={tree:[],clean:p=>p,base:p=>p.split('/').pop(),esc:String,size:String,referenceRoot:'reference-files/third-soil-survey',indexPath:'data/admin-import-index.json'};
w.SoilAdminImport.types=()=>C.typeLabels;w.SoilAdminImport.MAX=95*1024*1024;w.SoilAdminImport.progress=(text)=>{w.lastProgress=text;};
vm.runInContext(fs.readFileSync('admin-import-v2.js','utf8'),ctx);
const q=w.SoilAdminImport;
ctx.confirm=()=>{throw Error('No document-nature confirmation is allowed');};
check(!q.confirmQualityOnly,'No pre-upload document-nature gate');
q.state.manualDataKey='soilAttr';
let prepared=q.normalizePreparedFiles([{file:unknown.item.file,path:'附件01.pdf',manualAssociation:manual}])[0];
check(prepared.manualDataKey==='soilAttr'&&C.applyItemMetadata(prepared).assignment.complete,'Type selected before pick survives preparation');
q.state.manualDataKey='reports';prepared=q.normalizePreparedFiles([{...raw}])[0];
check(C.applyItemMetadata(prepared).assignment.complete,'Marker-free reports survive preparation');
q.state.manualDataKey='soilType';prepared=q.normalizePreparedFiles([{...attr.item,manualDataKey:''}])[0];
check(C.applyItemMetadata(prepared).dataKeys.join()==='soilAttr','Per-file automatic mode outranks bulk default');
const incomplete=sample('附件01.pdf',{manualAssociation:manual});
check(!q.validateQualityMetadata([incomplete.item]),'Reject genuinely missing type before bytes');
check(w.lastProgress.includes('尚未填写：成果类型。'),'Missing-field explanation stays precise');
check(q.validateQualityMetadata([raw,attr.item,explicit.item]),'Complete uploads need no nature confirmation');
vm.runInContext(fs.readFileSync('hybrid-staged-upload.js','utf8').replace('  function stageWholeFile(', '  window.__metadataManifest=buildManifest;\n  function stageWholeFile('),ctx);
const manifests=[];
for(const i of [raw,renamed.item,attr.item,unknown.item,explicit.item,stale.item]){
 const m=w.__metadataManifest([i],'base','metadata-'+manifests.length),f=m.files[0];
 check(f.quality.complete&&Object.keys(f.quality.associationsByDataKey).length===1,'Real staged manifest keeps complete association');
 check(f.originalName===i.file.name&&f.size===i.file.size,'Filename and file bytes are untouched');
 check(!('opinionConfirmation' in f.quality),'No new attestation receipts (historical records untouched)');
 manifests.push(m);
}
check(manifests[2].files[0].quality.dataKeys.join()==='soilAttr'&&manifests[2].files[0].quality.batch==='2026年第三次第1批','Alias and batch reach actual upload manifest');
assert.throws(()=>w.__metadataManifest([incomplete.item],'base','bad'),/成果类型/);count++;
for(const path of ['admin-auto-classifier.js','admin-import-v2.js','admin-import-v2-bridge.js','hybrid-staged-upload.js','dashboard-extension.js']){
 check(!/reportOpinionState|confirmReportOpinion|confirmQualityOnly|confirm-report-opinion|qualityOpinionConfirmation|不上传任何(?:报告|成果)原件/.test(fs.readFileSync(path,'utf8')),'No retired nature guard in '+path);
}
check(JSON.stringify(w.SoilTaskUnitLists)===roster&&JSON.stringify(records)===original,'Directories and existing associations unchanged');
check(hashes.master==='ae80ce5de012806935cf9ce6a739212954338d3670b3b652e8b96e1d544dce52'&&hashes.mapping==='00cf15e864c6cc479058b721768e381de3a15420a1be86f8018ebd1163d597e8','Original roster hash');
fs.mkdirSync('test-artifacts',{recursive:true});
fs.writeFileSync('test-artifacts/upload-metadata-unit.json',JSON.stringify({status:'passed',checks:count,recordsChecked:records.length,screenshotNames:[rawName,attributeName],rostersUnchanged:true,noNatureConfirmation:true},null,2));
fs.writeFileSync('test-artifacts/upload-metadata-manifests.json',JSON.stringify(manifests,null,2));
console.log('Upload metadata regression passed:',count,'checks');
