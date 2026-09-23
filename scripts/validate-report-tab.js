'use strict';
// Run actual classifier + hybrid manifest builder using the untouched rosters.
require('child_process').execFileSync(process.execPath,['scripts/validate-report-search.js'],{stdio:'inherit'});
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const {C,w,ctx,records,hashes}=require('./unit-evidence-context')();
const before=JSON.stringify(w.SoilTaskUnitLists),titles=['总体报告','工作报告','数据报告'];
const actual=JSON.stringify(records);let checks=0;
function verify(ok,msg){assert(ok,msg);checks++;}
function item(name,extra={}){const i=Object.assign({file:{name,size:16,slice(){}},path:name,sourcePath:name},extra);return {i,m:C.applyItemMetadata(i)};}
verify(C.listForKey('reports')===w.SoilTaskUnitLists.other,'Use other list by identity');
for(const kind of titles)for(const city of C.listForKey('reports'))for(const unit of city.items)for(const district of unit.districts){
 const {i,m}=item(`${city.city}_${district}_${kind}_质控意见_2026年第二次第1批.docx`);
 verify(m.dataKeys.join()==='reports'&&m.assignment.complete&&i.unit===unit.unit&&i.city===city.city&&i.district===district,'Typed report assignment '+[city.city,district,kind]);
}
for(const text of ['总体、工作、数据报告','总体报告','工作报告','数据报告']){
 const {m}=item('石家庄市_平山县_'+text+'.docx');verify(m.assignment.complete,'Report without QC suffix');
}
for(const text of ['总体报告模板.docx','工作报告编制指南.pdf','数据报告编制要求.pdf']){
 const {m}=item(text);verify(m.kind==='reference'&&!m.dataKeys.includes('reports'),'Do not move report references');
}
for(const text of ['平山县_土壤类型图_工作报告.docx','土壤类型图/平山县_工作报告.docx'])verify(C.inferDataKeys(text).join()==='soilType','Specialist work reports retain original category');
verify(C.inferDataKeys('平山县三普成果质控报告.docx').join()==='soilType,soilAttr,farmland','Shared original defaults stay 3 types');
const pkg=JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json','utf8'));
for(const doc of pkg.documents){const {m}=item(doc.filename,{file:{name:doc.filename,size:doc.size}});verify(m.catalogExact&&!m.dataKeys.includes('reports'),'28 authoritative reports unchanged');}
let named=item('石家庄市_平山县_工作报告_中地科勘察设计有限公司_质控意见.docx');
verify(named.i.unit==='中地科勘察设计有限公司'&&named.m.assignment.byKey.reports[0].directoryStatus==='unit-mismatch','Explicit name retained with red difference');
let merged=item('邯郸市_峰峰矿区_数据报告_质控意见.docx');
verify(merged.i.unit==='河北科沃生态科技有限公司'&&merged.m.assignment.complete,'Merged source uses other list');
let outside=item('邯郸市_永年区_总体报告_河北省农林科学院农业资源环境研究所_质控意见.docx');
verify(outside.m.assignment.canConfirmOutside,'Unlisted requires acknowledgement');
C.confirmOutside(outside.i);verify(outside.i.autoMeta.assignment.complete&&outside.i.autoMeta.assignment.byKey.reports[0].directoryStatus==='outside-list','Unlisted retains warning');
const selectors={'adm-kind':{value:'quality'},'adm-data-key':{value:'reports'},'adm-directory':{value:'data/质控意见反馈_管理员导入'},'adm-new-directory':{value:''}};
ctx.document.getElementById=id=>selectors[id]||null;
w.SoilAdminImport.MAX=95*1024*1024;w.SoilAdminImport.types=()=>C.typeLabels;w.SoilAdminImport.destinationFor=i=>'data/质控意见反馈_管理员导入/'+i.file.name;
w.SoilRepoAdmin={tree:[],clean:p=>p,referenceRoot:'reference-files/third-soil-survey',indexPath:'data/admin-import-index.json'};
vm.runInContext(fs.readFileSync('hybrid-staged-upload.js','utf8').replace('  function stageWholeFile(', '  window.__reportTestManifest=buildManifest;\n  function stageWholeFile('),ctx);
const samples=titles.map((title,index)=>{
 const {i}=item(`石家庄市_平山县_${title}_质控意见_2026年第二次第1批.docx`);
 const manifest=w.__reportTestManifest([i],'base','report-fixture-'+index),f=manifest.files[0];
 verify(f.quality.dataKeys.join()==='reports'&&f.quality.associationsByDataKey.reports[0].unit==='河北湛泸软件开发有限公司','Manifest type and unit');
 verify(f.targetPath.includes('/总体、工作、数据报告/')&&!f.quality.shared,'New category path, not north shared path');
 return manifest;
});
// An explicit overall report with the words 三普成果/质控报告 must not fall into north routing.
let explicit=item('平山县三普成果总体报告质控报告.docx');
verify(explicit.m.assignment.complete&&explicit.m.dataKeys.join()==='reports'&&!explicit.m.targets.length,'Report family not shared north');
const f=w.__reportTestManifest([explicit.i],'base','report-explicit').files[0];
verify(!f.quality.shared&&f.targetPath.includes('/总体、工作、数据报告/'),'Manifest preserves report category');
verify(JSON.stringify(w.SoilTaskUnitLists)===before&&JSON.stringify(records)===actual,'Directory and actual records unchanged');
verify(hashes.master==='ae80ce5de012806935cf9ce6a739212954338d3670b3b652e8b96e1d544dce52'&&hashes.mapping==='00cf15e864c6cc479058b721768e381de3a15420a1be86f8018ebd1163d597e8','Original roster hashes');
fs.mkdirSync('test-artifacts',{recursive:true});
fs.writeFileSync('test-artifacts/report-tab-manifests.json',JSON.stringify(samples,null,2));
fs.writeFileSync('test-artifacts/report-tab-matching.json',JSON.stringify({status:'passed',checks,kinds:titles,actualRecords:records.length,rostersUnchanged:true},null,2));
console.log('Report family checks passed:',checks,'checks; original rosters and records unchanged');
