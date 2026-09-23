'use strict';
const assert=require('assert'),fs=require('fs'),context=require('./unit-evidence-context');
const {C,w,records}=context();
const before=JSON.stringify(w.SoilTaskUnitLists),members=['丛台区','复兴区','峰峰矿区'];
const forbidden=/不计入(?:应交清单|应交|清单)?统计/;
let checks=0;
function check(value,msg){assert(value,msg);checks++;}
function sample(city,district,key,unit){
 const name=[city,district,C.typeLabels[key],unit||'', '质控意见','2026年第二次第1批.pdf'].filter(Boolean).join('_');
 const item={file:{name,size:33},path:name,sourcePath:name};
 return {item,meta:C.applyItemMetadata(item)};
}
for(const key of Object.keys(C.typeLabels)){
 const unit=key==='soilType'?'河北向力规划设计有限公司':'河北科沃生态科技有限公司';
 const wrong=key==='soilType'?'河北科沃生态科技有限公司':'河北向力规划设计有限公司';
 for(const d of members){
  let s=C.directoryStatus(key,'邯郸市',unit,d);
  check(!s.mismatch&&s.relation==='merged-member'&&s.message.includes('单独质控'),[key,d,'covered scope']);
  check(s.listedUnits.length===1&&s.listedUnits[0]===unit,'Result-specific company');
  s=C.directoryStatus(key,'邯郸市',wrong,d);
  check(s.mismatch&&s.code==='unit-mismatch'&&s.message.includes('合并区通讯录单位'),'Covered but wrong company stays red');
  for(const named of [unit,'']){
   let {item,meta}=sample('邯郸市',d,key,named);
   check(meta.assignment.complete&&item.unit===unit&&item.district===d,'New upload retains split task, no false outside confirmation');
   check(meta.assignment.byKey[key][0].directoryMessage.includes('单独质控'),'Preview and index metadata explain source');
  }
 }
 const no=C.directoryStatus(key,'邯郸市',unit,'永年区');
 check(no.code==='outside-list'&&no.message.includes('备注也未明确包含'),'Same company does not imply coverage');
}
for(const key of Object.keys(C.typeLabels))for(const row of C.mergedDirectoryRows(key)){
 const s=C.directoryStatus(key,row.city,row.unit,row.district);
 check(!s.mismatch&&s.relation==='merged-member','All recovered existing member scopes');
 check(!forbidden.test(s.message),'No excluded-statistics wording');
}
check(C.directoryStatus('soilType','邢台市','天津华勘检验测试有限公司','襄都区').relation==='merged-member','Original merged members are explained');
check(C.directoryStatus('soilType','石家庄市','河北盛图地理信息有限公司','井陉矿区').code==='matched','Explicit contained task outranks broad merge');
check(C.directoryStatus('soilType','石家庄市','河北高翔地理信息技术服务有限公司','井陉矿区').mismatch,'Do not borrow merged company over contained task');
check(C.directoryStatus('soilType','邯郸市','河北向力规划设计有限公司','邯山区').relation==='direct','Standalone entry takes precedence');
check(C.directoryStatus('soilType','邯郸市','河北向力规划设计有限公司','邯郸市').relation==='direct','Municipal task remains distinct');
check(C.directoryStatus('soilType','邢台市','河北向力规划设计有限公司','峰峰矿区').mismatch,'No cross-city borrowing');
check(!sample('邯郸市','丛台区_复兴区','soilType','').meta.assignment.complete,'Multiple split tasks need shared naming');
check(C.directoryStatus('soilType','保定市','河北玛恩农业科技有限公司','莲池区').mismatch,'No geographic guessing from city/company');
for(const r of records){
 const s=C.directoryStatus(r.dataKey,r.city,r.unit,r.district);
 check(!forbidden.test(s.message),'No stale wording for any mounted association');
}
check(C.cleanDirectoryMessage('旧提示；不计入应交清单统计。仍需核对')==='旧提示仍需核对','Legacy receipt sanitizer');
check(JSON.stringify(w.SoilTaskUnitLists)===before,'Original directory never mutated');
for(const name of ['admin-auto-classifier.js','admin-import-v2.js','chunked-staged-upload.js','hybrid-staged-upload.js'])check(!forbidden.test(fs.readFileSync(name,'utf8')),name+' contains retired UI wording');
const report={status:'passed',checks,actualAssociations:records.length,covered:members,uncovered:'永年区',directoryUnchanged:true};
fs.mkdirSync('test-artifacts',{recursive:true});fs.writeFileSync('test-artifacts/merged-directory-report.json',JSON.stringify(report,null,2));
console.log('Merged directory checks passed:',JSON.stringify(report));
