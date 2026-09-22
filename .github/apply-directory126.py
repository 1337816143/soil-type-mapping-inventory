from pathlib import Path
import hashlib, re
root=Path.cwd()
assert (root/'VERSION').read_text().strip()=='v1.2.5'
original_master=re.search(r'var masterList = \[[\s\S]*?\n\];',(root/'index.html').read_text()).group()
original_mapping=(root/'task-unit-mappings.js').read_bytes()
assert hashlib.sha256(original_master.encode()).hexdigest()=='ae80ce5de012806935cf9ce6a739212954338d3670b3b652e8b96e1d544dce52'
assert hashlib.sha256(original_mapping).hexdigest()=='00cf15e864c6cc479058b721768e381de3a15420a1be86f8018ebd1163d597e8'
def replace(name,old,new,count=1):
 p=root/name;s=p.read_text();assert old in s,(name,old[:100]);p.write_text(s.replace(old,new,count))
helpers=r'''
  // Read-only, result-specific comparison; never rewrite the directory.
  function directoryStatus(key, city, district, unit) {
    if (!key || !city || !district || !unit) return {status:'incomplete',mismatch:false,listedUnits:[]};
    var listed=flattenTasks([key]).filter(function(r){
      if (compact(r.city)!==compact(city)) return false;
      if (regionForms(r.district).includes(compact(district))) return true;
      if ((r.district===r.city || /市级|本级|汇总/.test(r.district)) && /^(?:市级|市本级|市级汇总|全市)$/.test(district)) return true;
      var subs=window.mergeSubDistricts && window.mergeSubDistricts[city] || [];
      return r.district==='合并区' && subs.some(function(d){return compact(d)===compact(district);});
    });
    var units=unique(listed.map(function(r){return r.unit;}));
    var status=!listed.length?'unlisted-task':units.some(function(u){return unitMatches(u,unit);})?'matched':'unit-mismatch';
    return {status:status,mismatch:status!=='matched',listedUnits:units};
  }
  // Only explicit delimiter-separated city/task fields can become a candidate.
  function unlistedCandidate(text,key,company,city) {
    var parts=normalize(basename(text)).replace(/\.[^.]+$/,'').split(/[_;；|]+/).map(function(p){return p.trim();});
    if (!city || !parts.some(function(p){return compact(p)===compact(city);})) return null;
    var districts=unique(parts.filter(function(p){
      return p!==city && !company.names.includes(p) && /^[\u4e00-\u9fff]{2,18}(?:县|区|市)$/.test(p) &&
        !/成果|质控|报告|评价|作业|单位|公司|研究|农业|学院|普查|片区|测试/.test(p);
    }));
    if (districts.length!==1) return null;
    var district=districts[0];
    if (flattenTasks([key]).some(function(r){return regionForms(r.district).includes(compact(district));})) return null;
    var row={dataKey:key,city:city,district:district,unit:company.name||'',unitSource:company.name?'filename':'',listedUnits:[],directoryStatus:'unlisted-task',
      note:'清单外任务：仅按本次文件归档展示，不新增通讯录条目，不计入原清单收缴进度。'};
    return {row:row,issue:company.name?null:issue(key,'unlisted-company-required','“'+city+' / '+district+'”不在该类成果通讯录中，不能推断作业单位。请在文件名补充“_单位全称_”，或人工明确单位后确认归档。')};
  }
  function confirmationSignature(item,byKey) {
    var selection=Q()&&Q().state&&Q().state.batchSelection;
    var batch=item.manualBatch || (selection&&window.SoilBatchPolicy&&window.SoilBatchPolicy.format(selection)) || inferBatch(item.file&&item.file.name||item.path) || item.batch || '';
    return JSON.stringify([item.path||'',batch,Object.keys(byKey).sort().map(function(k){return [k,byKey[k].map(function(r){return [r.city,r.district,r.unit,r.directoryStatus];})];})]);
  }
  function confirmUnlisted(item) {
    var meta=classifyItem(item),a=meta.assignment;
    if (!a || !a.requiresConfirmation || a.issues.some(function(p){return p.code!=='confirmation-required';})) return false;
    item.directoryConfirmation={file:item.file,signature:confirmationSignature(item,a.byKey),at:new Date().toISOString()};
    applyItemMetadata(item);return true;
  }
'''
replace('admin-auto-classifier.js','  function resolveOne(text, key, company) {',helpers+'\n  function resolveOne(text, key, company) {')
replace('admin-auto-classifier.js',"    } else if (city) {\n      var remaining=geo.split(compact(city)).join('');", "    } else if (city) {\n      var external=unlistedCandidate(text,key,company,city);\n      if(external)return external;\n      var remaining=geo.split(compact(city)).join('');")
replace('admin-auto-classifier.js',"          if (result.issue) problems.push(result.issue); else byKey[key].push(result.row);", "          if (result.issue) problems.push(result.issue);\n          if (result.row) byKey[key].push(result.row);")
replace('admin-auto-classifier.js',"    return {version:2,byKey:byKey,issues:problems,company:company,complete:!problems.length&&keys.length>0};",r'''    var unlisted=false;
    Object.keys(byKey).forEach(function(key){byKey[key].forEach(function(r){
      var check=directoryStatus(key,r.city,r.district,r.unit);
      r.directoryStatus=r.directoryStatus==='unlisted-task'?'unlisted-task':check.status;
      r.directoryMismatch=['unlisted-task','unit-mismatch'].includes(r.directoryStatus);
      if(check.listedUnits.length)r.listedUnits=check.listedUnits;
      if(r.directoryStatus==='unlisted-task')unlisted=true;
    });});
    var recognized=!problems.length&&keys.length>0;
    var requiresConfirmation=unlisted&&recognized;
    var confirmation=item.directoryConfirmation;
    var confirmed=requiresConfirmation&&confirmation&&confirmation.file===item.file&&confirmation.signature===confirmationSignature(item,byKey);
    if (requiresConfirmation&&!confirmed) problems.push(issue('','confirmation-required','清单外任务已提取完整信息。核对下方市、任务单元、单位后，点击“确认按文件名归档”；不修改通讯录，不计入原清单收缴进度。'));
    Object.keys(byKey).forEach(function(key){byKey[key].forEach(function(r){
      if(r.directoryStatus==='unlisted-task'){
        r.outsideDirectoryConfirmed=!!confirmed;
        if(confirmed)r.directoryConfirmedAt=confirmation.at;
      }
    });});
    return {version:2,byKey:byKey,issues:problems,company:company,recognized:recognized,requiresConfirmation:requiresConfirmation&&!confirmed,hasUnlisted:unlisted,complete:!problems.length&&keys.length>0};''')
replace('admin-auto-classifier.js',"    if(a.issues.length)return a.issues.map(function(p){return (TYPE_LABELS[p.dataKey]?TYPE_LABELS[p.dataKey]+'：':'')+p.message;}).join('\\n');\n    var lines=[];", "    var lines=a.issues.map(function(p){return (TYPE_LABELS[p.dataKey]?TYPE_LABELS[p.dataKey]+'：':'')+p.message;});")
replace('admin-auto-classifier.js',"      if(meta.assignment.complete && assigned.length){", "      if(assigned.length){")
replace('admin-auto-classifier.js',"      status.textContent = text;\n      status.className = className;",r'''      status.textContent = text;
      status.className = className;
      var a=meta.assignment;
      var mismatch=!!(a&&Object.keys(a.byKey).some(function(k){return a.byKey[k].some(function(r){return r.directoryMismatch;});}));
      row.classList.toggle('directory-mismatch-preview',mismatch);
      if(mismatch)status.title='与作业单位通讯录不一致';else status.removeAttribute('title');
      var old=row.querySelector('.directory-confirm');if(old)old.remove();
      if(a&&a.requiresConfirmation){
        var control=document.createElement('button');control.type='button';control.className='directory-confirm';
        control.textContent=item.manualAssociation?'确认按所填信息归档':'确认按文件名归档';
        control.onclick=function(){if(confirmUnlisted(item)&&typeof q.renderPreview==='function')q.renderPreview();};
        status.insertAdjacentElement('afterend',control);
      } else if(a&&a.hasUnlisted&&a.complete){
        var control=document.createElement('button');control.type='button';control.className='directory-confirm';
        control.textContent='已确认清单外归档 · 撤销确认';
        control.onclick=function(){delete item.directoryConfirmation;if(typeof q.renderPreview==='function')q.renderPreview();};
        status.insertAdjacentElement('afterend',control);
      }''')
replace('admin-auto-classifier.js',"    listForKey:listForKey,resolveAssignments:","    directoryStatus:directoryStatus,confirmUnlisted:confirmUnlisted,\n    listForKey:listForKey,resolveAssignments:")
replace('admin-import-v2.js',"function batches(){var a=['管理员导入','第一批','第二批','第二批补充','第三批'],td=window.tabData||{};", "function batches(){var a=['管理员导入','第一批','第二批','第二批补充','第三批'].concat(S.batches||[],(S.files||[]).map(function(x){return x.manualBatch||x.batch||''})),td=window.tabData||{};")
replace('admin-import-v2.js',"return batches().map(function(x){return opt(x,x,x===v)}).join('')+opt('__new__'", "return u(batches().concat(v?[v]:[])).map(function(x){return opt(x,x,x===v)}).join('')+opt('__new__'")
replace('admin-import-v2.js',"S.files[i].batch=v.trim();render()", "S.files[i].batch=v.trim();S.files[i].manualBatch=v.trim();render()")
replace('admin-import-v2.js',"manualBatch:h.manualBatch}","manualBatch:h.manualBatch,directoryConfirmation:h.directoryConfirmation}",-1)
replace('admin-import-v2-bridge.js',"manualBatch:item.manualBatch,", "manualBatch:item.manualBatch,directoryConfirmation:item.directoryConfirmation,")
replace('admin-import-v2-bridge.js',"          manualBatch:source.manualBatch||item.manualBatch,", "          directoryConfirmation:source.directoryConfirmation||item.directoryConfirmation,\n          manualBatch:source.manualBatch||item.manualBatch,")
replace('hybrid-staged-upload.js',"        var meta = itemMetadata(item);\n        var dataKeys", "        var meta = itemMetadata(item);\n        if(kind==='quality'&&meta&&meta.assignment&&meta.assignment.hasUnlisted&&!meta.assignment.complete)throw new Error(C().matchingDescription(meta));\n        var dataKeys")
replace('hybrid-staged-upload.js',"      var fallbackDataKey = document.getElementById('adm-data-key').value;", "      var pending=files.find(function(item){var m=itemMetadata(item);return m&&m.assignment&&m.assignment.hasUnlisted&&!m.assignment.complete;});\n      if(pending){progress(classifier.matchingDescription(itemMetadata(pending)),0);return;}\n      var fallbackDataKey = document.getElementById('adm-data-key').value;")
replace('.github/workflows/import-chunked.yml',"                              quality_records.append(row)\n                  elif quality.get('shared'):",r'''                              status = str(association.get('directoryStatus') or '')
                              if status and status not in ('matched', 'unit-mismatch', 'unlisted-task'):
                                  raise SystemExit(f'通讯录核对状态无效：{final_path}')
                              if status == 'unlisted-task' and association.get('outsideDirectoryConfirmed') is not True:
                                  raise SystemExit(f'清单外任务尚未确认：{final_path}')
                              row.update({'directoryStatus': status,
                                          'directoryMismatch': status in ('unit-mismatch', 'unlisted-task'),
                                          'outsideDirectoryConfirmed': association.get('outsideDirectoryConfirmed') is True,
                                          'directoryConfirmedAt': str(association.get('directoryConfirmedAt') or '')})
                              quality_records.append(row)
                  elif quality.get('shared'):''')
replace('dashboard-extension.js',"district.docs.push({batch: entry.batch || '管理员导入', file: relativeFile});", "district.docs.push({batch: entry.batch || '管理员导入', file: relativeFile, directoryStatus:entry.directoryStatus||'', directoryMismatch:!!entry.directoryMismatch, outsideDirectoryConfirmed:!!entry.outsideDirectoryConfirmed});")
replace('index.html',"        if (!d || !d.label) return;\n        result[city.name + '_' + d.label] = true;", "        if (!d || !d.label) return;\n        var classifier=window.SoilAdminAutoClassifier;\n        if (classifier&&classifier.directoryStatus&&classifier.directoryStatus(dataKey,city.name,d.label,unit.name).status==='unlisted-task') return;\n        if ((d.docs||[]).length && d.docs.every(function(doc){return doc.directoryStatus==='unlisted-task';})) return;\n        result[city.name + '_' + d.label] = true;")
replace('page-enhancements-core.js',"    window.renderCities = function(cities, dataKey) {",r'''    function escaped(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    function directoryReview(key,city,unit,d){
      var c=window.SoilAdminAutoClassifier;
      var s=c&&c.directoryStatus?c.directoryStatus(key,city, d.label,unit):{mismatch:false,status:''};
      var flags=(d.docs||[]).filter(function(doc){return doc.directoryMismatch||doc.directoryStatus==='unlisted-task';});
      var mismatch=s.mismatch||flags.length>0;
      var unlisted=s.status==='unlisted-task'||flags.some(function(doc){return doc.directoryStatus==='unlisted-task';});
      var text=[city,d.label,unit].join(' / ');
      if(mismatch)text+='\n与作业单位通讯录不一致'+(unlisted?'：该类成果、该地区不在原清单中；单独归档展示，不计入原清单收缴进度。':'：本次归档单位与该类成果清单单位不同。');
      return {mismatch:mismatch,title:text,attributes:mismatch?' data-directory-mismatch="true" title="'+escaped(text)+'" aria-label="'+escaped(text)+'"':''};
    }
    window.renderCities = function(cities, dataKey) {''')
replace('page-enhancements-core.js',"          html += '<tr><td>'+unit.name+'</td><td><div class=\"district-list\">';", "          var reviews=outcomes.map(function(d){return directoryReview(dataKey,city.name,unit.name,d);});\n          var warned=reviews.filter(function(r){return r.mismatch;});\n          html += '<tr><td'+(warned.length?' class=\"directory-mismatch-unit\" title=\"'+escaped(warned.map(function(r){return r.title;}).join('\\n'))+'\"':'')+'>'+escaped(unit.name)+'</td><td><div class=\"district-list\">';")
replace('page-enhancements-core.js',"          outcomes.forEach(function(d){\n            var isM=", "          outcomes.forEach(function(d){\n            var review=directoryReview(dataKey,city.name,unit.name,d);\n            var isM=")
replace('page-enhancements-core.js',"            var link='district-link'+(isM?", "            var link='district-link'+(review.mismatch?' directory-mismatch':'')+(isM?")
replace('page-enhancements-core.js',"'<a class=\"'+link+'\" href=\"'+window.BASE+'/'+docs[0].file+'\" target=\"_blank\">'+d.label", "'<a class=\"'+link+'\"'+review.attributes+' href=\"'+escaped(window.BASE+'/'+docs[0].file)+'\" target=\"_blank\">'+escaped(d.label)")
replace('page-enhancements-core.js',"'<div class=\"'+group+'\"><span class=\"group-label\">'+d.label", "'<div class=\"'+group+'\"><span class=\"group-label'+(review.mismatch?' directory-mismatch':'')+'\"'+review.attributes+' tabindex=\"0\">'+escaped(d.label)")
replace('page-enhancements-core.js',"'<a class=\"doc-btn\" href=\"'+window.BASE+'/'+doc.file+'\" target=\"_blank\">'", "'<a class=\"doc-btn'+(review.mismatch?' directory-mismatch':'')+'\"'+review.attributes+' href=\"'+escaped(window.BASE+'/'+doc.file)+'\" target=\"_blank\">'")
replace('page-enhancements-core.js',"'<span class=\"'+link+'\">'+d.label", "'<span class=\"'+link+'\"'+review.attributes+'>'+escaped(d.label)")
p=root/'glass-interface.css';p.write_text(p.read_text()+r'''
/* Readable, clickable directory exceptions in every theme/state. */
html.glass-ui .city-section .directory-mismatch,
html.glass-ui .city-section .directory-mismatch:hover,
html.glass-ui .city-section .directory-mismatch.active,
html.glass-ui .city-section .directory-mismatch.open{color:#b42318!important;background:#fff1f0!important;border-color:#e6a49e!important}
html.glass-ui .city-section .directory-mismatch-unit{color:#b42318!important}
.directory-mismatch-preview .v2-file em{color:#b42318!important}
.directory-confirm{display:inline-block;max-width:100%;margin-top:8px;padding:7px 12px;border:1px solid #e6a49e;border-radius:9px;background:#fff1f0;color:#b42318;cursor:pointer;font-weight:650;white-space:normal}
.directory-confirm:hover{background:#ffe5e2}
''')
# Existing browser suite and the post-deployment read-only suite share this check.
replace('scripts/test-workspace-browser.py',"            page.evaluate(\"openSoilAdminImport({kind:'quality',dataKey:'soilType'})\")\n            expect(page.locator('#qc-round-controls'))", "            directory_ui=runpy.run_path(str(ROOT/'scripts/check-directory-ui.py'))['check_directory_ui'](page,OUT,engine)\n            (OUT/(engine+'-directory-ui-report.json')).write_text(json.dumps(directory_ui,ensure_ascii=False,indent=2))\n            page.evaluate(\"openSoilAdminImport({kind:'quality',dataKey:'soilType'})\")\n            expect(page.locator('#qc-round-controls'))")
replace('scripts/test-live-workspace.py',"        page.locator('[data-tab=\"soilType\"]').click()", "        report['directoryUI']=runpy.run_path(str(ROOT/'scripts/check-directory-ui.py'))['check_directory_ui'](page,OUT,'live')\n        page.locator('[data-tab=\"soilType\"]').click()")
replace('.github/workflows/workspace-live-check.yml','            scripts/glass-ui-checks.py','            scripts/glass-ui-checks.py\n            scripts/check-directory-ui.py')
replace('CHANGELOG.md','# Changelog\n','# Changelog\n\n## v1.2.6 — 2026-09-23\n\n- 清单外任务保留明确的市、任务单元、成果和单位，逐文件确认归档；不修改通讯录或统计分母，不计入原清单收缴进度。\n- 缺少单位不猜配；换文件、改变归属或批次后原确认失效。新识别及新建批次同步到下拉框。\n- 通讯录不一致或不存在的成果、分批链接和单位文字标红；悬停追加“与作业单位通讯录不一致”，保留原操作入口。\n- 归档索引保存核对状态及确认信息；加入永年区、确认撤销/失效、混合批次、实际索引写入和红色展示/统计不变的回归与线上检查。\n')
p=root/'MAINTENANCE_RULES.md';p.write_text(p.read_text()+'''\n## v1.2.6 清单外任务与通讯录差异\n\n- 文件名解析与查表分离，完整清单外任务须逐文件确认；缺单位、多重含义或矛盾不得绕过。\n- 确认仅绑定当前文件、成果归属和批次，改变后须重新确认；状态进入归档索引。\n- 清单外文件单独展示，不改原清单及统计分母，不冒充原有任务计入收缴进度。\n- 通讯录不一致或不存在的成果及单位标红，悬停追加“与作业单位通讯录不一致”，不移除原有操作入口。\n- 文件级批次下拉必须包含实际识别值，新建批次重渲染后不得丢失。\n''')
p=root/'docs/QUALITY_UPLOAD_NAMING.md';p.write_text(p.read_text()+'''\n## v1.2.6 清单外地区\n\n```text\n邯郸市_永年区_土特产品土壤适宜性评价_河北省农林科学院农业资源环境研究所_质控意见_2026年第二次第1批.docx\n```\n\n完整命名解析为候选，预览保留全部字段；核对后点击“确认按文件名归档”，再填写管理员密码上传。清单外任务必须提供单位全称；换文件、改变批次或归属须重新确认。\n\n清单外任务及单位不一致的成果在展示区标红，悬停追加“与作业单位通讯录不一致”。清单外文件不计入原清单收缴进度，不修改通讯录或统计分母。\n''')
assert re.search(r'var masterList = \[[\s\S]*?\n\];',(root/'index.html').read_text()).group()==original_master
assert (root/'task-unit-mappings.js').read_bytes()==original_mapping
print('Directory exception code prepared; embedded list bytes unchanged')
