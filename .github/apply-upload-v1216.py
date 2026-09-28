from pathlib import Path
import re,subprocess,hashlib
assert Path('VERSION').read_text().strip()=='v1.2.15'
master_before=re.search(r'var masterList = \[[\s\S]*?\n\];',Path('index.html').read_text()).group()
mapping_before=Path('task-unit-mappings.js').read_bytes()

def replace(path,old,new):
 p=Path(path);s=p.read_text();assert old in s,(path,old[:120]);p.write_text(s.replace(old,new))

p=Path('admin-auto-classifier.js');s=p.read_text()
s=s.replace("['soilAttr', /土壤属性图|土壤属性成果|属性图成果|属性图/]", "['soilAttr', /土壤属性(?:图|制图)|土壤属性成果|属性图成果|属性图/]")
s=s.replace("['soilType', /土壤类型图|土壤类型成果|土类图|类型图成果/]", "['soilType', /土壤类型(?:图|制图)|土壤类型成果|土类图|类型图成果/]")
s=s.replace("return /总体报告|工作报告|数据报告/.test(normalize(text));", "return /总体报告|工作报告|数据报告/.test(normalize(text).replace(/\\s+/g,''));")
marker='  function inferKind(text, dataKeys) {'
assert marker in s
s=s.replace(marker,r'''  // A filename is evidence of category, not proof of document content. Keep
  // unmarked report originals unresolved until the administrator attests that
  // the selected file is actually a quality opinion. Do not rename its bytes.
  function reportOpinionState(item, dataKeys) {
    item=item||{};
    var file=item.file||{}, name=basename(file.name||item.path||'');
    var inferred=inferDataKeys(name), keys=dataKeys||inferred;
    var relevant=keys.indexOf('reports')>=0 || (!inferred.length && isReportFamily(name) && !isReportReference(name));
    var required=relevant && !isReportOpinion(name);
    var signature=JSON.stringify([name,Number(file.size||0),Number(file.lastModified||0),normalize(item.sourcePath||item.path||'')]);
    var saved=item.qualityOpinionConfirmation;
    return {required:required,confirmed:!!(required && saved && saved.signature===signature && saved.kind==='quality-opinion'),signature:signature};
  }
  function confirmReportOpinion(item) {
    var state=reportOpinionState(item,item.autoMeta&&item.autoMeta.dataKeys);
    if(!state.required)return false;
    item.qualityOpinionConfirmation={kind:'quality-opinion',signature:state.signature,confirmedAt:new Date().toISOString()};
    applyItemMetadata(item);return true;
  }
  function askReportOpinions(items) {
    if(!items.length)return;
    if(!window.confirm('请打开并核对所选 '+items.length+' 份文件的实际内容。\n\n文件必须是总体、工作、数据报告的质控意见，不得为报告原件。\n文件名未写“质控意见”并不代表内容已通过检查。\n\n确认这些文件均为质控意见后继续？'))return;
    items.forEach(confirmReportOpinion);
    var q=Q();if(q&&q.renderPreview)q.renderPreview();
    refresh();
  }

''' +marker)
old="if (!keys.length || !manual.city || !manual.unit || !manual.district) problems.push(issue('','manual-incomplete','人工调整尚未填写完整，请选择成果类型、市、作业单位和任务单元。'));"
new="""var missing=[];
      if(!keys.length)missing.push('成果类型');
      ['city','unit','district'].forEach(function(field){if(!manual[field])missing.push({city:'市',unit:'作业单位',district:'任务单元'}[field]);});
      if(missing.length)problems.push(issue('','manual-incomplete','尚未填写：'+missing.join('、')+'。请在该文件右侧补充；已填写的其他信息已保留。'));"""
assert old in s;s=s.replace(old,new)
s=s.replace("'尚未识别成果类型，请使用完整成果名称或人工选择成果类型。'", "'尚未识别成果类型。请在该文件右侧“成果类型（必选）”中选择，不必重复填写市、作业单位和任务单元。'")
old="var keys = exact ? exact.dataKeys.slice() : item.manualDataKey ? [item.manualDataKey] : inferDataKeys(text);"
new="""var keys = exact ? exact.dataKeys.slice() : Object.prototype.hasOwnProperty.call(TYPE_LABELS,item.manualDataKey) ? [item.manualDataKey] : inferDataKeys(text);
    // Do not reuse a dropdown's default type for an unrecognized filename.
    // Report candidates have a known category but require content attestation.
    if(!exact && !keys.length && currentMode()==='quality' && isReportFamily(text) && !isReportReference(text))keys=['reports'];"""
assert old in s;s=s.replace(old,new)
old="var assignment = kind === 'quality' && !exact ? resolveAssignments(item,keys,targets) : null;"
new=old+"""
    var reportOpinion=reportOpinionState(item,keys);
    if(assignment && reportOpinion.required && !reportOpinion.confirmed){
      assignment.issues.unshift(issue('reports','report-opinion-unconfirmed','文件名未明确标注质控意见。请核对文件内容；确为意见文件可点“确认是质控意见”，报告原件请移除。'));
      assignment.complete=false;assignment.canConfirmOutside=false;
    }"""
assert old in s;s=s.replace(old,new)
s=s.replace('    result.assignment = assignment;', '    result.assignment = assignment;\n    result.reportOpinion = reportOpinion;')
s=s.replace("'；全部已自动识别，无需手动指定'", "'；归档信息完整，可开始上传'")
# Clear any explicit bulk default when the user restores automatic mode.
s=s.replace("if(!manualMode){var q=Q();(q&&q.state&&q.state.files||[])", "if(!manualMode){var q=Q();if(q&&q.state)q.state.manualDataKey='';(q&&q.state&&q.state.files||[])")
old='    setManualFieldsVisible(manualMode || state.unresolved > 0 || state.kind === \'mixed\');'
new="""    var pending=(Q()&&Q().state&&Q().state.files||[]).filter(function(item){var info=item.autoMeta&&item.autoMeta.reportOpinion;return info&&info.required&&!info.confirmed;});
    if(pending.length>1){
      var confirmButton=document.createElement('button');confirmButton.type='button';confirmButton.className='confirm-report-opinions';
      confirmButton.textContent='确认这'+pending.length+'份为质控意见';confirmButton.onclick=function(){askReportOpinions(pending);};
      summary.querySelector('.auto-import-actions').appendChild(confirmButton);
    }
"""+old
assert old in s;s=s.replace(old,new)
old="      var oldButton=row.querySelector('.confirm-outside-task');if(oldButton)oldButton.remove();"
new="""      var prior=row.querySelector('.confirm-report-opinion');if(prior)prior.remove();
      if(meta.reportOpinion&&meta.reportOpinion.required){
        var reportButton=document.createElement('button');reportButton.type='button';reportButton.className='confirm-report-opinion';
        reportButton.textContent=meta.reportOpinion.confirmed?'撤销质控意见确认':'确认是质控意见';
        reportButton.onclick=function(){if(meta.reportOpinion.confirmed){delete item.qualityOpinionConfirmation;applyItemMetadata(item);if(Q()&&Q().renderPreview)Q().renderPreview();refresh();}else askReportOpinions([item]);};
        row.querySelector('.v2-file').appendChild(reportButton);
      }
"""+old
assert old in s;s=s.replace(old,new)
s=s.replace('    inferKind:inferKind,', '    inferKind:inferKind,\n    reportOpinionState:reportOpinionState,confirmReportOpinion:confirmReportOpinion,')
p.write_text(s)

p=Path('admin-import-v2.js');s=p.read_text()
# Save only an explicit choice; new selections/ZIP preparation inherit that
# choice within the current dialog, never an implicit first option.
s=s.replace('manualDataKey:h.manualDataKey,manualBatch:', "manualDataKey:h.manualDataKey!==undefined?h.manualDataKey:(S.manualDataKey||''),qualityOpinionConfirmation:h.qualityOpinionConfirmation,manualBatch:",1)
s=s.replace('manualDataKey:h.manualDataKey,manualBatch:', 'manualDataKey:h.manualDataKey,qualityOpinionConfirmation:h.qualityOpinionConfirmation,manualBatch:')
old='function row(x,i){var k=itemKey(x);'
new="""function typeOptions(x){
 var keys=x.autoMeta&&x.autoMeta.dataKeys||[],labels=Q.types(),auto=x.manualDataKey?'自动识别（重新判断）':keys.length?'自动识别：'+keys.map(function(k){return labels[k]||k}).join('、'):'请选择成果类型';
 if(x.autoMeta&&x.autoMeta.catalogMatched)return opt('','权威登记：'+keys.map(function(k){return labels[k]||k}).join('、'),true);
 return opt('',auto,!x.manualDataKey)+Object.keys(labels).map(function(k){return opt(k,labels[k],x.manualDataKey===k)}).join('');
}
function row(x,i){var k=itemKey(x);"""
assert old in s;s=s.replace(old,new)
old='<div class="v2-fields"><label>批次<select class="rb">'
new='''<div class="v2-fields"><label class="v2-type-field">成果类型（必选）<select class="rt" aria-label="成果类型（必选）" aria-invalid="'+(x.autoMeta&&x.autoMeta.dataKeys.length?'false':'true')+'"'+(x.autoMeta&&x.autoMeta.catalogMatched?' disabled':'')+'>'+typeOptions(x)+'</select></label><label>批次<select class="rb">'''
assert old in s;s=s.replace(old,new)
old="r.querySelector('.rb').onchange=function()"
new="""r.querySelector('.rt').onchange=function(){var x=S.files[i];x.manualDataKey=this.value;delete x.unlistedConfirmation;if(!this.value){delete x.manualAssociation;}render();if(window.SoilAdminAutoClassifier)window.SoilAdminAutoClassifier.refresh();};r.querySelector('.rb').onchange=function()"""
assert old in s;s=s.replace(old,new)
s=s.replace('var key=this.value;S.files.forEach(function(x){x.manualDataKey=key})', "var key=this.value;S.manualDataKey=key;S.files.forEach(function(x){x.manualDataKey=key;delete x.unlistedConfirmation;})")
s=s.replace("Q.open=function(c){S.context=c||{kind:'quality'};S.batchSelection=null;S.files=[];", "Q.open=function(c){S.context=c||{kind:'quality'};S.batchSelection=null;S.manualDataKey='';S.files=[];")
s=s.replace(".v2-fields label{", ".v2-fields .v2-type-field{grid-column:1/-1}.v2-fields .rt[aria-invalid=true]{border-color:#b45309}.confirm-report-opinion{align-self:flex-start;margin-top:6px;padding:5px 9px;border:1px solid #93c5fd;border-radius:6px;background:#eff6ff;color:#1d4ed8;cursor:pointer;font-size:.72rem}.auto-import-actions .confirm-report-opinions{margin-left:8px}.v2-fields label{")
start=s.index('Q.confirmQualityOnly=function(');end=s.index('\n',start)
s=s[:start]+r'''Q.validateQualityMetadata=function(files){
 var C=window.SoilAdminAutoClassifier;if(!C)return true;
 var invalid=[];(files||[]).forEach(function(x,i){var meta=C.applyItemMetadata(x);if(meta.kind==='quality'&&!C.isResolved(x,meta))invalid.push({index:i,item:x,meta:meta});});
 if(!invalid.length)return true;
 Q.progress('请先完成 '+invalid.length+' 份文件的核对：\n'+invalid.slice(0,3).map(function(x){return A.base(x.item.path)+'：'+C.matchingDescription(x.meta);}).join('\n')+(invalid.length>3?'\n其余问题见各文件旁的提示。':''),0,true);
 var row=document.querySelector('#adm-list .v2-row[data-i="'+invalid[0].index+'"]');
 if(row){row.scrollIntoView({block:'nearest'});var control=row.querySelector('.confirm-report-opinion')||row.querySelector('.rt[aria-invalid="true"]')||row.querySelector('.rt');if(control)control.focus({preventScroll:true});}
 return false;
};
Q.confirmQualityOnly=function(files,kind,key){
 if(kind!=='quality')return true;
 var C=window.SoilAdminAutoClassifier;
 var pending=files.filter(function(x){if(!C||!C.reportOpinionState)return false;var info=C.reportOpinionState(x,x.autoMeta&&x.autoMeta.dataKeys);return info.required&&!info.confirmed;});
 if(pending.length){Q.progress('请先核对 '+pending.length+' 份文件的内容，并点击文件旁的“确认是质控意见”；本平台不上传报告原件。',0,true);return false;}
 return confirm(key==='reports'?'请确认所选文件均为总体、工作、数据报告的质控意见，不含报告原件。意见可合并为一份或分别出具。确认后继续上传？':'请确认所选文件均为质控意见，不含任何成果原件。确认后继续上传？');
};''' +s[end:]
# The old non-hybrid fallback cannot bypass the same metadata validation.
old="if(!Q.confirmQualityOnly(files,kind,document.getElementById('adm-data-key').value))return;"
assert old in s;s=s.replace(old,"if(kind==='quality'&&!Q.validateQualityMetadata(files))return;"+old)
p.write_text(s)

p=Path('hybrid-staged-upload.js');s=p.read_text()
old="      if (typeof q.confirmQualityOnly === 'function' && !q.confirmQualityOnly(files, kind, fallbackDataKey)) return;"
assert old in s;s=s.replace(old,"      if (typeof q.validateQualityMetadata === 'function' && !q.validateQualityMetadata(files)) return;\n"+old)
old='          record.quality.assignmentVersion=2;'
assert old in s;s=s.replace(old,old+"\n          if(meta.reportOpinion && meta.reportOpinion.confirmed)record.quality.opinionConfirmation=Object.assign({},item.qualityOpinionConfirmation);")
p.write_text(s)

# Preserve editable rows when preprocessing stops at a metadata problem.
replace('pptx-auto-split.js',"q.state.files=files;if(box)box.innerHTML=files.map", "q.state.files=files;if(typeof q.renderPreview==='function'){q.renderPreview();return;}if(box)box.innerHTML=files.map")

# Integrate into both existing mock-browser regression and deployed read-only checks.
replace('scripts/test-workspace-browser.py',"            report_ui=runpy.run_path", "            metadata_ui=runpy.run_path(str(ROOT/'scripts/check-upload-metadata-ui.py'))['check_upload_metadata_ui'](page,OUT,engine)\n            (OUT/(engine+'-upload-metadata-report.json')).write_text(json.dumps(metadata_ui,ensure_ascii=False,indent=2))\n            report_ui=runpy.run_path")
replace('scripts/check-assignment-ui.py',"to_contain_text('人工调整尚未填写完整')", "to_contain_text('尚未填写：作业单位、任务单元。')")
replace('scripts/validate-auto-import-classifier.js',"// End-to-end mapping checks use the real embedded lists and actual Actions writer.","require('child_process').execFileSync(process.execPath,['scripts/validate-upload-metadata.js'],{stdio:'inherit'});\n\n// End-to-end mapping checks use the real embedded lists and actual Actions writer.")
replace('scripts/test-live-workspace.py',"        tabs=page.locator('header .tabs .tab').all_text_contents()",r'''        report['uploadMetadata']=page.evaluate(r"""()=>{
          const C=SoilAdminAutoClassifier,before=JSON.stringify(SoilTaskUnitLists);
          if(C.inferDataKeys('黄骅市_土壤属性制图_河北玛恩农业科技有限公司_2026年第三次第1批.pdf').join()!=='soilAttr')throw Error('Property-mapping alias failed');
          const name='元氏县_总体、工作、数据报告-河北湛泸软件开发有限公司_2026年第二次第1批.pdf';
          const item={file:{name,size:16,lastModified:1},path:name,sourcePath:name,manualDataKey:'reports'};
          let m=C.applyItemMetadata(item);
          if(m.assignment.complete||!m.reportOpinion.required)throw Error('Unmarked report requires attestation');
          C.confirmReportOpinion(item);m=C.applyItemMetadata(item);
          if(!m.assignment.complete||item.unit!=='河北湛泸软件开发有限公司')throw Error('Attested opinion metadata failed');
          if(JSON.stringify(SoilTaskUnitLists)!==before)throw Error('Roster mutated');
          return {status:'passed',mode:'disposable memory only',checks:['property mapping alias','unmarked report protected','attestation resolves known report','other roster remains unchanged']};
        }""")
        tabs=page.locator('header .tabs .tab').all_text_contents()''')
p=Path('CHANGELOG.md');p.write_text(p.read_text().replace('# Changelog\n', '''# Changelog

## v1.2.16 — 2026-09-28

- 修复“土壤属性制图/土壤类型制图”别名无法识别；严格分开属性图和类型图及对应通讯录。
- 每个文件增加“成果类型（必选）”，人工补充时精确指出缺项；批量类型选择在选文件之前和之后均保留，自动刷新不覆盖人工选择。
- 报告栏目区分“识别报告类别”和“确认文件性质”：缺少质控字样的文件仍需管理员核对内容并逐份/批量确认确为质控意见；不默认放行报告原件，不强迫改写原文件名或内容。确认绑定所选文件，重选、撤销后重新校验。
- 上传前就地拦截未完成的必要字段并定位问题行，避免确认继续后又在生成归档清单时失败；预处理、分块上传保留人工类型及文件性质确认。
- 仅修改识别/预览/校验和测试，不改原通讯录、历史归属、附件、凭证、已有版式及片区颜色。
''',1))
p=Path('MAINTENANCE_RULES.md');p.write_text(p.read_text()+'''

## v1.2.16 上传元数据

- 成果类型为逐文件必选元数据，未知时必须在该文件旁显示可操作的选择框和准确缺项，不能只显示市/单位/任务后报通用“未填完整”。
- 用户主动选择的批量类型对本次新选文件和预处理有效；默认下拉框首项不是识别证据。恢复自动模式清除人工类型/归属，但不能误用其他成果清单。
- 报告栏目只上传质控意见。文件名无意见标识时只识别类别，不默认认定内容；允许管理员核对内容后明确确认真实意见文件，确认绑定文件并留存在暂存清单，报告原件不得确认上传。
- 完整归档验证在上传文件字节前执行；确认和人工类型在归档清单中保持一致，未确定的地区和单位继续沿用原核对规则。
''')
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert master_before==re.search(r'var masterList = \[[\s\S]*?\n\];',Path('index.html').read_text()).group()
assert mapping_before==Path('task-unit-mappings.js').read_bytes()
print('v1.2.16 patch applied; original rosters unchanged')
