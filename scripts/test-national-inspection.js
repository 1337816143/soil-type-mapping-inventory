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
