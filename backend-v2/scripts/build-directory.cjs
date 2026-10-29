'use strict';
// Build a read-only, contact-free backend snapshot from the current application.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../..'));
const {C,hashes}=require(path.join(root,'scripts/unit-evidence-context.js'))(root);
const keys=Object.keys(C.typeLabels), tasks={};
for(const key of keys){
  tasks[key]=C.listForKey(key).flatMap(c=>c.items.flatMap(i=>i.districts.map(d=>({city:c.city,unit:i.unit,district:d}))));
  for(const r of C.mergedDirectoryRows(key))tasks[key].push({city:r.city,unit:r.unit,district:r.district,parent:r.parentDistrict,evidence:r.evidence});
}
for(const key of keys)for(const r of tasks[key]){
  const variants=[r.unit,...r.unit.split(/\s*\/\s*/),r.unit.replace(/[（(][^）)]*[）)]/g,'').trim()];
  r.acceptedUnits=[...new Set(variants)].filter(u=>!C.directoryStatus(key,r.city,u,r.district).mismatch);
}
const registry=JSON.parse(fs.readFileSync(path.join(root,'data/north-quality-feedback-package.json'),'utf8'));
const registered=(registry.documents||[]).map(d=>({name:d.filename,size:d.size,sha256:d.sha256,keys:['soilType','soilAttr','farmland'],byKey:Object.fromEntries(['soilType','soilAttr','farmland'].map(k=>[k,d.associationsByDataKey[k]]))}));
const data={schemaVersion:1,hashes,types:C.typeLabels,tasks,registered};
const output=path.resolve(process.argv[3]||path.join(__dirname,'../src/directory.mjs'));
fs.writeFileSync(output,'// Generated read-only; no phone numbers or credentials. Do not edit task assignments.\nexport default '+JSON.stringify(data)+';\n');
console.log(JSON.stringify({output,hashes,types:keys.length,tasks:Object.values(tasks).reduce((n,r)=>n+r.length,0),registered:registered.length}));
