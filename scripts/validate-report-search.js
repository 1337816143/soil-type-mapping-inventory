'use strict';
// Execute the actual public-download predicate, not a duplicate implementation.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('file-preview-batch-download.js','utf8');
const start=source.indexOf('  function associationMatches('),end=source.indexOf('  function matchingCatalog(',start);
assert(start>=0&&end>start,'Cannot locate real predicate');
const match=vm.runInNewContext('('+source.slice(start,end).trim()+')');
const filters={city:new Set(),unit:new Set(),resultType:new Set(),district:new Set()};
const assoc={dataKey:'reports',resultType:'总体、工作、数据报告',city:'石家庄市',unit:'河北湛泸软件开发有限公司',district:'平山县',batch:'2026年第二次第1批'};
const files=['总体报告','工作报告','数据报告'].map(kind=>({name:'平山县_'+kind+'_质控意见.docx',repoPath:'data/总体、工作、数据报告/平山县_'+kind+'_质控意见.docx'}));
for(let i=0;i<files.length;i++){
 const kind=['总体报告','工作报告','数据报告'][i];
 assert.deepStrictEqual(files.map(f=>match(assoc,filters,kind,f)),files.map((_,j)=>i===j));
 assert.deepStrictEqual(files.map(f=>match(assoc,filters,'平山县 '+kind,f)),files.map((_,j)=>i===j));
}
assert(files.every(f=>match(assoc,filters,'总体、工作、数据报告',f)),'Full category name still selects family');
assert(files.every(f=>match(assoc,filters,'石家庄市 河北湛泸',f)),'Metadata search remains');
filters.city.add('邯郸市');assert(!match(assoc,filters,'数据报告',files[2]),'AND filter not lost');filters.city.clear();
assert(match({...assoc,dataKey:'soilType',resultType:'土壤类型图'},filters,'土壤类型图',{name:'平山县.pdf',repoPath:'data/平山县.pdf'}),'Original type search changed');
console.log('Report subtype public-download search checks passed');
