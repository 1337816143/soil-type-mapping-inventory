from pathlib import Path
root=Path.cwd();p=root/'scripts/validate-assignment-matching.js';s=p.read_text()
anchor="const samples=[multi,shared,namedShared].map"
extra=r'''
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
'''
assert anchor in s
p.write_text(s.replace(anchor,extra+"\nconst samples=[multi,shared,namedShared,external,externalMulti,mismatch].map"))
p=root/'scripts/test-assignment-index.py';s=p.read_text()
old="                assert any(all(r[k]==association[k] for k in ['city','unit','district']) and r['dataKey']==key for r in rows[1:])"
new="""                saved=next(r for r in rows[1:] if all(r[k]==association[k] for k in ['city','unit','district']) and r['dataKey']==key)
                assert saved['directoryStatus']==association.get('directoryStatus','')
                assert saved['directoryMismatch']==(association.get('directoryStatus') in ['unlisted-task','unit-mismatch'])
                if saved['directoryStatus']=='unlisted-task':
                    assert saved['outsideDirectoryConfirmed'] is True
                    assert saved['directoryConfirmedAt']
                    missing=json.loads(json.dumps(fixture))
                    for group in missing['files'][0]['quality']['associationsByDataKey'].values():
                        for a in group:a.pop('outsideDirectoryConfirmed',None)
                    manifest.write_text(json.dumps(missing));before=index.read_bytes()
                    denied=subprocess.run([sys.executable,str(script)],cwd=repo,capture_output=True,text=True,timeout=10)
                    assert denied.returncode!=0 and index.read_bytes()==before
                    checks+=1"""
assert old in s
p.write_text(s.replace(old,new).replace('capture_output=True,text=True)','capture_output=True,text=True,timeout=10)'))
print('Directory confirmation and index regression cases added')
