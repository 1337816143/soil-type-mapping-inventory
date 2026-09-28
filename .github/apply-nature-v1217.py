from pathlib import Path
import re, subprocess, hashlib
assert Path('VERSION').read_text().strip() == 'v1.2.16'
master = re.search(r'var masterList = \[[\s\S]*?\n\];', Path('index.html').read_text()).group()
mapping = Path('task-unit-mappings.js').read_bytes()

def replace(path, old, new):
    p=Path(path); s=p.read_text(); assert old in s,(path,old[:100]); p.write_text(s.replace(old,new))
def cut(path, start, end):
    p=Path(path); s=p.read_text(); a=s.index(start); b=s.index(end,a); p.write_text(s[:a]+s[b:])

# Routing metadata remains. No inspection, attestation or filename requirement
# for distinguishing originals from opinions (owner clarified platform use).
cut('admin-auto-classifier.js', '  function isReportOpinion(text) {', '  function inferDataKeys(text) {')
replace('admin-auto-classifier.js', 'isReportFamily(text) && isReportOpinion(text) && !isReportReference(text)', 'isReportFamily(text) && !isReportReference(text)')
cut('admin-auto-classifier.js', '  // A filename is evidence of category, not proof of document content.', '  function inferKind(text, dataKeys) {')
cut('admin-auto-classifier.js', "    // Do not reuse a dropdown's default type for an unrecognized filename.", '    var kind = exact ? exact.kind : inferKind(text, keys);')
cut('admin-auto-classifier.js', '    var reportOpinion=reportOpinionState(item,keys);', '    if(assignment){')
replace('admin-auto-classifier.js', '    result.reportOpinion = reportOpinion;\n', '')
cut('admin-auto-classifier.js', '    var pending=(Q()&&Q().state&&Q().state.files||[]).filter(function(item){var info=item.autoMeta&&item.autoMeta.reportOpinion;', '    setManualFieldsVisible(manualMode || state.unresolved')
cut('admin-auto-classifier.js', "      var prior=row.querySelector('.confirm-report-opinion');", "      var oldButton=row.querySelector('.confirm-outside-task');")
replace('admin-auto-classifier.js', '    reportOpinionState:reportOpinionState,confirmReportOpinion:confirmReportOpinion,\n', '')

cut('admin-import-v2.js', 'Q.confirmQualityOnly=function(files,kind,key){', 'function startUpload(){')
replace('admin-import-v2.js', "if(!Q.confirmQualityOnly(files,kind,document.getElementById('adm-data-key').value))return;", '')
replace('admin-import-v2.js', "row.querySelector('.confirm-report-opinion')||", '')
for p in ['admin-import-v2.js', 'admin-import-v2-bridge.js']:
    s=Path(p).read_text()
    s=s.replace('qualityOpinionConfirmation:h.qualityOpinionConfirmation,','')
    s=s.replace('qualityOpinionConfirmation:item.qualityOpinionConfirmation,','')
    s=s.replace('          qualityOpinionConfirmation:source.qualityOpinionConfirmation||item.qualityOpinionConfirmation,\n','')
    Path(p).write_text(s)
replace('admin-import-v2.js', '.confirm-report-opinion{align-self:flex-start;margin-top:6px;padding:5px 9px;border:1px solid #93c5fd;border-radius:6px;background:#eff6ff;color:#1d4ed8;cursor:pointer;font-size:.72rem}.auto-import-actions .confirm-report-opinions{margin-left:8px}', '')
replace('hybrid-staged-upload.js', "      if (typeof q.confirmQualityOnly === 'function' && !q.confirmQualityOnly(files, kind, fallbackDataKey)) return;\n", '')
replace('hybrid-staged-upload.js', '          if(meta.reportOpinion && meta.reportOpinion.confirmed)record.quality.opinionConfirmation=Object.assign({},item.qualityOpinionConfirmation);\n', '')
replace('dashboard-extension.js', '这里只存放总体报告、工作报告、数据报告对应的质控意见；不上传任何报告原件。沿用其他成果的作业单位通讯录，按市、作业单位、任务单元和批次归档。', '本栏目按市、作业单位、任务单元和批次归档，沿用其他成果的作业单位通讯录。无需在文件名中添加“质控意见”，也无需确认文件性质。')

# Adapt tests to the clarified behavior; keep positive and negative metadata
# checks, reference separation, authority registry, uploads and byte assertions.
replace('scripts/validate-report-tab.js', "verify(!C.inferDataKeys('石家庄市_平山县_'+text+'.docx').includes('reports'),'Report original must not be treated as quality opinion');", "verify(C.inferDataKeys('石家庄市_平山县_'+text+'.docx').join()==='reports','Routing does not require a quality-opinion marker');")
replace('scripts/check-report-tab-ui.py', "to_contain_text('不上传任何报告原件')", "to_contain_text('无需确认文件性质')")
replace('scripts/test-live-workspace.py', "          if(m.assignment.complete||!m.reportOpinion.required)throw Error('Unmarked report requires attestation');\n          C.confirmReportOpinion(item);m=C.applyItemMetadata(item);\n          if(!m.assignment.complete||item.unit!=='河北湛泸软件开发有限公司')throw Error('Attested opinion metadata failed');", "          if(!m.assignment.complete||item.unit!=='河北湛泸软件开发有限公司')throw Error('Report filename without opinion marker did not resolve');\n          if(C.reportOpinionState||C.confirmReportOpinion||SoilAdminImport.confirmQualityOnly)throw Error('Retired document-nature guard remains');\n          if(document.querySelector('.confirm-report-opinion,.confirm-report-opinions'))throw Error('Retired document-nature buttons remain');")
replace('scripts/test-live-workspace.py', "['property mapping alias','unmarked report protected','attestation resolves known report','other roster remains unchanged']", "['property mapping alias','marker-free report upload ready','no document-nature guards or buttons','other roster remains unchanged']")

# Mock-browser test: both screenshots must upload directly with zero dialogs.
p=Path('scripts/check-upload-metadata-ui.py'); s=p.read_text()
s=s.replace('manifests=[];writes=[];file_sizes=[];committed=[]','manifests=[];writes=[];file_sizes=[];committed=[];dialogs=[]\n    def on_dialog(d): dialogs.append(d.message);d.dismiss()\n    page.on(\'dialog\',on_dialog)')
s=s.replace(',report:i.autoMeta.reportOpinion','')
s=s.replace("        page.once('dialog',lambda d:d.accept())\n        page.locator('#adm-ok').click()", "        page.locator('#adm-ok').click()")
a=s.index('        assert len(states())==16 and all('); b=s.index('        # Screenshot 2:',a)
s=s[:a]+'''        assert len(states())==16 and all(s['keys']==['reports'] and s['complete'] for s in states())
        expect(page.locator('.confirm-report-opinion,.confirm-report-opinions')).to_have_count(0)
        page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-report-upload-ready.png')))
        click_upload()
        assert len(committed)==1 and len(manifests[-1]['files'])==16
        assert all(f['quality']['dataKeys']==['reports'] and 'opinionConfirmation' not in f['quality'] for f in manifests[-1]['files'])
        assert all(f['quality']['complete'] for f in manifests[-1]['files'])
        # Renaming and reselecting work without carrying any approval state.
        open_tab('reports');pick([names[0].replace('数据报告-','数据报告质控意见-')])
        assert states()[0]['complete']
        pick([names[0]])
        assert states()[0]['complete']
        page.locator('#soilAdminImport .adm-close').click()
''' +s[b:]
s=s.replace("        assert not errors,errors", "        assert not errors,errors\n        assert not dialogs,dialogs")
s=s.replace("'report acknowledgement cancel/confirm/revoke','renaming/reselection resets guard'", "'no document-nature dialogs','marker-free reports upload directly','renaming/reselection needs no approval'")
s=s.replace("        page.remove_listener('pageerror',on_error)", "        page.remove_listener('pageerror',on_error)\n        page.remove_listener('dialog',on_dialog)")
p.write_text(s)

# Documentation: mark superseded policy, preserving historical release notes.
replace('MAINTENANCE_RULES.md', '- 报告栏目只上传质控意见。文件名无意见标识时只识别类别，不默认认定内容；允许管理员核对内容后明确确认真实意见文件，确认绑定文件并留存在暂存清单，报告原件不得确认上传。', '- 文件性质确认规则已由 v1.2.17 的用户澄清替代，不再执行。')
replace('MAINTENANCE_RULES.md', '- 完整归档验证在上传文件字节前执行；确认和人工类型在归档清单中保持一致，未确定的地区和单位继续沿用原核对规则。', '- 完整归档验证在上传文件字节前执行；人工类型在归档清单中保持一致，未确定的地区和单位继续沿用原核对规则。')
p=Path('MAINTENANCE_RULES.md');p.write_text(p.read_text()+'''

## v1.2.17 平台用途与上传简化（以本条为准）

- 用户明确平台只承载质控意见、整改答复、质控人员工作报告、工作资料及参考资料；不再额外判别报告原件与意见文件，不要求文件名带“质控意见”，不增加性质确认按钮、批量确认或上传拦截。
- reports 栏目和 other 通讯录保持。文件名识别仅用于建议归档位置；主动选择的成果类型可直接使用，无需文件名被识别为总体/工作/数据报告。未知归档字段、单位差异、管理员验证仍按原规则处理。
- 参考资料和工作记录保留独立上传链路，不将质控人员工作报告等工作附件强行送入 reports 栏目。旧文件、原通讯录、历史归档及订正证据不改。
''')
p=Path('CHANGELOG.md');p.write_text(p.read_text().replace('# Changelog\n', '''# Changelog

## v1.2.17 — 2026-09-28

- 按用户澄清取消报告原件/质控意见的文件性质判别、逐份/批量确认按钮和上传拦截；文件名无需增加“质控意见”。
- 保留总体、工作、数据报告栏目及原其他成果通讯录，报告关键词只用于归档建议；人工指定的类型不依赖文件名，市/单位/任务/批次完整即可上传。
- 清理预处理、捕获阶段桥接和暂存清单中的性质确认逻辑；保留成果类型必选、制图别名、管理员验证、单位核对和原件追溯。
- 复查16份无质控字样的报告类文件、32 MiB属性制图文件的实际模拟上传链路，确认不再出现文件性质弹窗，参考资料和工作记录链路仍独立。
''',1))
Path('docs/UPLOAD_METADATA_FIX.md').write_text('''# 上传处理说明（v1.2.17）

平台承载质控意见、整改答复、质控人员工作报告、工作资料和参考资料。用户明确不上传成果原件，因此程序不再额外识别原件/意见的文件性质，不再要求文件名必须带“质控意见”，也不再要求逐份或批量确认文件性质。

原“总体、工作、数据报告”标签及其 other 通讯录保持。报告关键词只用于建议归档栏目，人工已指定的成果类型可以直接使用，不依赖文件名。真正缺少成果类型、市、单位或任务时，仍在原行明确缺项；公司和清单不符仍保留差异提示。

“土壤属性制图”与“土壤类型制图”继续分别匹配属性图和类型图。图1所示16份文件无需改名或额外确认；图2按文件名归为土壤属性图，保留2026年第三次第1批。参考资料、工作记录附件及整改答复使用原有独立入口，不强行归入报告栏目。

上传前校验归档信息、管理员验证、预处理、原位进度和原文件字节保护均保留。旧通讯录、历史归属、已上传文件及历史证据不改。v1.2.16 的文件性质确认规则已取消。
''')
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert master==re.search(r'var masterList = \[[\s\S]*?\n\];', Path('index.html').read_text()).group()
assert mapping==Path('task-unit-mappings.js').read_bytes()
print('v1.2.17 applied; original roster bytes unchanged')
