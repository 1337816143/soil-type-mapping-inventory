'use strict';
// The two submitted screenshots, actual classifier, actual content gate, and
// actual manifest builder. All filesystem and GitHub writes are fixtures only.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const {C,w,ctx}=require('./unit-evidence-context')();
const initial=JSON.stringify(w.SoilTaskUnitLists);let checks=0,accepted=false,messages=[];
const fields={'adm-kind':{value:'quality'},'adm-data-key':{value:'reports'},'adm-directory':{value:'data/质控意见反馈_管理员导入'},'adm-new-directory':{value:''}};
ctx.document.getElementById=id=>fields[id]||null;
const Q=w.SoilAdminImport;Q.types=()=>C.typeLabels;Q.MAX=95*1024*1024;Q.progress=(message)=>messages.push(message);Q.renderPreview=()=>{};
ctx.confirm=()=>accepted;ctx.Q=Q;
const ui=fs.readFileSync('admin-import-v2.js','utf8');
vm.runInContext(ui.slice(ui.indexOf('Q.confirmQualityOnly=function('),ui.indexOf('\nfunction startUpload()')),ctx);
w.SoilRepoAdmin={tree:[],clean:p=>p,referenceRoot:'reference-files/third-soil-survey',indexPath:'data/admin-import-index.json'};
Q.destinationFor=i=>'data/质控意见反馈_管理员导入/'+i.file.name;
vm.runInContext(fs.readFileSync('hybrid-staged-upload.js','utf8').replace('  function stageWholeFile(','  window.__recognitionManifest=buildManifest;\n  function stageWholeFile('),ctx);
function verify(ok,label){assert(ok,label);checks++;}
function item(name,extra={}){return Object.assign({file:{name,size:16,lastModified:1,slice(){}},path:name,sourcePath:name},extra);}
const reportName='元氏县_总体、工作、数据报告-河北湛泸软件开发有限公司_2026年第二次第1批.pdf';
const attrName='黄骅市_土壤属性制图_河北玛恩农业科技有限公司_2026年第三次第1批.pdf';
const first=item(reportName),second=item(attrName);
for(const i of [first,second]){
 const m=C.applyItemMetadata(i);verify(m.assignment.complete,'Screenshot name resolves');
 verify(m.dataKeys.join()===(i===first?'reports':'soilAttr'),'Exact result category, no type/attribute swap');
 verify(i.batch===(i===first?'2026年第二次第1批':'2026年第三次第1批'),'Year round and batch preserved');
 i.manualAssociation={city:i.city,unit:i.unit,district:i.district};
 verify(C.applyItemMetadata(i).assignment.complete,'Complete manual geography stays complete');
}
verify(first.unit==='河北湛泸软件开发有限公司'&&first.city==='石家庄市','Other roster report association');
verify(second.unit==='河北玛恩农业科技有限公司'&&second.city==='沧州市','Other roster attribute association');
verify(!Q.confirmQualityOnly([first],'quality','reports'),'Declining ambiguous content prevents upload');
verify(C.qualityContentError(first,first.autoMeta).includes('须确认'),'Decline leaves confirmation pending');
verify(C.applyItemMetadata(first).assignment.complete,'Decline does not discard attribution');
assert.throws(()=>w.__recognitionManifest([first],'base','unconfirmed'),/须确认/);checks++;
accepted=true;verify(Q.confirmQualityOnly([first],'quality','reports'),'Content confirmed explicitly');
verify(!C.qualityContentError(first,first.autoMeta),'File-bound content review accepted');
const replacement=item(reportName);C.applyItemMetadata(replacement);
verify(!!C.qualityContentError(replacement,replacement.autoMeta),'New File with same name must be confirmed again');
first.manualBatch='2026年第三次第1批';C.applyItemMetadata(first);
verify(!!C.qualityContentError(first,first.autoMeta),'Changed attribution invalidates content confirmation');
delete first.manualBatch;C.applyItemMetadata(first);Q.confirmQualityOnly([first],'quality','reports');
for(const name of ['黄骅市_土壤类型制图_质控意见.pdf','黄骅市_土壤类型图件_质控意见.pdf'])verify(C.applyItemMetadata(item(name)).dataKeys.join()==='soilType','Type-map alias stays type');
for(const name of ['黄骅市_土壤属性制图_工作报告质控意见.pdf','土壤属性制图/黄骅市_质控意见.pdf','黄骅市_土壤属性图件_质控意见.pdf'])verify(C.applyItemMetadata(item(name)).dataKeys.join()==='soilAttr','Attribute-map aliases and nested directory');
const unknown=item('待核文件.pdf',{manualAssociation:{city:'沧州市',unit:'河北玛恩农业科技有限公司',district:'黄骅市'}});
let m=C.applyItemMetadata(unknown);verify(!m.assignment.complete&&m.assignment.issues[0].message.includes('尚缺：成果类型'),'Only missing field is named');
verify(!Q.confirmQualityOnly([unknown],'quality','soilAttr'),'Global dropdown does not silently override a missing row category');
unknown.manualDataKey='soilAttr';verify(C.applyItemMetadata(unknown).assignment.complete,'Per-file choice completes previously failed manual state');
verify(Q.confirmQualityOnly([unknown],'quality','soilAttr'),'Explicit file category reaches upload gate');
unknown.manualAssociation.unit='';m=C.applyItemMetadata(unknown);
verify(!m.assignment.complete&&m.assignment.issues[0].message.includes('尚缺：作业单位'),'Actual missing unit stays blocked');
for(const name of ['平山县_工作报告原件.pdf','平山县_总体报告正文.pdf','平山县_数据报告模板.pdf']){
 let i=item(name,{manualDataKey:'reports'});C.applyItemMetadata(i);
 verify(!Q.confirmQualityOnly([i],'quality','reports'),'Explicit original/template cannot be confirmed through quality uploader');
 assert.throws(()=>w.__recognitionManifest([i],'base','blocked'),/报告原件|参考资料/);checks++;
}
const folder=item('平山县_工作报告.pdf',{sourcePath:'质控意见/平山县_工作报告.pdf'});C.applyItemMetadata(folder);
verify(!!C.qualityContentError(folder,folder.autoMeta),'Parent folder cannot replace file content confirmation');
const renamed=item('元氏县_总体、工作、数据报告_质控意见_2026年第二次第1批.pdf');C.applyItemMetadata(renamed);
verify(renamed.autoMeta.assignment.complete&&!C.qualityContentStatus(renamed,renamed.autoMeta).required,'Explicit opinion naming recognized');
const manifests=[first,second,renamed].map((i,n)=>w.__recognitionManifest([i],'base','recognition-'+n));
for(const [n,manifest] of manifests.entries()){
 const f=manifest.files[0],key=n===1?'soilAttr':'reports';
 verify(f.quality.dataKeys.join()===key&&f.quality.complete,'Manifest persists typed selection');
 verify(f.quality.associationsByDataKey[key].length===1,'One physical file and one correct target');
}
verify(JSON.stringify(w.SoilTaskUnitLists)===initial,'Original rosters unchanged');
fs.mkdirSync('test-artifacts',{recursive:true});
fs.writeFileSync('test-artifacts/upload-recognition-manifests.json',JSON.stringify(manifests,null,2));
fs.writeFileSync('test-artifacts/upload-recognition-report.json',JSON.stringify({status:'passed',checks,reportName,attrName,rostersUnchanged:true},null,2));
console.log(`Upload recognition regression passed: ${checks} checks`);
