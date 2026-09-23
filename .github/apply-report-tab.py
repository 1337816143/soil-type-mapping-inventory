from pathlib import Path
import re,subprocess,hashlib
assert Path('VERSION').read_text().strip()=='v1.2.10','Unexpected release'
master=re.search(r'var masterList = \[[\s\S]*?\n\];',Path('index.html').read_text()).group()
mapping=Path('task-unit-mappings.js').read_bytes()
token=re.search(r'var tokenCodes = \[[^\]]+\]',Path('upload-config.js').read_text()).group()
def change(path,old,new):
 p=Path(path);s=p.read_text();assert old in s,(path,old[:100]);p.write_text(s.replace(old,new))
change('dashboard-extension.js',"landUse: '土地资源评价与利用报告'", "landUse: '土地资源评价与利用报告',\n    reports: '总体、工作、数据报告'")
change('dashboard-extension.js',"'agriSuitability', 'landUse'];", "'agriSuitability', 'landUse', 'reports'];")
change('dashboard-extension.js',"        tabs.appendChild(tab);", "        tabs.insertBefore(tab, tabs.querySelector('[data-tab=\"references\"]'));")
change('dashboard-extension.js',"    var wrapped = function () {\n      return rewriteImportedQualityLinks(original.apply(this, arguments));\n    };",'''    var wrapped = function (cities, dataKey) {
      var html = rewriteImportedQualityLinks(original.apply(this, arguments));
      if (dataKey === 'reports') {
        var empty = !(cities || []).some(function (city) {
          return (city.units || []).some(function (unit) {
            return (unit.districts || []).some(function (district) { return (district.docs || []).length; });
          });
        });
        html = '<section class="report-family-guide" aria-label="报告归档说明"><h2>总体、工作、数据报告</h2>' +
          '<p>总体报告、工作报告、数据报告及对应质控意见统一存放于此。沿用其他成果的作业单位通讯录，按市、作业单位、任务单元和批次归档。</p>' +
          '<p class="report-family-note">同一地区的三类报告分别保留文件，收缴进度按任务单元汇总。</p>' +
          (empty ? '<p class="report-family-empty">暂未上传报告。请使用上方“管理员导入”添加文件；普通访问者可预览和批量下载已归档文件。</p>' : '') + '</section>' + html;
      }
      return html;
    };''')
change('dashboard-extension.js',"      '.missing-banner h3{flex-wrap:wrap}' +", "      '.report-family-guide{margin:0 0 16px;padding:18px 20px;border:1px solid #dbe6ef;border-radius:18px;background:linear-gradient(130deg,#ffffffeb,#f1f7fce6);color:#334d67;overflow-wrap:anywhere}.report-family-guide h2{margin:0 0 8px;font-size:1.1rem}.report-family-guide p{margin:6px 0;font-size:.85rem;line-height:1.65}.report-family-guide .report-family-note{color:#62768a;font-size:.78rem}.report-family-empty{padding-top:8px;border-top:1px solid #dbe6ef}' +\n      '.missing-banner h3{flex-wrap:wrap}' +")
change('dashboard-extension.js',"button.textContent = '管理员导入质控意见';", "button.textContent = key === 'reports' ? '管理员导入报告 / 质控意见' : '管理员导入质控意见';")
change('admin-auto-classifier.js',"landUse:'土地资源评价与利用报告'", "landUse:'土地资源评价与利用报告',\n    reports:'总体、工作、数据报告'")
change('admin-auto-classifier.js',"  function inferDataKeys(text) {",'''  function isReportFamily(text) {
    return /总体报告|工作报告|数据报告/.test(normalize(text));
  }
  function isReportReference(text) {
    return /模板|范本|指南|导引|规范|规程|编制要求|培训|参考资料|参考文件/.test(text) &&
      !/质控意见|审核意见|审查意见|复核意见/.test(text);
  }
  function inferDataKeys(text) {''')
change('admin-auto-classifier.js',"    if (keys.length) return keys;\n    if (/三普.*成果", "    if (keys.length) return keys;\n    if (isReportFamily(text) && !isReportReference(text)) return ['reports'];\n    if (/三普.*成果")
change('admin-auto-classifier.js',"  function inferKind(text, dataKeys) {\n    text = normalize(text);", "  function inferKind(text, dataKeys) {\n    text = normalize(text);\n    if (!(dataKeys && dataKeys.length) && isReportFamily(text) && isReportReference(text)) return 'reference';")
change('admin-auto-classifier.js',"if (!targets.length && kind === 'quality') {", "if (!targets.length && kind === 'quality' && keys.indexOf('reports') < 0) {")
change('hybrid-staged-upload.js',"    var meta = itemMetadata(item);\n    if(meta && meta.assignment){", "    var meta = itemMetadata(item);\n    if (meta && meta.dataKeys && meta.dataKeys.indexOf('reports') >= 0 && !meta.targets.length) return null;\n    if(meta && meta.assignment){")
change('page-enhancements-core.js',"      if(c&&c.cleanDirectoryMessage)info.title=c.cleanDirectoryMessage(info.title);", "      if (key === 'reports') info.reportFamily = true;\n      if(c&&c.cleanDirectoryMessage)info.title=c.cleanDirectoryMessage(info.title);")
change('page-enhancements-core.js',"return (info.mismatch||info.relation==='merged-member')?", "return (info.mismatch||info.relation==='merged-member'||info.reportFamily)?")
change('page-enhancements-core.js',"    window.renderCities = function(cities, dataKey) {",r'''    function reportDocLabel(key, doc) {
      if (key !== 'reports') return '';
      var name = String(doc.file || '').split('/').pop().replace(/\.[^.]+$/, '');
      var kinds = ['总体报告','工作报告','数据报告'].filter(function (kind) { return name.indexOf(kind) >= 0; });
      return ' · ' + escapeAttribute(kinds.length ? kinds.join('、') : name);
    }
    window.renderCities = function(cities, dataKey) {''')
change('page-enhancements-core.js',"escapeAttribute(d.label)+' '+window.PDF_ICON+'</a>';", "escapeAttribute(d.label)+reportDocLabel(dataKey,docs[0])+' '+window.PDF_ICON+'</a>';")
change('page-enhancements-core.js',"window.PDF_ICON+' '+doc.batch+'</a>';", "window.PDF_ICON+' '+doc.batch+reportDocLabel(dataKey,doc)+'</a>';")
change('scripts/glass-ui-checks.py',"assert len(keys) == 9 and len(set(keys)) == 9, keys", "assert len(keys) == 10 and len(set(keys)) == 10, keys\n    assert keys.index('reports') + 1 == keys.index('references'), keys\n    expect(page.locator('[data-tab=\"reports\"]')).to_have_text('总体、工作、数据报告')")
change('scripts/glass-ui-checks.py',"['soilType','references','workRecords']", "['soilType','reports','references','workRecords']")
change('scripts/glass-ui-checks.py',"    gutters = check_page_gutters(page, out, prefix)", "    report_tab = check_report_tab_readonly(page, out, prefix)\n    gutters = check_page_gutters(page, out, prefix)")
change('scripts/glass-ui-checks.py',"return {'status':'passed','pageGutters':gutters,", "return {'status':'passed','reportTab':report_tab,'pageGutters':gutters,")
p=Path('scripts/glass-ui-checks.py');p.write_text(p.read_text()+'''

def check_report_tab_readonly(page, out, prefix):
    tab=page.locator('[data-tab="reports"]');tab.click()
    expect(page.locator('#tab-reports')).to_have_class('tab-content active')
    expect(page.locator('#tab-reports .report-family-guide')).to_contain_text('沿用其他成果')
    expect(page.locator('#missingBanner h3')).to_contain_text('总体、工作、数据报告')
    expect(page.locator('#missingBanner .quality-admin-global').first).to_contain_text('管理员导入报告')
    expect(page.locator('#missingBanner .admin-delete-trigger')).to_be_visible()
    expect(page.locator('#missingBanner .soil-batch-download-trigger')).to_be_visible()
    result=page.evaluate("""()=>{
      const C=SoilAdminAutoClassifier,before=JSON.stringify(SoilTaskUnitLists);
      if(C.listForKey('reports')!==SoilTaskUnitLists.other)throw Error('Report list not shared by identity');
      const matches=['总体报告','工作报告','数据报告'].map(kind=>{
        const name='石家庄市_平山县_'+kind+'_质控意见_2026年第二次第1批.docx',i={file:{name,size:1},path:name};
        const m=C.applyItemMetadata(i);
        if(!m.assignment.complete||m.dataKeys.join()!=='reports'||i.unit!=='河北湛泸软件开发有限公司')throw Error('Wrong report assignment');
        return {kind,unit:i.unit};
      });
      const reports=calculateDashboardStats('reports'),other=calculateDashboardStats('soilAttr');
      for(const k of ['expDistricts','expMunicipal','expUnits'])if(reports[k]!==other[k])throw Error('Report expectations differ from other list');
      if(JSON.stringify(SoilTaskUnitLists)!==before)throw Error('Roster mutation');
      return {status:'passed',matches,expected:{districts:reports.expDistricts,municipal:reports.expMunicipal,units:reports.expUnits}};
    }""")
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(out/(prefix+'-report-tab-desktop.png')))
    page.set_viewport_size({'width':390,'height':844})
    tab.click();page.screenshot(path=str(out/(prefix+'-report-tab-mobile.png')))
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('[data-tab="soilType"]').click()
    return result
''')
change('scripts/test-workspace-browser.py',"            assignment_ui=runpy.run_path", "            report_ui=runpy.run_path(str(ROOT/'scripts/check-report-tab-ui.py'))['check_report_tab_ui'](page,OUT,engine)\n            (OUT/(engine+'-report-tab-ui.json')).write_text(json.dumps(report_ui,ensure_ascii=False,indent=2))\n            assignment_ui=runpy.run_path")
change('scripts/validate-auto-import-classifier.js',"// End-to-end mapping checks use the real embedded lists and actual Actions writer.", "require('child_process').execFileSync(process.execPath,['scripts/validate-report-tab.js'],{stdio:'inherit'});\n\n// End-to-end mapping checks use the real embedded lists and actual Actions writer.")
change('scripts/test-assignment-index.py',"fixtures=json.loads((ROOT/'test-artifacts/assignment-manifests.json').read_text())", "fixtures=json.loads((ROOT/'test-artifacts/assignment-manifests.json').read_text())\nextra=ROOT/'test-artifacts/report-tab-manifests.json'\nif extra.exists():fixtures+=json.loads(extra.read_text())")
p=Path('CHANGELOG.md');p.write_text(p.read_text().replace('# Changelog\n','# Changelog\n\n## v1.2.11 — 2026-09-23\n\n- 新增“总体、工作、数据报告”成果标签，位于参考文件之前。使用其他成果的原通讯录，同步城市/作业单位/任务单元/批次归档、收缴进度、管理员导入删除、整改答复、站内预览及公开批量下载。\n- 自动识别独立命名的总体报告、工作报告、数据报告；保留原专项成果工作报告和北部28份三类共享报告范围，参考模板不误归档。\n- 同区县同批次的报告显示各自报告类型和文件名，避免出现无法区分的同名批次按钮。新增空态说明，统计沿用按任务单元汇总口径。\n- 原两份通讯录、已有数据和附件不改；加入新类别真实清单、归档索引、双浏览器及线上只读回归。\n',1))
p=Path('MAINTENANCE_RULES.md');p.write_text(p.read_text()+'''\n\n## v1.2.11 报告专栏\n\n- reports 为“总体、工作、数据报告”单独成果分类，放在参考文件前；只读共用 other 通讯录，不复制或改写原清单。\n- 总体/工作/数据独立报告及对应质控意见可分别存储；同批次链接需标出报告名称。收缴按任务单元汇总，不把一份文件宣称为三种报告全部完成。\n- 文件名/目录明确专项成果时保留原成果分类；参考模板、导引等不因报告关键词误进入新栏；北部28份权威共享文件只维持原三类成果。\n- 新标签复用上传、单位证据核对、清单外确认、合并区说明、批次、答复、预览和公开下载；不得只新增空标签或突破管理员权限。\n''')
p=Path('docs/QUALITY_UPLOAD_NAMING.md');p.write_text(p.read_text()+'''\n\n## 总体、工作、数据报告\n\n新增标签位于参考文件之前。独立报告按“所属市_任务单元_报告名称_质控意见_年份年第几次第几批.docx”命名，例如：\n\n```text\n石家庄市_平山县_总体报告_质控意见_2026年第二次第1批.docx\n石家庄市_平山县_工作报告_质控意见_2026年第二次第1批.pdf\n石家庄市_平山县_数据报告_质控意见_2026年第二次第1批.docx\n```\n\n没有质控意见后缀的原报告也能识别。公司可省略，默认按其他成果通讯录匹配；明确公司、单位证据订正和清单外确认沿用现有规则。文件名或目录明确“土壤类型图”等专项成果时优先归入原成果页，不把该专项的工作报告移走；总体/工作/数据报告的模板、编制导引仍按参考文件处理。三个独立报告分别保存，同一任务单元按现有收缴口径汇总。\n''')
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert master==re.search(r'var masterList = \[[\s\S]*?\n\];',Path('index.html').read_text()).group()
assert mapping==Path('task-unit-mappings.js').read_bytes()
assert token==re.search(r'var tokenCodes = \[[^\]]+\]',Path('upload-config.js').read_text()).group()
print('Report tab integrated; directory and credential unchanged')
