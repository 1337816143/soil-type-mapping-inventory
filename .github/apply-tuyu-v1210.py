from pathlib import Path
import copy,hashlib,importlib.util,json,re,subprocess
ROOT=Path.cwd();assert (ROOT/'VERSION').read_text().strip()=='v1.2.9'
OLD='河北图宇地理信息科技有限公司';NEW='河北图宇科技有限公司'
original_html=(ROOT/'index.html').read_text()
master=re.search(r'var masterList = \[[\s\S]*?\n\];',original_html).group()
mapping=(ROOT/'task-unit-mappings.js').read_bytes()
token=re.search(r'var tokenCodes = \[[^\]]+\]',(ROOT/'upload-config.js').read_text()).group()

def edit(name,old,new):
 p=ROOT/name;s=p.read_text();assert s.count(old)==1,(name,old[:90]);p.write_text(s.replace(old,new))

edit('admin-auto-classifier.js','    var known=unique([].concat.apply([],companyNames().map(unitForms)));',"""    // Verified project name, not a fuzzy alias. The unchanged typed roster
    // must uniquely assign this exact target; other companies remain red.
    // Source and scope: docs/TUYU_NAME_EVIDENCE.md.
    if(normalize(value)==='河北图宇地理信息科技有限公司' && full===companyForm('河北图宇科技有限公司')) {
      result.action='typo';result.unit=target;
      result.reason='外部正式名称资料与该成果、该市及任务单元的原通讯录一致；订正本项目中不规范扩写的单位名称。核对依据：docs/TUYU_NAME_EVIDENCE.md。';
      return result;
    }
    var known=unique([].concat.apply([],companyNames().map(unitForms)));""")
spec=importlib.util.spec_from_file_location('repair',ROOT/'scripts/repair-quality-units.py');M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
snapshot=M.node();before=copy.deepcopy(snapshot['records']);selected=[r for r in snapshot['records'] if r.get('unit')==OLD]
assert len(selected)==5 and all(r['origin']=='legacy' and r['city']=='沧州市' and r['dataKey']=='soilType' for r in selected)
assert {r['district'] for r in selected}=={'任丘市','河间市','肃宁县'}
qa=ROOT/'test-artifacts/tuyu-original-headers';qa.mkdir(parents=True,exist_ok=True)
originals={};metadata={}
for r in selected:
 p=ROOT/r['path'];info=M.field(p)
 assert M.compact(info.get('value'))=='河北图宇' and M.qualified_geo(info,[r]),(r['path'],info)
 data=p.read_bytes();originals[r['path']]=data
 with M.fitz.open(p) as doc:
  assert all(OLD not in page.get_text() for page in doc),'Unexpected wrong name inside source PDF; requires separate review'
  name=hashlib.sha256(r['path'].encode()).hexdigest()[:12]
  rect=M.fitz.Rect(30,30,doc[0].rect.width-25,min(240,doc[0].rect.height))
  doc[0].get_pixmap(matrix=M.fitz.Matrix(1.6,1.6),clip=rect).save(qa/(name+'.png'))
  metadata[r['path']]={'beforeSHA256':M.digest(data),'afterSHA256':M.digest(data),'pages':len(doc),'headerValue':info['value'],'qaImage':name+'.png'}
audits=M.process(selected)
assert len(audits)==5 and not any(a['documentChanged'] or a.get('documentError') for a in audits)
assert all(r['unit']==NEW for r in selected)
for a in audits:a.update(metadata[a['path']])
M.migrate_legacy(snapshot['records'])
after=M.node()
assert len(after['records'])==len(before) and snapshot['hashes']==after['hashes']
def identity(r):return (r['path'],r['dataKey'],r.get('city'),r.get('district'),r.get('batch'),r.get('origin'))
old_by_id={identity(r):r for r in before};new_by_id={identity(r):r for r in after['records']};assert old_by_id.keys()==new_by_id.keys()
for k,a in new_by_id.items():
 b=old_by_id[k]
 if b['unit']==OLD:
  assert a['unit']==NEW and a['unitCorrection']['originalUnit']==OLD and not a['directory']['mismatch']
 else:assert a==b,('Unrelated association changed',k)
for path,data in originals.items():assert (ROOT/path).read_bytes()==data
receipt={'version':'v1.2.10','checkedOn':'2026-09-23','recordsChecked':len(before),'platformCorrections':5,'documentsChecked':5,'documentsChanged':0,'directoryHashes':snapshot['hashes'],'evidence':'docs/TUYU_NAME_EVIDENCE.md','scope':'Exact platform expansion only; original report shorthand retained; no global corporate-identity assertion.','reports':audits}
(ROOT/'docs/tuyu-name-v1.2.10.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
edit('scripts/verify-unit-repair.py',"print('Verified correction receipts:',changed,'PDF reports;',report['platformCorrections'],'platform associations; original directory unchanged.')", "print('Verified correction receipts:',changed,'PDF reports;',report['platformCorrections'],'platform associations; original directory unchanged.')\nsubprocess.run(['python',str(ROOT/'scripts/test-tuyu-name.py')],check=True,cwd=ROOT)")
# Existing browser helper also runs against the live site; keep its import paths.
p=ROOT/'scripts/check-unit-repair-ui.py';s=p.read_text();needle="    return {'status':'passed','checks':"
assert s.count(needle)==1
new=r'''    tuyu=page.evaluate(()=>{})
'''
new=r'''    tuyu=page.evaluate(r"""()=>{
      const C=SoilAdminAutoClassifier,old='河北图宇地理信息科技有限公司',name='河北图宇科技有限公司',rows=[];
      for(const c of tabData.soilType||[])for(const u of c.units||[])for(const d of u.districts||[]){
        if(c.name==='沧州市'&&['河间市','任丘市','肃宁县'].includes(d.label))for(const doc of d.docs||[])rows.push({unit:u.name,district:d.label,doc});
      }
      if(rows.length!==5||rows.some(r=>r.unit!==name||r.doc.unitCorrection?.originalUnit!==old))throw Error('TuYu mounted name correction missing');
      for(const r of rows)if(C.directoryStatus('soilType','沧州市',r.unit,r.district).mismatch)throw Error('Corrected TuYu record still red');
      const item={file:{name:'沧州市_河间市_土壤类型图_'+old+'_质控意见_2026年第二次第1批.pdf',size:1}};
      if(!C.applyItemMetadata(item).assignment.complete||item.unit!==name)throw Error('Future exact name rule missing');
      if(C.unitEvidence('soilAttr','沧州市','河间市',old).action!=='keep')throw Error('Company borrowed across result types');
      const prior=window.replyIndex;window.replyIndex={};let reply;
      try{
        window.replyIndex[getReplyKey('沧州市',old,'河间市','2026年第一次第1批')]={file:'tuyu-old-name-reply.docx',time:'20260923000000'};
        reply=renderReplyCell('沧州市',name,'河间市');
      }finally{window.replyIndex=prior;}
      if(!reply.includes('tuyu-old-name-reply.docx'))throw Error('Old-name reply is no longer reachable');
      return {status:'passed',associations:rows.length,districts:[...new Set(rows.map(r=>r.district))],company:name,oldReplyAccessible:true};
    }""")
'''
s=s.replace(needle,new+needle).replace("'records':evidence}","'records':evidence,'tuyu':tuyu}")
p.write_text(s)
p=ROOT/'CHANGELOG.md';s=p.read_text();assert '# Changelog\n' in s;s=s.replace('# Changelog\n','# Changelog\n\n## v1.2.10 — 2026-09-23\n\n- 根据外部正式名称资料、原土壤类型图清单及5份真实报告表头，将沧州任丘、河间、肃宁的平台单位“河北图宇地理信息科技有限公司”订正为“河北图宇科技有限公司”。\n- 原PDF实际写“河北图宇”，并无错误长全称；保留报告原简称和全部字节，保留路径及旧名称答复兼容。\n- 后续仅对这个完全匹配的误写且原清单按成果/市/任务唯一对应时应用订正；不泛化到其他公司，不修改原通讯录。\n- 增加真实原件哈希、范围限制、PDF/DOCX字段订正、人工选择和旧答复访问回归；记录外部核实的证据与范围限制。\n',1);p.write_text(s)
p=ROOT/'MAINTENANCE_RULES.md';p.write_text(p.read_text()+'\n\n## v1.2.10 图宇名称证据\n\n- 图宇长名称订正为经核实的完全匹配规则，且必须满足对应成果、市、任务的原通讯录唯一匹配；不得据此模糊归并其他公司。\n- 本批5份原报告只写简称“河北图宇”，本次只订正平台误扩写，不重写原报告；按文件保留核对哈希和旧单位答复关系。\n- 证据说明不是工商主体不存在的证明，不将未核实的名称宣称为登记曾用名。\n')
p=ROOT/'docs/QUALITY_UPLOAD_NAMING.md';p.write_text(p.read_text()+'\n\n## v1.2.10 图宇名称\n\n推荐使用正式名称“河北图宇科技有限公司”。若误写成“河北图宇地理信息科技有限公司”，且对应成果、市、区县的原通讯录唯一分配给河北图宇科技有限公司，则定向订正。其他公司、其他成果的不同归属和人工选择不据此覆盖。既有5份PDF内的“河北图宇”简称保持原样，平台误扩写已经订正。\n')
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert master==re.search(r'var masterList = \[[\s\S]*?\n\];',(ROOT/'index.html').read_text()).group()
assert mapping==(ROOT/'task-unit-mappings.js').read_bytes()
assert token==re.search(r'var tokenCodes = \[[^\]]+\]',(ROOT/'upload-config.js').read_text()).group()
print('TuYu correction complete: 5 platform associations, 0 PDF edits; directory, originals and credential unchanged.')
