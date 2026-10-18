'use strict';
// Real classifier, real manifest/index writer and renderer; temporary fixtures only.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),os=require('os'),path=require('path'),cp=require('child_process');
const {C,w,ctx,records,hashes}=require('./unit-evidence-context')();
const roster=JSON.stringify(w.SoilTaskUnitLists),original=JSON.stringify(records);
const selectors={'adm-kind':{value:'quality'},'adm-data-key':{value:'soilType'},'adm-directory':{value:'data/质控意见反馈_管理员导入'},'adm-new-directory':{value:''}};
ctx.document.getElementById=id=>selectors[id]||null;
w.location={href:'https://example.test/soil/'};ctx.URL=URL;
let checks=0;function check(value,message){assert(value,message);checks++;}
function sample(name,extra={}){const item={file:{name,size:32,lastModified:100,slice(){}},path:name,sourcePath:name,...extra};return {item,meta:C.applyItemMetadata(item)};}
function geo(s){return String(s||'').replace('孟村回族自治县','孟村县');}
const cases=[
 ['沧州-献县土壤资源评价与利用验收评分表.docx','landUse','沧州市','献县','score',null],
 ['邢台-襄都区-土壤属性图-打分表-第三次第一批.docx','soilAttr','邢台市','襄都区','score','2026年第三次第1批'],
 ['邢台-任泽区-土壤属性图-打分表-第三次第一批.docx','soilAttr','邢台市','任泽区','score','2026年第三次第1批'],
 ['邯郸市级土壤属性与制图专题成果验收评分表（第三次第一批）.docx','soilAttr','邯郸市','邯郸市','score','2026年第三次第1批']
];
for(const [district,unit] of [['沧县','沧州华江工程勘察设计有限公司'],['沧州合并区','沧州华江工程勘察设计有限公司'],['东光县','河北司南测绘服务有限公司'],['孟村回族自治县','易景科技（天津）股份有限公司'],['青县','沧州华江工程勘察设计有限公司'],['盐山县','易景科技（天津）股份有限公司']])cases.push([`沧州市_${district}_土壤类型图_${unit}_2026年第三次第三批_质控报告及评分情况.pdf`,'soilType','沧州市',district==='沧州合并区'?'合并区':district,'quality-score','2026年第三次第3批']);
for(const district of ['藁城区','晋州市','深泽县','无极县'])cases.push([`石家庄市_${district}_土壤类型图_河北图宇科技有限公司_2026年第三次第四批_评分报告.pdf`,'soilType','石家庄市',district,'score','2026年第三次第4批']);
const items=[];
for(const [name,key,city,district,role,batch] of cases){
 const x=sample(name);
 check(x.meta.kind==='quality'&&x.meta.dataKeys.join()===key,'result type: '+name);
 check(x.item.city===city&&geo(x.item.district)===geo(district),'geography: '+name);
 check(x.meta.assignment.complete&&!!x.item.unit,'company from typed immutable roster: '+name);
 check(x.meta.documentRole===role&&C.documentRole(name)===role,'document role: '+name);
 check(batch?x.item.batch===batch:!x.item.batch,'correct batch or missing, not invented: '+name);
 check(C.roleBadge(x.meta).includes('data-document-role="'+role+'"'),'compact preview label: '+name);
 items.push(x.item);
}
const manual=sample(cases[0][0],{manualBatch:'2026年第三次第2批'});
check(manual.item.batch==='2026年第三次第2批','missing filename batch follows explicit selection');
check(sample(cases[1][0],{manualBatch:'2027年第二次第4批'}).item.batch==='2027年第二次第4批','manual batch outranks filename');
check(sample('沧县_土壤类型图_第四批_评分报告.pdf',{sourcePath:'2027年第三次质控/沧县_土壤类型图_第四批_评分报告.pdf'}).item.batch==='2027年第三次第4批','filename batch + folder year/round');
check(sample(cases[13][0],{sourcePath:'2025年第一次第1批/'+cases[13][0]}).item.batch==='2026年第三次第4批','filename outranks stale folder');
check(sample('第三次全国土壤普查_沧县_土壤类型图_第一批_评分表.pdf').item.batch==='2026年第一次第1批','national survey 3 is not QC round 3');
for(const [name,expected] of [
 ['第三批/沧县土壤类型图第一批评分表.pdf','第一批'],
 ['第一轮/沧县土壤类型图第三轮第二批评分表.pdf','2026年第三次第2批'],
 ['第二批补充/沧县土壤类型图第一批评分表.pdf','第一批'],
 ['第二批/沧县土壤类型图第三批补充评分表.pdf','第三批补充'],
 ['第一轮/沧县土壤类型图第三轮评分表.pdf','第三轮'],
 ['第三轮/沧县土壤类型图第一轮第二批评分表.pdf','2026年第一次第2批'],
 ['沧县土壤类型图2027年第二批评分表.pdf','2027年第一次第2批']
]) check(C.inferBatch(name)===expected,'nearest batch fields: '+name);
for(const [name,role] of [['沧县质控报告.docx','quality'],['沧县验收评分表.xlsx','score'],['沧县打分表.pdf','score'],['沧县质控评分表.docx','score'],['沧县质控报告评分表.docx','score'],['沧县质控意见及评分表.docx','quality-score'],['沧县质量控制报告与打分表.pdf','quality-score'],['评分报告/沧县质控报告.docx','quality'],['第三次土壤普查评分手册.pdf','quality'],['评分标准.docx','quality'],['土壤属性图评分模板.docx','quality']])check(C.documentRole(name)===role,'role boundary: '+name);
check(C.roleBadge('沧县质控意见.pdf')==='','normal QC UI unchanged');
check(!C.roleBadge('<img src=x onerror=alert(1)>评分表.pdf').includes('<img'),'badge contains static labels only');
for(const q of ['评分','打分','评分报告','验收评分表']){check(C.roleSearchMatch(cases[1][0],q)===true,'score synonym '+q);check(C.roleSearchMatch(cases[4][0],q)===true,'combined searchable '+q);check(C.roleSearchMatch('评分文件夹/质控报告.docx',q)===false,'no folder false positives '+q);}
check(C.roleSearchMatch(cases[1][0],'质控')===false,'pure score not QC-only search hit');
check(C.roleSearchMatch(cases[4][0],'质控＋评分')===true,'combined keyword');
check(C.roleSearchMatch(cases[4][0],'仅评分')===false,'pure-score keyword');
check(!sample('沧县_评分表.pdf').meta.assignment.complete,'unknown result type uses existing manual correction');
check(sample('附件01评分表.pdf',{manualDataKey:'soilType',manualAssociation:{city:'沧州市',district:'沧县',unit:'沧州华江工程勘察设计有限公司'}}).meta.assignment.complete,'manual correction works without extra nature confirmation');
for(const key of Object.keys(C.typeLabels))check(sample('平山县_'+C.typeLabels[key]+'_2026年第三次第1批_验收评分表.docx').meta.dataKeys.includes(key),'scoring result category '+key);

w.SoilRepoAdmin={tree:[],clean:p=>p,base:p=>p.split('/').pop(),esc:String,size:String,referenceRoot:'reference-files/third-soil-survey',indexPath:'data/admin-import-index.json'};
w.SoilAdminImport.types=()=>C.typeLabels;w.SoilAdminImport.MAX=95*1024*1024;
vm.runInContext(fs.readFileSync('hybrid-staged-upload.js','utf8').replace('  function stageWholeFile(', '  window.__scoringManifest=buildManifest;\n  function stageWholeFile('),ctx);
const manifest=w.__scoringManifest([manual.item,...items.slice(1)],'base','scoring-test');
for(let i=0;i<manifest.files.length;i++){const f=manifest.files[i];check(f.quality.documentRole===cases[i][4],'role survives staged manifest');check(f.originalName===cases[i][0],'original filename retained');}
const duplicate=w.__scoringManifest([items[1],items[1]],'base','duplicate');
check(duplicate.files[0].targetPath!==duplicate.files[1].targetPath,'same-name uploads never overwrite');
const qc=sample('邢台-襄都区-土壤属性图-质控报告-2026年第三次第一批.docx').item;
const coexist=w.__scoringManifest([qc,items[1]],'base','coexist');
check(coexist.files.length===2&&coexist.files[0].quality.documentRole==='quality'&&coexist.files[1].quality.documentRole==='score','QC and score coexist under same task/batch');
w.BASE='data';w.PDF_ICON='file';w.batchClass={};w.renderReplyCell=()=>'';
w.tabData={soilAttr:[{name:'邢台市',units:[{name:items[1].unit,districts:[{label:'襄都区',docs:[{batch:items[1].batch,file:'old-qc.docx'},{batch:items[1].batch,file:'评分文件夹/打分表.docx',documentRole:'score'}]}]}]}]};
const html=w.renderCities(w.tabData.soilAttr,'soilAttr');
check((html.match(/data-document-role="score"/g)||[]).length===1,'only score button marked');
check((html.match(/<th>/g)||[]).length===4,'no added columns');
vm.runInContext(fs.readFileSync('file-preview-batch-download.js','utf8').replace('  function matchingCatalog(', '  window.__scoreMatches=associationMatches;\n  function matchingCatalog('),ctx);
const catalog=w.SoilFileAccess.buildCatalog();check(catalog.length===2,'both files retained for public download');
const filters={city:new Set(['邢台市']),unit:new Set(),resultType:new Set(['土壤属性图']),district:new Set(['襄都区'])};
check(catalog.filter(i=>i.associations.some(a=>w.__scoreMatches(a,filters,'评分',i))).length===1,'actual cross-filter plus score keyword');
check(catalog.filter(i=>i.associations.some(a=>w.__scoreMatches(a,filters,'质控',i))).length===1,'actual QC-only search excludes pure score');

// Execute the actual Actions writer in a temporary repository, never main.
const workflow=fs.readFileSync('.github/workflows/import-chunked.yml','utf8');
const block=workflow.split('      - name: Restore repository paths and index')[1];
const writer=block.split("          python3 <<'PY'\n")[1].split('\n          PY')[0].split('\n').map(s=>s.startsWith('          ')?s.slice(10):s).join('\n');
for(const fixture of [manifest,coexist,duplicate]){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'soil-scoring-'));
 try{
  const repo=path.join(temp,'repo'),restored=path.join(temp,'restored'),mf=path.join(temp,'manifest.json');
  fs.mkdirSync(path.join(repo,'data'),{recursive:true});fs.mkdirSync(restored);
  const index=path.join(repo,'data','admin-import-index.json'),prior={kind:'quality-control',path:'existing/original.docx',unit:'untouched'};
  fs.writeFileSync(index,JSON.stringify([prior]));fs.writeFileSync(mf,JSON.stringify(fixture));
  fixture.files.forEach((f,i)=>fs.writeFileSync(path.join(restored,String(i+1).padStart(4,'0')+'.bin'),'fixture-content!'));
  const script=path.join(temp,'writer.py');
  fs.writeFileSync(script,writer.replace("Path('/tmp/soil-hybrid-restored')",'Path('+JSON.stringify(restored)+')').replace("Path('/tmp/soil-hybrid-manifest.json')",'Path('+JSON.stringify(mf)+')'));
  cp.execFileSync('python3',[script],{cwd:repo,encoding:'utf8'});
  const rows=JSON.parse(fs.readFileSync(index,'utf8'));check(JSON.stringify(rows[0])===JSON.stringify(prior),'prior index is unchanged');
  for(const f of fixture.files){const matches=rows.filter(r=>r.path===f.targetPath);check(matches.length>0&&matches.every(r=>r.documentRole===f.quality.documentRole),'role persists in actual saved index');check(fs.readFileSync(path.join(repo,f.targetPath),'utf8')==='fixture-content!','attachment bytes preserved');}
  check(new Set(rows.slice(1).map(r=>r.path)).size===fixture.files.length,'one physical file per upload, all files retained');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
check(JSON.stringify(w.SoilTaskUnitLists)===roster&&JSON.stringify(records)===original,'rosters and historical records unchanged');
check(hashes.master==='ae80ce5de012806935cf9ce6a739212954338d3670b3b652e8b96e1d544dce52'&&hashes.mapping==='00cf15e864c6cc479058b721768e381de3a15420a1be86f8018ebd1163d597e8','immutable roster hashes');
for(const f of ['reference-upload.js','reference-import-mode.js','work-records.js'])check(!/DOCUMENT_ROLE_LABELS|roleSearchMatch|documentRole/.test(fs.readFileSync(f,'utf8')),'scoring classifier stays out of independent workflow: '+f);
fs.mkdirSync('test-artifacts',{recursive:true});
fs.writeFileSync('test-artifacts/scoring-report.json',JSON.stringify({status:'passed',checks,screenshotCases:cases.length,rostersUnchanged:true,temporaryWriterTest:true,noNewColumns:true},null,2));
console.log('Scoring file regression passed:',checks,'checks;',cases.length,'screenshot filenames; actual manifest/index writer, coexistence, badge and cross-filter search.');
