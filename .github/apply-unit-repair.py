from pathlib import Path
import re,hashlib,subprocess
assert Path('VERSION').read_text().strip()=='v1.2.6'
original_token=re.search(r'var tokenCodes = \[[^\]]+\]',Path('upload-config.js').read_text()).group()
master_before=re.search(r'var masterList = \[[\s\S]*?\n\];',Path('index.html').read_text()).group()
mapping_before=Path('task-unit-mappings.js').read_bytes()
def edit(file,old,new,count=1):
 p=Path(file);s=p.read_text();assert old in s,(file,old[:90]);p.write_text(s.replace(old,new,count))
anchor='  function directoryAttributes(key,city,unit,district,batch,file) {'
edit('admin-auto-classifier.js',anchor,Path('.github/unit-evidence-insert.js').read_text()+anchor)
edit('admin-auto-classifier.js',"      var status=directoryStatus(key,row.city,row.unit,row.district);\n      row.directoryStatus=status.code;row.directoryMessage=status.message;rows.push(row);", """      if(row.unitSource!=='manual'){
        var evidence=unitEvidence(key,row.city,row.district,row.unit);
        if(evidence.action!=='keep'){
          row.unitCorrection=evidence;row.unit=evidence.unit;row.unitSource='directory-evidence';
          row.note='依通讯录'+(evidence.action==='typo'?'订正单位错字':'补齐未明单位')+'：“'+evidence.originalUnit+'” → “'+evidence.unit+'”。'+evidence.reason;
        }
      }
      var status=directoryStatus(key,row.city,row.unit,row.district);
      row.directoryStatus=status.code;row.directoryMessage=status.message;rows.push(row);""")
edit('admin-auto-classifier.js',"r.unitSource==='manual'?'人工指定':r.unitSource==='filename'?'文件名单位':", "r.unitSource==='manual'?'人工指定':r.unitSource==='directory-evidence'?'通讯录证据订正':r.unitSource==='filename'?'文件名单位':")
edit('admin-auto-classifier.js','directoryStatus:directoryStatus,directoryAttributes:directoryAttributes,confirmOutside:confirmOutside,','unitEvidence:unitEvidence,unknownUnit:unknownUnit,\n    directoryStatus:directoryStatus,directoryAttributes:directoryAttributes,confirmOutside:confirmOutside,')
edit('dashboard-extension.js',"      district.docs.push({batch: entry.batch || '管理员导入', file: relativeFile});", "      var documentRecord={batch: entry.batch || '管理员导入', file: relativeFile};\n      ['unitCorrection','unitReviewRequired','unitReviewMessage'].forEach(function(k){if(entry[k])documentRecord[k]=entry[k];});\n      district.docs.push(documentRecord);")
edit('page-enhancements-core.js',"""    function directoryInfo(key,city,unit,district,batch,file){
      var c=window.SoilAdminAutoClassifier;
      return c&&c.directoryAttributes?c.directoryAttributes(key,city,unit,district,batch,file):{mismatch:false,title:''};
    }""", """    function directoryInfo(key,city,unit,district,batch,file,docs){
      var c=window.SoilAdminAutoClassifier;
      var info=c&&c.directoryAttributes?c.directoryAttributes(key,city,unit,district,batch,file):{mismatch:false,title:''};
      var pending=(docs||[]).filter(function(d){return d.unitReviewRequired;});
      if(pending.length){info=Object.assign({},info,{mismatch:true,code:'header-unverified',title:info.title+'\\n与作业单位通讯录不一致\\n'+pending.map(function(d){return (d.batch?d.batch+'：':'')+(d.unitReviewMessage||'报告单位尚待核对');}).join('\\n')});}
      return info;
    }""")
edit('page-enhancements-core.js','return directoryInfo(dataKey,city.name,unit.name,d.label);',"return directoryInfo(dataKey,city.name,unit.name,d.label,'','',d.docs);")
edit('page-enhancements-core.js',"directoryInfo(dataKey,city.name,unit.name,d.label,docs.map(function(doc){return doc.batch;}).join('、'));", "directoryInfo(dataKey,city.name,unit.name,d.label,docs.map(function(doc){return doc.batch;}).join('、'),'',docs);")
edit('page-enhancements-core.js','directoryInfo(dataKey,city.name,unit.name,d.label,docs[0].batch,docs[0].file)','directoryInfo(dataKey,city.name,unit.name,d.label,docs[0].batch,docs[0].file,[docs[0]])')
edit('page-enhancements-core.js', '''docs.forEach(function(doc){html+='<a class="doc-btn'+(info.mismatch?' directory-mismatch':'')+'"'+directoryAttrs(directoryInfo(dataKey,city.name,unit.name,d.label,doc.batch,doc.file))''', '''docs.forEach(function(doc){var docInfo=directoryInfo(dataKey,city.name,unit.name,d.label,doc.batch,doc.file,[doc]);html+='<a class="doc-btn'+(docInfo.mismatch?' directory-mismatch':'')+'"'+directoryAttrs(docInfo)''')
helper="""  // Corrected assignments still find replies saved under an audited old unit.
  function correctedUnitReply(dataKey,city,unit,district,batch){
    var candidates=[unit];
    ((window.tabData&&tabData[dataKey])||[]).forEach(function(c){
      if(!same(c.name,city))return;
      (c.units||[]).forEach(function(u){if(!same(u.name,unit))return;
        (u.districts||[]).forEach(function(d){if(!same(d.label,district))return;
          (d.docs||[]).forEach(function(doc){
            var x=doc.unitCorrection;if(!x||!x.originalUnit||!same(x.unit,unit))return;
            var sameBatch=!batch || (window.SoilBatchPolicy?SoilBatchPolicy.identity(doc.batch)===SoilBatchPolicy.identity(batch):same(doc.batch,batch));
            if(sameBatch)candidates.push(x.originalUnit);
          });
        });
      });
    });
    var matches=unique(candidates).map(function(name){return window.replyIndex&&window.replyIndex[replyKey(city,name,district,batch)];}).filter(Boolean);
    matches.sort(function(a,b){return String(b.time||'').localeCompare(String(a.time||''));});return matches[0];
  }

"""
edit('upload-auth-reply-batch.js','  function applyReplyFiles(files) {',helper+'  function applyReplyFiles(files) {')
edit('upload-auth-reply-batch.js',"var legacy = window.replyIndex && replyIndex[replyKey(city, unit, district, '')];","var legacy = correctedUnitReply(dataKey, city, unit, district, '');")
edit('upload-auth-reply-batch.js',"var reply = window.replyIndex && replyIndex[replyKey(city, unit, district, batch)];","var reply = correctedUnitReply(dataKey, city, unit, district, batch);")
# Stage workflow as an ordinary file; repository connector will install it.
f=Path('.github/workflows/import-chunked.yml');s=f.read_text()
s=s.replace("                      'uploadedAt': str(manifest.get('createdAt') or '')", "                      'uploadId': str(manifest.get('uploadId') or ''),\n                      'uploadedAt': str(manifest.get('createdAt') or '')")
s=s.replace("                                          'unitSource': str(association.get('unitSource') or ''),", "                                          'unitCorrection': association.get('unitCorrection') if isinstance(association.get('unitCorrection'), dict) else {},\n                                          'unitSource': str(association.get('unitSource') or ''),")
step="""      - name: Reconcile report submitters with immutable result-specific directory
        shell: bash
        run: |
          set -euo pipefail
          if python3 -c "import json,sys; sys.exit(0 if json.load(open('/tmp/soil-hybrid-manifest.json')).get('kind')=='quality' else 1)"; then
            python3 -m pip install PyMuPDF==1.26.4 lxml==6.0.1 numpy==2.2.6 Pillow==11.3.0
            UPLOAD_ID=$(python3 -c "import json;print(json.load(open('/tmp/soil-hybrid-manifest.json'))['uploadId'])")
            PYTHONDONTWRITEBYTECODE=1 python3 scripts/repair-quality-units.py --mode incoming --upload-id "$UPLOAD_ID"
          fi

"""
assert '      - name: Commit imported files once\n' in s
s=s.replace('      - name: Commit imported files once\n',step+'      - name: Commit imported files once\n')
Path('.github/import-chunked-v127.yml').write_text(s)
# Make tests exercise the actual new workflow during preparation, then restore before bot push.
f.write_text(s)
anchor='            page.evaluate("openSoilAdminImport({kind:\'quality\',dataKey:\'soilType\'})")'
edit('scripts/test-workspace-browser.py',anchor,"            unit_ui=runpy.run_path(str(ROOT/'scripts/check-unit-repair-ui.py'))['check_unit_repair_ui'](page,OUT,engine)\n            (OUT/(engine+'-unit-repair-ui-report.json')).write_text(json.dumps(unit_ui,ensure_ascii=False,indent=2))\n"+anchor)
edit('CHANGELOG.md','# Changelog\n','''# Changelog

## v1.2.7 — 2026-09-23

- 按成果类型、所属市及任务单元的原通讯录核对历史质控报告：补齐可唯一确定的未明单位；仅订正已核实错字或报告表头与通讯录全称一致所能证明的平台归属错误。
- 只修改报告内提交单位字段并同步平台归属；报告原路径不变，正文、截图、页数和版式保持，原版本可从 Git 历史追溯。
- 新上传 PDF/DOCX 默认执行同一证据核对；不以字符串相似度强改单位，不修改签名文档，不给无单位栏的报告添加新表格。证据不足继续标红。
- 订正保留原单位、依据、文件前后哈希；旧单位名下的整改答复仍可查看，不移动答复。
- 原 masterList、task-unit-mappings.js、北部28份权威登记及应交统计分母不变。
''')
p=Path('MAINTENANCE_RULES.md');p.write_text(p.read_text()+'''
## v1.2.7 单位证据订正

- 通讯录只读。未明单位仅在该成果/市/任务组合唯一确定且没有报告反证时补齐。
- 不因与通讯录不一致就替换现有完整公司；仅已核实错字对，或报告表头与对应通讯录全称双重证据，允许订正。
- 报告仅编辑提交/作业/编制单位元数据单元格，不改变报告意见、截图、评审人单位、数字签名，不添加新表格。
- 报告、平台及审计一致。编辑失败或证据不足保持红色，原始版本留在 Git 历史或上传暂存分支。
- 原目录、文件路径、分成果关系、清单外确认、历史答复、应交统计分母保留。
''')
p=Path('docs/QUALITY_UPLOAD_NAMING.md');p.write_text(p.read_text()+'''

## v1.2.7 单位自动核对

命名模板不变。公司可以省略，按对应成果通讯录补齐。已核实的“中地科动察设计有限公司”错字，仅在同成果、同地区唯一匹配成立时订正为“中地科勘察设计有限公司”；不猜测替换任意相似名称。

归档时自动核对 PDF/DOCX 开头元数据表的提交单位：空白字段能唯一配对的补齐，已核实错字只改该单元格。报告与通讯录实质冲突或不能安全编辑时保留原文并标红。没有提交单位栏的报告只补平台归属，不额外添加表格。

订正保留原单位、依据和前后 SHA-256；旧报告原件留在 Git 上一版本，新上传原件保留于上传暂存分支，公开文件路径保持不变。
''')
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert re.search(r'var tokenCodes = \[[^\]]+\]',Path('upload-config.js').read_text()).group()==original_token
assert re.search(r'var masterList = \[[\s\S]*?\n\];',Path('index.html').read_text()).group()==master_before
assert Path('task-unit-mappings.js').read_bytes()==mapping_before
print('Bounded evidence integration applied; original lists and credential unchanged')
