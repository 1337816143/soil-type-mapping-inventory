"""Use the real upload picker/preview without submitting any report."""
from playwright.sync_api import expect

def check_assignment_ui(page,out,prefix):
    before=page.evaluate('JSON.stringify(SoilTaskUnitLists)')
    page.evaluate("openSoilAdminImport({kind:'quality',dataKey:'soilType'})")
    names=[
      '平山县_土壤类型图_质控意见_2026年第二次第1批.docx',
      '平山县_土壤属性图_质控意见_2026年第二次第1批.docx',
      '平山县_土壤类型图_河北湛泸软件开发有限公司_质控意见_2026年第二次第1批.docx'
    ]
    picker=page.locator('#adm-files')
    picker.set_input_files([{'name':name,'mimeType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','buffer':b'preview fixture only'} for name in names])
    page.wait_for_function("SoilAdminImport.state.files.length===3&&SoilAdminImport.state.files.every(f=>f.autoMeta&&f.autoMeta.assignment&&f.autoMeta.assignment.complete)")
    statuses=page.locator('#adm-list .v2-file em')
    expect(statuses.nth(0)).to_contain_text('中地科勘察设计有限公司')
    expect(statuses.nth(0)).to_contain_text('按该类成果清单匹配')
    expect(statuses.nth(1)).to_contain_text('河北湛泸软件开发有限公司')
    expect(statuses.nth(2)).to_contain_text('文件名单位')
    expect(statuses.nth(2)).to_contain_text('不改清单')
    assert page.evaluate('SoilAdminImport.state.files[0].unit')!=page.evaluate('SoilAdminImport.state.files[1].unit')
    page.locator('[data-auto-import-toggle]').click()
    unit=page.locator('#adm-list .v2-row').nth(0).locator('.ru')
    # Real option.value must be the company name, not [object Object].
    expect(unit).to_have_value('中地科勘察设计有限公司')
    unit.select_option('中地科勘察设计有限公司')
    expect(statuses.nth(0)).to_contain_text('人工指定')
    page.evaluate('SoilAdminImport.renderPreview()')
    expect(page.locator('#adm-list .v2-file em').nth(0)).to_contain_text('人工指定')
    page.locator('[data-auto-import-toggle]').click()
    expect(page.locator('#adm-list .v2-file em').nth(0)).to_contain_text('按该类成果清单匹配')
    page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-assignment-preview.png')))
    picker.set_input_files([{'name':'平山县_土壤类型图_土壤属性图_质控意见.docx','mimeType':'application/octet-stream','buffer':b'preview only'}])
    page.wait_for_function('SoilAdminImport.state.files.length===1&&SoilAdminImport.state.files[0].autoMeta.assignment.complete')
    expect(page.locator('#adm-list .v2-file em')).to_contain_text('中地科勘察设计有限公司')
    expect(page.locator('#adm-list .v2-file em')).to_contain_text('河北湛泸软件开发有限公司')
    picker.set_input_files([{'name':'平山县_土壤类型图_河北示例甲有限公司_河北示例乙有限公司_质控意见.docx','mimeType':'application/octet-stream','buffer':b'preview only'}])
    expect(page.locator('#adm-list .v2-file em')).to_contain_text('多个不同公司')
    assert page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete') is False
    assert page.evaluate('JSON.stringify(SoilTaskUnitLists)')==before
    page.locator('#soilAdminImport .adm-close').click()
    return {'status':'passed','checks':['real picker by-type default company','explicit company overrides only current import','manual dropdown values and persistence','multi-type preview','specific ambiguity reason','embedded registries unchanged','no upload submission']}
