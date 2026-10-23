'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../national-inspection-core.js');
const deployed = C.catalog(JSON.parse(fs.readFileSync('data/national-inspection.json', 'utf8')));
const expected = ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability','landUse','reports'];
assert.deepEqual(C.topics.map(t => t.id), expected);
const dashboardSource = fs.readFileSync('dashboard-extension.js', 'utf8');
const declared = dashboardSource.match(/var TYPES = (\{[\s\S]+?\n  \});/);
assert(declared, 'Existing topic names must be available for exact comparison');
assert.equal(JSON.stringify(C.topics.map(t => [t.id, t.label])), JSON.stringify(Object.entries(vm.runInNewContext('(' + declared[1] + ')'))));
assert.deepEqual(C.counties.map(c => [c.id, c.cityId]), [['jinzhou','shijiazhuang'],['shexian','handan'],['ningjin','xingtai'],['bazhou','langfang']]);
for (const material of deployed.materials) assert(fs.existsSync(material.path), 'Registered national inspection file is missing: ' + material.path);
for (const topic of C.topics) assert(C.query(deployed, {topicId:topic.id}).every(m => m.topicId === topic.id));
if (!deployed.materials.length) {
  assert.deepEqual(C.summary(deployed.materials), {files:0, batches:0});
  assert.equal(deployed.batches.length, 0, 'The empty scaffold must not manufacture batches');
}
const first = {id:'material-a',topicId:'soilType',countyId:'jinzhou',cityId:'shijiazhuang',materialType:'quality',batchId:'batch-a',path:'national-inspection-files/soilType/batch-a/质控材料.pdf',name:'质控材料.pdf'};
const second = {...first,id:'material-b',materialType:'scoring',batchId:'batch-b',path:'national-inspection-files/soilType/batch-b/评分材料.xlsx',name:'评分材料.xlsx'};
const shared = {...first,id:'material-c',countyId:'shexian',cityId:'handan'};
const sample = {schemaVersion:1,batches:[{id:'batch-a',label:'实际首批'},{id:'batch-b',label:'实际补充批'}],materials:[first,second,shared]};
const valid = C.catalog(sample);
const ordered = C.catalog({schemaVersion:1,batches:[{id:'batch-a',label:'同批次',order:2},{id:'batch-b',label:'后批次',order:3}],materials:[first,{...first,id:'v2',version:2,path:first.path.replace('.pdf','_v2.pdf'),name:'质控材料_v2.pdf'},{...first,id:'v3',version:3,path:first.path.replace('.pdf','_v3.pdf'),name:'质控材料_v3.pdf'},second]});
assert.deepEqual(C.query(ordered).map(m=>m.id),['material-b','v3','v2','material-a'],'Batch order first, then versions descending within the same batch');
assert.equal(C.query(ordered,{batchId:'batch-a'}).length,3,'Versions must not create batches');
const scored = C.catalog({schemaVersion:1,batches:ordered.batches,materials:[
  {...first,id:'scored-old',materialType:'scoring',score:80,scoreEvidence:'原表总分80'},
  {...first,id:'scored-new',materialType:'scoring',version:2,score:0,scoreEvidence:'原表总分0',path:'national-inspection-files/new.pdf',name:'new.pdf'},
  {...second,id:'partial-newer',score:null}
]});
assert.equal(C.latestScore(scored,{countyId:'jinzhou',topicId:'soilType'}).score,0,'Latest complete score can be zero; incomplete newer files cannot supply a total');
assert.equal(C.latestScore(scored,{countyId:'bazhou'}),null,'No score is manufactured for missing materials');
assert.equal(C.latestScore(deployed,{countyId:'jinzhou',topicId:'landUse'}).score,79.4,'Use original converted total, not 71.5 subtotal');
assert.equal(C.latestScore(deployed,{countyId:'jinzhou',topicId:'reports'}),null,'Different report scopes and partial physical-data scoring must not become one full score');
assert.equal(C.latestScore(deployed,{countyId:'jinzhou',topicId:'soilAttr'}).score,76);
const ningjinResources=C.latestScore(deployed,{countyId:'ningjin',topicId:'landUse'});
assert.equal(ningjinResources.score,76,'Supplement 5 uses the original printed converted total, not the chapter subtotal 68');
assert.equal(ningjinResources.batchId,'ningjin-landUse-scoring-batch-unspecified','The score sheet must not inherit the QC filename batch');
assert(C.query(deployed,{countyId:'ningjin',topicId:'landUse'}).every(m=>m.version===null),'The supplement v5 directory and filename copy suffixes must not create report versions');
assert(C.query(deployed,{countyId:'ningjin',topicId:'landUse'}).some(m=>m.materialType==='quality'&&m.batchId==='2026-round2-batch1'));
const jinzhouAgriculture=C.latestScore(deployed,{countyId:'jinzhou',topicId:'agriSuitability'});
assert.equal(jinzhouAgriculture.score,82,'Supplement 4 uses the original PDF total');
assert.equal(jinzhouAgriculture.batchId,'2026-round3-batch2','Use the explicitly named third-round second batch');
assert.equal(C.query(deployed,{countyId:'jinzhou',topicId:'agriSuitability'}).filter(m=>m.materialType==='quality').length,1,'The byte-identical QC file must not create a duplicate relationship');
assert.deepEqual(C.query(deployed,{countyId:'jinzhou',topicId:'agriSuitability'}).map(m=>m.batchId),['2026-round3-batch2','2026-round2-batch1'],'The new scoring batch precedes the older QC batch');
for (const [countyId,topicId,score] of [['shexian','agriSuitability',71],['ningjin','soilAttr',78]]) {
  const entry=C.latestScore(deployed,{countyId,topicId});
  assert.equal(entry.score,score,'Supplement 3 uses the original score-table total');
  assert.equal(entry.batchId,countyId+'-'+topicId+'-scoring-batch-unspecified','Undated score sheets must not inherit the QC PDF batch');
  assert.equal(entry.version,null,'The supplement directory name must not create a report version');
  assert(C.query(deployed,{countyId,topicId,materialType:'quality'}).some(m=>m.batchId==='2026-round2-batch1'));
}
const separate = C.latestReportScores(deployed,{countyId:'jinzhou',topicId:'reports',batchId:'2026-round3-batch1'});
assert.equal(separate.version,3);
assert.deepEqual(separate.reportScores.map(s=>[s.reportId,s.value,s.scope]),[['overall',88,'full'],['work',74,'full'],['work',75,'full'],['data',81,'content']]);
assert.deepEqual(separate.reportScores.map(s=>s.basis),['2026版评分表','2026版评分表','2024版评分表','2024/2026版评分表']);
const currentReports=C.latestReportScores(deployed,{countyId:'jinzhou',topicId:'reports'});
assert.equal(currentReports.batchId,'2026-round3-batch3');
assert.equal(currentReports.version,null,'A new batch is not an invented report version');
assert.deepEqual(currentReports.reportScores.map(s=>[s.reportId,s.value,s.scope]),[['overall',98,'full'],['work',85,'full'],['work',85,'full'],['data',88,'content']]);
const previousReports=C.latestReportScores(deployed,{countyId:'jinzhou',topicId:'reports',batchId:'2026-round3-batch2'});
assert.deepEqual(previousReports.reportScores.map(s=>s.value),[90,77,78,91]);
assert.equal(C.latestScore(deployed,{countyId:'jinzhou',topicId:'degradation'}).score,93);
assert.equal(C.latestScore(deployed,{countyId:'shexian',topicId:'specialty'}).score,87);
const incremental=deployed.materials.filter(m=>m.path.startsWith('national-inspection-files/质控更新_20261023/'));
assert.equal(incremental.length,14);
assert.equal(C.uniqueFiles(incremental).length,8);
for(const file of C.uniqueFiles(incremental)) {
  const relations=incremental.filter(m=>m.path===file.path);
  assert.equal(file.version,null,'Copy numbers and update labels cannot create versions');
  if(file.name.endsWith('.pdf')&&file.countyId!=='ningjin') assert.deepEqual(new Set(relations.map(m=>m.materialType)),new Set(['quality','scoring']),'Combined feedback and score PDFs share both entrances');
}
assert.equal(C.latestReportScores(deployed,{countyId:'ningjin',topicId:'reports'}),null,'Blank report score template must not manufacture a Ningjin score');
assert.equal(C.latestScore(deployed,{countyId:'ningjin',topicId:'degradation'}),null,'QC-only Word cannot supply a score');
assert.deepEqual(C.counties.map(c=>C.summary(C.query(deployed,{countyId:c.id})).files),[30,13,14,0]);
assert.deepEqual(C.topics.map(t=>C.summary(C.query(deployed,{topicId:t.id})).files),[8,6,8,5,4,6,11,9]);
assert.equal(C.latestReportScores(deployed,{countyId:'bazhou',topicId:'reports'}),null);
const report = {...first,topicId:'reports',materialType:'scoring',reportScores:[{reportId:'data',value:0,basis:'2026版',scope:'content',evidence:'原表内容评分0'}]};
const reportInput = {schemaVersion:1,batches:[sample.batches[0]],materials:[report,{...report,id:'report-v3',version:3,path:'national-inspection-files/report-v3.pdf',name:'report-v3.pdf'}]};
assert.equal(C.latestReportScores(C.catalog(reportInput),{topicId:'reports'}).id,'report-v3','Separate scores follow the original batch/version order');
function invalidReport(mutator) { const copy=JSON.parse(JSON.stringify(reportInput));mutator(copy.materials[0]);assert.throws(()=>C.catalog(copy),/国家抽查清单/); }
invalidReport(m=>m.topicId='soilType');
invalidReport(m=>m.materialType='quality');
invalidReport(m=>{m.score=10;m.scoreEvidence='不能把分报告分数合成总分';});
invalidReport(m=>m.reportScores=[]);
invalidReport(m=>m.reportScores[0].value=101);
invalidReport(m=>m.reportScores[0].reportId='other');
invalidReport(m=>m.reportScores[0].scope='database');
invalidReport(m=>m.reportScores[0].evidence='');
invalidReport(m=>m.reportScores.push({...m.reportScores[0]}));
for (const county of C.counties) {
  const entries=C.query(deployed,{countyId:county.id});
  assert.equal(C.summary(entries).files,new Set(entries.map(m=>m.path)).size,'Row counts deduplicate shared QC/scoring files');
}
for (const topic of C.topics) {
  const entries=C.query(deployed,{topicId:topic.id});
  assert.equal(C.summary(entries).files,new Set(entries.map(m=>m.path)).size,'Column counts deduplicate shared QC/scoring files');
}
assert.deepEqual(C.summary(valid.materials), {files:2,batches:2});
assert.equal(C.uniqueFiles(valid.materials).length, 2);
assert.equal(C.query(valid,{topicId:'soilType',countyId:'jinzhou',batchId:'batch-b',search:'评分'}).length,1);
assert.equal(C.query(valid,{countyId:'shexian',batchId:'batch-b'}).length,0,'Filters must use AND across the same association');
assert.equal(C.query(valid,{search:'邯郸'}).length,1);
assert.equal(C.query(valid,{search:'实际补充'}).length,1);
assert.equal(C.query(valid,{topicId:'reports'}).length,0);
assert(C.sourceUrl(first.path).startsWith('./national-inspection-files/soilType/batch-a/'));
assert(C.sourceUrl(first.path).includes(encodeURIComponent('质控材料.pdf')));
const invalidPaths = ['https://example.com/a.pdf','//example.com/a.pdf','/national-inspection-files/a.pdf','national-inspection-files/../a.pdf','national-inspection-files/./a.pdf','national-inspection-files//a.pdf','national-inspection-files/a\\b.pdf','national-inspection-files/%2e%2e/a.pdf','national-inspection-files/%252e%252e/a.pdf','national-inspection-files/a.pdf?x=1','national-inspection-files/a.pdf#x','national-inspection-files/a:1.pdf','national-inspection-files/a\u0000.pdf','national-inspection-files/x.html','national-inspection-files/x.svg','national-inspection-files/ x.pdf'];
for (const path of invalidPaths) assert.throws(() => C.sourceUrl(path), /国家抽查清单/);
function invalid(mutator) { const copy = JSON.parse(JSON.stringify(sample)); mutator(copy); assert.throws(() => C.catalog(copy), /国家抽查清单/); }
invalid(d => d.schemaVersion = 2);
invalid(d => d.materials[1].id = d.materials[0].id);
invalid(d => d.batches[1].id = d.batches[0].id);
invalid(d => d.materials[0].batchId = 'missing');
invalid(d => d.materials[0].countyId = 'unknown');
invalid(d => d.materials[0].cityId = 'handan');
invalid(d => d.materials[0].topicId = 'references');
invalid(d => d.materials[0].materialType = 'other');
invalid(d => d.materials[0].name = 'different.pdf');
invalid(d => d.materials.push({...d.materials[0],id:'another-id'}));
invalid(d => d.batches.push({id:'placeholder',label:'不能伪造批次'}));
invalid(d => d.materials[0].id = '../invalid');
invalid(d => d.materials[0].version = -1);
invalid(d => d.materials[0].version = 1.5);
invalid(d => { d.materials[0].score = 80; d.materials[0].scoreEvidence = '原表'; });
for (const score of [-1,101,NaN,Infinity,'80']) invalid(d => { d.materials[1].score = score; d.materials[1].scoreEvidence = '原表'; });
invalid(d => d.materials[1].score = 80);
invalid(d => d.batches[0].order = '2026');
assert.throws(() => C.catalog({schemaVersion:1,batches:[{id:'empty',label:'空批次'}],materials:[]}));
const source = fs.readFileSync('national-inspection.js','utf8');
assert(!source.includes('innerHTML'), 'Material metadata must use textContent, never HTML interpolation');
assert(!/tabData\s*\[|SoilDashboardTypes\s*=|localStorage|sessionStorage|Authorization|Bearer/.test(source), 'New module must not mutate old data or use authentication');
assert(!source.includes("el('button', 'tab'"), 'Nested topic tabs must not use global tab class');
assert(source.includes('window.SoilDocumentPreview.open(url, entry.name)'), 'PDF/Word must reuse current preview controls');
assert(source.includes('window.SoilFileAccess.openPreview(url, entry.name)'), 'Unsupported formats must still enter preview before download');
assert(source.includes('C.uniqueFiles(filteredMaterials())'), 'ZIP must deduplicate physical files');
const previewSource = fs.readFileSync('document-preview-controls.js','utf8');
const assetRouterSource = previewSource.match(/function previewAssetUrl\(url\) \{[\s\S]*?\n  \}/)[0];
for (const active of [false,true]) {
  const routeAsset = vm.runInNewContext('('+assetRouterSource+')',{document:{getElementById:()=>({classList:{contains:()=>active}})}});
  for (const file of ['pdf.min.js','pdf.worker.min.js','docx-preview.min.js','jszip.min.js']) {
    const cdn='https://cdn.jsdelivr.net/npm/example/'+file;
    assert.equal(routeAsset(cdn),active?'./assets/national-inspection-preview/'+file:cdn,'Only the active national inspection column selects same-origin dependencies');
    assert(fs.existsSync('assets/national-inspection-preview/'+file),'National inspection preview dependency must deploy with the site');
  }
}
const loader = fs.readFileSync('page-enhancements.js','utf8');
const order = ['work-records.js','national-inspection-core.js','national-inspection.js','glass-navigation.js'].map(p => loader.indexOf("src:'./"+p));
assert(order.every((position,i) => position >= 0 && (!i || position > order[i-1])), 'National inspection must install before glass navigation captures nodes');
const bare = fs.readFileSync('VERSION','utf8').trim().replace(/^v/,'');
assert(loader.includes('national-inspection.js?v='+bare));
assert(loader.includes('national-inspection-core.js?v='+bare));
assert(fs.readFileSync('index.html','utf8').includes('national-inspection.css?v='+bare));
const css = fs.readFileSync('national-inspection.css','utf8');
assert(css.includes('@media(max-width:760px)') && css.includes('@media(max-width:360px)'));
assert(css.includes(':focus-visible') && css.includes('min-height:42px'));
const deploy = fs.readFileSync('.github/workflows/deploy.yml','utf8');
for (const name of ['national-inspection-core.js','national-inspection.js','national-inspection.css','national-inspection-files','data/national-inspection.json','scripts/test-national-inspection.js','scripts/test-national-inspection-dom.js']) assert(deploy.includes(name),'Deployment must include '+name);
console.log('National inspection: schema, true empty state, multi-batch AND filtering, physical-file deduplication, unsafe paths, exact topic names, preview routing and scoped integration passed.');
