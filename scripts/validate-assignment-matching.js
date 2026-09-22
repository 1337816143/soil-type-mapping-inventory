'use strict';
// Exercise the actual embedded lists, not a test-only one-company mapping.
const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const html=fs.readFileSync('index.html','utf8');
const originalList=html.match(/var masterList = \[[\s\S]*?\n\];/)[0];
const originalMapping=fs.readFileSync('task-unit-mappings.js','utf8');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
assert.strictEqual(hash(originalMapping),'00cf15e864c6cc479058b721768e381de3a15420a1be86f8018ebd1163d597e8','Embedded type mapping changed');
assert.strictEqual(hash(originalList),'ae80ce5de012806935cf9ce6a739212954338d3670b3b652e8b96e1d544dce52','Embedded base list changed');
const selectors={'adm-kind':{value:'quality'},'adm-data-key':{value:'soilType'},'adm-directory':{value:'data/质控意见反馈_管理员导入'},'adm-new-directory':{value:''}};
const doc={readyState:'loading',addEventListener(){},getElementById(id){return selectors[id]||null;},querySelector(){return null},createElement(){return {style:{},classList:{toggle(){},add(){}},appendChild(){},querySelector(){return null;}}},head:{appendChild(){}}};
const w={calculateDashboardStats(){},renderMissingBanner(){},SoilAdminImport:{state:{files:[]},MAX:95*1024*1024,types(){return w.SoilAdminAutoClassifier.typeLabels;},destinationFor(i){return 'data/质控意见反馈_管理员导入/'+i.file.name;}},SoilRepoAdmin:{tree:[],clean(p){return p;},referenceRoot:'reference-files/third-soil-survey',indexPath:'data/admin-import-index.json'}};
const ctx={window:w,document:doc,console,Set,Map,Event:function(){},CustomEvent:function(){},setTimeout(){},clearTimeout(){},fetch(){return Promise.resolve({ok:false});}};
w.window=w;vm.createContext(ctx);vm.runInContext(originalList,ctx);w.masterList=ctx.masterList;
doc.readyState='complete';vm.runInContext(originalMapping,ctx);doc.readyState='loading';
const registryBefore=JSON.stringify(w.SoilTaskUnitLists),masterBefore=JSON.stringify(w.masterList);
vm.runInContext(fs.readFileSync('quality-file-routing.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('batch-policy.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('admin-auto-classifier.js','utf8'),ctx);
const C=w.SoilAdminAutoClassifier,R=w.SoilQualityFileRouting;
let checks=0;
function item(name,extra={}){return Object.assign({file:{name,size:16,slice(){}},path:name,sourcePath:name},extra);}
function classify(name,extra){let i=item(name,extra),m=C.applyItemMetadata(i);checks++;return {i,m};}
function row(name,key,extra){const {m}=classify(name,extra);assert(m.assignment.complete,JSON.stringify(m.assignment.issues));assert(m.assignment.byKey[key].length===1);return m.assignment.byKey[key][0];}
function unitFor(key,city,district){const list=C.listForKey(key);return list.find(c=>c.city===city).items.find(u=>u.districts.includes(district)).unit;}
assert.strictEqual(row('平山县_土壤类型图_质控意见_2026年第二次第1批.docx','soilType').unit,unitFor('soilType','石家庄市','平山县'));
assert.strictEqual(row('平山县_土壤属性图_质控意见_2026年第二次第1批.docx','soilAttr').unit,unitFor('soilAttr','石家庄市','平山县'));
assert.notStrictEqual(unitFor('soilType','石家庄市','平山县'),unitFor('soilAttr','石家庄市','平山县'));
// Parent city is context, not a second task; corporation city names are ignored.
assert.strictEqual(row('石家庄市_平山县_土壤类型图_质控意见.docx','soilType').district,'平山县');
const expected=unitFor('soilAttr','石家庄市','平山县');
let explicit=row('石家庄市_平山县_土壤类型图_'+expected+'_质控意见_2026年第二次第1批.docx','soilType');
assert.strictEqual(explicit.unit,expected);assert.strictEqual(explicit.unitSource,'filename');assert(explicit.note.includes('不改清单'));
explicit=row('平山县_土壤类型图_河北示例新任作业有限公司_质控意见.docx','soilType');assert.strictEqual(explicit.unit,'河北示例新任作业有限公司');
assert.strictEqual(row('平山县_土壤类型图_'+expected+'_质控意见.docx','soilType',{sourcePath:'中地科勘察设计有限公司/平山县_土壤类型图_'+expected+'_质控意见.docx'}).unit,expected);
assert.strictEqual(row('平山县_土壤类型图_质控意见.docx','soilType',{sourcePath:expected+'/平山县_土壤类型图_质控意见.docx'}).unitSource,'type-district-list');
assert.strictEqual(row('乐亭县_土壤类型图_农业农村部环境保护科研监测所（牵头人） + 山东省物化探勘查院_质控意见.docx','soilType').unit,unitFor('soilType','唐山市','乐亭县'));
let bad=classify('平山县_土壤类型图_河北示例甲有限公司_河北示例乙有限公司_质控意见.docx').m;
assert(!bad.assignment.complete);assert(bad.assignment.issues.some(e=>e.code==='multiple-companies'));
bad=classify('平山县_土壤类型图_质控意见.docx',{city:'沧州市',unit:'旧猜测单位',district:'青县'});
assert.strictEqual(bad.i.unit,unitFor('soilType','石家庄市','平山县'));
bad=classify('质控意见_土壤类型图.docx',{city:'沧州市',unit:'旧猜测单位',district:'青县'});
assert(!bad.m.assignment.complete);assert.strictEqual(bad.i.unit,'');assert(bad.m.assignment.issues[0].code==='missing-district');
bad=classify('保定市_平山县_土壤类型图_质控意见.docx').m;assert(!bad.assignment.complete);assert(bad.assignment.issues.some(e=>e.code==='city-district-conflict'));
bad=classify('合并区_土壤类型图_质控意见.docx').m;assert(!bad.assignment.complete);assert(bad.assignment.issues.some(e=>e.code==='ambiguous-region'));
assert.strictEqual(row('保定市_合并区_土壤类型图_质控意见.docx','soilType').district,'合并区');
assert.strictEqual(row('保定市_市级_土壤类型图_质控意见.docx','soilType').district,'市级汇总');
assert.strictEqual(row('石家庄市_井陉县（含矿区）_土壤类型图_质控意见.docx','soilType').district,'井陉县（含矿区）');
assert.strictEqual(row('孟村回族自治县_土壤类型图_质控意见.docx','soilType').district,'孟村县');
let multi=classify('平山县_土壤类型图_土壤属性图_质控意见_2026年第二次第1批.docx');
assert(multi.m.assignment.complete);assert.strictEqual(multi.i.unit,'');
assert.notStrictEqual(multi.m.assignment.byKey.soilType[0].unit,multi.m.assignment.byKey.soilAttr[0].unit);
// All actual single-type task rows must resolve without consulting other types.
let audited=0;
for(const key of Object.keys(C.typeLabels)){
 for(const city of C.listForKey(key))for(const u of city.items)for(const d of u.districts){
  const r=row(city.city+'_'+d+'_'+C.typeLabels[key]+'_质控意见.docx',key);
  assert.strictEqual(r.city,city.city);assert.strictEqual(r.district,d);assert.strictEqual(r.unit,u.unit,[key,city.city,d,r.unit,u.unit].join(' / '));audited++;
 }
}
// Explicit manual selections stay distinct from stale importer guesses.
const manual={city:'石家庄市',unit:'人工指定有限公司',district:'平山县'};
const mr=row('平山县_土壤类型图_质控意见.docx','soilType',{manualAssociation:manual});assert.strictEqual(mr.unit,manual.unit);assert.strictEqual(mr.unitSource,'manual');
assert(!classify('平山县_土壤类型图_质控意见.docx',{manualAssociation:{city:'石家庄市'}}).m.assignment.complete);
const partial=classify('平山县_土壤类型图_质控意见.docx',{manualAssociation:{city:'沧州市',unit:'',district:''}});
assert(!partial.m.assignment.complete);assert.strictEqual(partial.i.city,'沧州市');assert.strictEqual(partial.i.unit,'');
// New multi-area reports and the existing 28 registered reports keep one source.
let shared=classify('乐亭县、丰南区三普成果质控报告_2026年第二次第1批.docx');
assert(shared.m.assignment.complete);assert.notStrictEqual(shared.m.assignment.byKey.soilType[0].unit,shared.m.assignment.byKey.soilAttr[0].unit);
const namedShared=classify('乐亭县、丰南区三普成果质控报告_河北示例新任作业有限公司_2026年第二次第1批.docx');
assert(namedShared.m.assignment.complete);for(const rs of Object.values(namedShared.m.assignment.byKey))for(const r of rs)assert.strictEqual(r.unit,'河北示例新任作业有限公司');
let pkg=JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json','utf8'));R.setAuthority(pkg);C.loadCatalogData(pkg);
for(const d of pkg.documents){let i=item(d.filename);i.file.size=d.size;let m=C.applyItemMetadata(i);assert(m.catalogExact);assert.strictEqual(m.assignment,null);assert.strictEqual(m.unresolvedTargets.length,0);checks++;}
// Call the real manifest builder in a VM-only test hook; no transport request.
vm.runInContext(fs.readFileSync('hybrid-staged-upload.js','utf8').replace('  function stageWholeFile(', '  window.__testManifest=buildManifest;\n  function stageWholeFile('),ctx);
for(const {i,m} of [multi,shared,namedShared]){
 const manifest=w.__testManifest([i],'base','test-id');const file=manifest.files[0];
 assert.strictEqual(manifest.files.length,1);assert.strictEqual(file.quality.complete,true);
 assert.deepStrictEqual(JSON.parse(JSON.stringify(file.quality.associationsByDataKey)),JSON.parse(JSON.stringify(m.assignment.byKey)));
 checks++;
}
assert.strictEqual(JSON.stringify(w.SoilTaskUnitLists),registryBefore);assert.strictEqual(JSON.stringify(w.masterList),masterBefore);
assert.strictEqual(fs.readFileSync('task-unit-mappings.js','utf8'),originalMapping);

// v1.2.6: exact reported filename against the unchanged task directories.
const yongnian='邯郸市_永年区_土特产品土壤适宜性评价_河北省农林科学院农业资源环境研究所_质控意见_2026年第二次第1批.docx';
let external=classify(yongnian);
assert.strictEqual(external.i.city,'邯郸市');assert.strictEqual(external.i.district,'永年区');
assert.strictEqual(external.i.unit,'河北省农林科学院农业资源环境研究所');
assert.strictEqual(external.i.batch,'2026年第二次第1批');
assert.strictEqual(external.m.assignment.complete,false);assert.strictEqual(external.m.assignment.requiresConfirmation,true);
assert.throws(()=>w.__testManifest([external.i],'base','pending'),/确认/);
assert(C.confirmUnlisted(external.i));assert(external.i.autoMeta.assignment.complete);
let extrow=external.i.autoMeta.assignment.byKey.specialty[0];
assert(extrow.directoryMismatch);assert.strictEqual(extrow.directoryStatus,'unlisted-task');assert(extrow.outsideDirectoryConfirmed);
const externalManifest=w.__testManifest([external.i],'base','confirmed');assert.strictEqual(externalManifest.files.length,1);
assert(externalManifest.files[0].quality.associationsByDataKey.specialty[0].outsideDirectoryConfirmed);
external.i.manualBatch='2026年第二次第2批';assert(!C.applyItemMetadata(external.i).assignment.complete);
assert(C.confirmUnlisted(external.i));assert(C.applyItemMetadata(external.i).assignment.complete);
external.i.file={...external.i.file};assert(!C.applyItemMetadata(external.i).assignment.complete);
assert(C.confirmUnlisted(external.i));
external.i.manualAssociation={city:'邯郸市',district:'永年区',unit:'河北另一单位有限公司'};
assert(!C.applyItemMetadata(external.i).assignment.complete);assert(C.confirmUnlisted(external.i));
delete external.i.directoryConfirmation;assert(!C.applyItemMetadata(external.i).assignment.complete);
assert(C.confirmUnlisted(external.i));checks+=9;
for(const name of [
 yongnian.replace('_河北省农林科学院农业资源环境研究所',''),
 yongnian.replace('_河北省农林科学院农业资源环境研究所','_甲有限公司_乙有限公司'),
 yongnian.replace('邯郸市_',''),
 yongnian.replace('_永年区_','_永年区_武平县_'),
 '保定市_平山县_土壤类型图_河北示例公司_质控意见.docx'
]){
 let x=classify(name);assert(!x.m.assignment.complete);assert(!C.confirmUnlisted(x.i),name);
}
let noCompany=classify(yongnian.replace('_河北省农林科学院农业资源环境研究所',''),{sourcePath:'河北省农林科学院农业资源环境研究所/旧目录'});
assert.strictEqual(noCompany.i.city,'邯郸市');assert.strictEqual(noCompany.i.district,'永年区');assert.strictEqual(noCompany.i.unit,'');
assert(noCompany.m.assignment.issues.some(p=>p.code==='unlisted-company-required'));
let externalMulti=classify(yongnian.replace('土特产品土壤适宜性评价','土壤属性图_土特产品土壤适宜性评价'));
assert(!externalMulti.m.assignment.complete);assert(C.confirmUnlisted(externalMulti.i));
assert.strictEqual(Object.keys(externalMulti.i.autoMeta.assignment.byKey).length,2);
const mismatch=classify('石家庄市_平山县_土壤类型图_河北湛泸软件开发有限公司_质控意见_2026年第二次第1批.docx');
assert(mismatch.m.assignment.complete);assert.strictEqual(mismatch.m.assignment.byKey.soilType[0].directoryStatus,'unit-mismatch');
assert.strictEqual(C.directoryStatus('soilAttr','石家庄市','平山县','河北湛泸软件开发有限公司').status,'matched');
assert.strictEqual(C.directoryStatus('soilType','石家庄市','平山县','中地科勘察设计有限公司').status,'matched');
assert.strictEqual(C.directoryStatus('specialty','邯郸市','永年区','河北省农林科学院农业资源环境研究所').status,'unlisted-task');
assert.strictEqual(JSON.stringify(w.SoilTaskUnitLists),registryBefore);assert.strictEqual(JSON.stringify(w.masterList),masterBefore);
checks+=8;

const samples=[multi,shared,namedShared,external,externalMulti,mismatch].map(({i},index)=>w.__testManifest([i],'base','test-'+index));
fs.mkdirSync('test-artifacts',{recursive:true});fs.writeFileSync('test-artifacts/assignment-manifests.json',JSON.stringify(samples,null,2));
fs.writeFileSync('test-artifacts/assignment-report.json',JSON.stringify({status:'passed',checks,realListTasks:audited,registryUnchanged:true,indexMasterListSHA256:crypto.createHash('sha256').update(originalList).digest('hex'),mappingSHA256:crypto.createHash('sha256').update(originalMapping).digest('hex')},null,2));
console.log('Assignment matching passed:',checks,'cases;',audited,'actual result-type task rows; both embedded lists unchanged.');
