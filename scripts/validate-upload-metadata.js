'use strict';
// Exact screenshot names + actual importer normalization and manifest builder.
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
let {item:raw,meta}=sample(rawName);
check(meta.dataKeys.join()==='reports','The report category is known, not misreported as missing');
check(!meta.assignment.complete&&meta.assignment.issues[0].code==='report-opinion-unconfirmed','Do not auto-accept report originals by filename');
check(raw.city==='石家庄市'&&raw.unit==='河北湛泸软件开发有限公司'&&raw.district==='元氏县','Keep already resolved geography while checking nature');
C.confirmReportOpinion(raw);meta=C.applyItemMetadata(raw);
check(meta.assignment.complete&&meta.reportOpinion.confirmed,'Explicit content attestation resolves this known opinion');
for(const change of [{size:33},{lastModified:101},{name:'其他报告.pdf'}]){
 let changed={...raw,file:{...raw.file,...change}};
 check(!C.reportOpinionState(changed,['reports']).confirmed,'Attestation is invalid for replaced file');
}
let removed={...raw};delete removed.qualityOpinionConfirmation;
check(!C.applyItemMetadata(removed).assignment.complete,'Revocation requires new confirmation');
let renamed=sample(rawName.replace('数据报告-','数据报告质控意见-'));
check(renamed.meta.assignment.complete&&!renamed.meta.reportOpinion.required,'Properly renamed quality opinion does not inherit stale rejection');
let attr=sample(attributeName);
check(attr.meta.dataKeys.join()==='soilAttr'&&attr.item.unit==='河北玛恩农业科技有限公司','Property mapping alias uses other list, never type map list');
check(attr.meta.assignment.complete&&attr.item.batch==='2026年第三次第1批','Third round batch and complete alias assignment');
for(const [word,key] of [['土壤属性图','soilAttr'],['土壤属性制图','soilAttr'],['土壤类型图','soilType'],['土壤类型制图','soilType']]){
 let example=sample('平山县_'+word+'_质控意见_2026年第三次第1批.pdf');
 check(example.meta.dataKeys.join()===key&&example.meta.assignment.complete,word+' recognized');
 check(example.item.unit===(key==='soilType'?'中地科勘察设计有限公司':'河北湛泸软件开发有限公司'),'Never mix type-specific companies');
}
const manual={city:'沧州市',unit:'河北玛恩农业科技有限公司',district:'黄骅市'};
let unknown=sample('附件01.pdf',{manualAssociation:manual});
check(!unknown.meta.assignment.complete&&C.matchingDescription(unknown.meta).includes('尚未填写：成果类型。'),'Only the actually missing type is requested');
unknown.item.manualDataKey='soilAttr';
check(C.applyItemMetadata(unknown.item).assignment.complete,'Type correction retains completed city/company/task');
for(const text of ['总体报告模板.pdf','工作报告编制指南.docx','数据报告编制要求.pdf']){
 let m=sample(text).meta;check(m.kind==='reference'&&!m.reportOpinion.required,'Reference documents remain isolated');
}
for(const text of ['总体报告','工作报告','数据报告','总体、工作、数据报告']){
 check(!C.inferDataKeys('元氏县_'+text+'.pdf').includes('reports'),'Filename-only inference must not call an original a quality opinion');
 let m=sample('元氏县_'+text+'_质控意见.pdf').meta;
 check(m.assignment.complete&&!m.reportOpinion.required,'Explicit opinions are accepted');
}
const pkg=JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json','utf8'));
for(const doc of pkg.documents){let m=sample(doc.filename,{file:{name:doc.filename,size:doc.size}}).meta;check(m.catalogMatched&&!m.dataKeys.includes('reports'),'Authority reports keep only original three categories');}
// Load the real importer without DOM installation; only public normalizers run.
w.SoilRepoAdmin={tree:[],clean:p=>p,base:p=>p.split('/').pop(),esc:String,size:String,referenceRoot:'reference-files/third-soil-survey',indexPath:'data/admin-import-index.json'};
w.SoilAdminImport.types=()=>C.typeLabels;w.SoilAdminImport.MAX=95*1024*1024;w.SoilAdminImport.progress=(text)=>{w.lastProgress=text;};
vm.runInContext(fs.readFileSync('admin-import-v2.js','utf8'),ctx);
let q=w.SoilAdminImport;q.state.manualDataKey='soilAttr';
let prepared=q.normalizePreparedFiles([{file:unknown.item.file,path:'附件01.pdf',manualAssociation:manual}])[0];
check(prepared.manualDataKey==='soilAttr'&&C.applyItemMetadata(prepared).assignment.complete,'Type explicitly chosen before picking survives normalizer');
q.state.manualDataKey='reports';prepared=q.normalizePreparedFiles([{...raw}])[0];
check(prepared.qualityOpinionConfirmation.signature===raw.qualityOpinionConfirmation.signature&&C.applyItemMetadata(prepared).assignment.complete,'Preparation preserves attestation');
q.state.manualDataKey='soilType';prepared=q.normalizePreparedFiles([{...attr.item,manualDataKey:''}])[0];
check(C.applyItemMetadata(prepared).dataKeys.join()==='soilAttr','Per-file automatic mode overrides a bulk default');
let unsigned=sample(rawName);check(!q.validateQualityMetadata([unsigned.item]),'Upload preflight rejects unconfirmed nature');
check(w.lastProgress.includes('确认是质控意见'),'Actionable nature message instead of generic missing fields');
ctx.confirm=()=>true;
check(!q.confirmQualityOnly([unsigned.item],'quality','soilType'),'A different global tab cannot bypass the report guard');
check(q.validateQualityMetadata([raw,attr.item]),'Known opinions pass preflight');
check(q.confirmQualityOnly([raw],'quality','reports'),'Attested opinions pass ordinary upload confirmation');
vm.runInContext(fs.readFileSync('hybrid-staged-upload.js','utf8').replace('  function stageWholeFile(', '  window.__metadataManifest=buildManifest;\n  function stageWholeFile('),ctx);
let manifests=[];
for(const i of [raw,renamed.item,attr.item,unknown.item]){
 const m=w.__metadataManifest([i],'base','metadata-'+manifests.length),f=m.files[0];
 check(f.quality.complete&&Object.keys(f.quality.associationsByDataKey).length===1,'Actual manifest contains complete typed assignment');
 check(f.originalName===i.file.name&&f.size===i.file.size,'No client filename or byte rewriting');
 manifests.push(m);
}
check(manifests[0].files[0].quality.opinionConfirmation.kind==='quality-opinion','Attestation enters staged manifest');
check(manifests[2].files[0].quality.dataKeys.join()==='soilAttr'&&manifests[2].files[0].quality.batch==='2026年第三次第1批','Alias and third round reach actual manifest');
assert.throws(()=>w.__metadataManifest([unsigned.item],'base','bad'),/确认是质控意见/);count++;
check(JSON.stringify(w.SoilTaskUnitLists)===roster&&JSON.stringify(records)===original,'Directory and original associations unchanged');
check(hashes.master==='ae80ce5de012806935cf9ce6a739212954338d3670b3b652e8b96e1d544dce52'&&hashes.mapping==='00cf15e864c6cc479058b721768e381de3a15420a1be86f8018ebd1163d597e8','Original roster hashes unchanged');
fs.mkdirSync('test-artifacts',{recursive:true});
fs.writeFileSync('test-artifacts/upload-metadata-unit.json',JSON.stringify({status:'passed',checks:count,recordsChecked:records.length,screenshots:[rawName,attributeName],rostersUnchanged:true},null,2));
fs.writeFileSync('test-artifacts/upload-metadata-manifests.json',JSON.stringify(manifests,null,2));
console.log('Upload metadata regression passed:',count,'checks');
