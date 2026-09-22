"""Exact screenshot, confirmation, persistent-index display and immutable roster tests.
All file picks and applyAdminQualityIndex calls affect this disposable browser only.
"""
from playwright.sync_api import expect

def check_directory_ui(page,out,prefix):
    name='邯郸市_永年区_土特产品土壤适宜性评价_河北省农林科学院农业资源环境研究所_质控意见_2026年第二次第1批.docx'
    before=page.evaluate('JSON.stringify(SoilTaskUnitLists)')
    page.evaluate("openSoilAdminImport({kind:'quality',dataKey:'specialty'})")
    picker=page.locator('#adm-files')
    picker.set_input_files([{'name':name,'mimeType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','buffer':b'disposable preview fixture'}])
    first=page.locator('#adm-list .v2-row').first
    expect(first.locator('.rc')).to_have_value('邯郸市')
    expect(first.locator('.rd')).to_have_value('永年区')
    expect(first.locator('.ru')).to_have_value('河北省农林科学院农业资源环境研究所')
    expect(first.locator('.rb')).to_have_value('2026年第二次第1批')
    expect(first.locator('.confirm-outside-task')).to_have_text('确认按文件名归档')
    assert page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete') is False
    # Cancel means no acknowledgement and no upload.
    page.once('dialog',lambda d:d.dismiss())
    first.locator('.confirm-outside-task').click()
    assert page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete') is False
    page.once('dialog',lambda d:d.accept())
    first.locator('.confirm-outside-task').click()
    expect(first.locator('.confirm-outside-task')).to_have_text('撤销清单外归档确认')
    assert page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete') is True
    page.locator('[data-auto-import-toggle]').click()
    expect(first.locator('.rb')).to_have_value('2026年第二次第1批')
    expect(first.locator('.rd')).to_have_value('永年区')
    page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-outside-upload-preview.png')))
    page.set_viewport_size({'width':390,'height':844})
    expect(first.locator('.confirm-outside-task')).to_be_visible()
    assert first.locator('.confirm-outside-task').evaluate('(n)=>n.getBoundingClientRect().right<=innerWidth')
    page.set_viewport_size({'width':1440,'height':1000})
    # Revoking is reversible. Changing another file cannot inherit this approval.
    first.locator('.confirm-outside-task').click()
    assert page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete') is False
    picker.set_input_files([{'name':name.replace('_河北省农林科学院农业资源环境研究所',''),'mimeType':'application/octet-stream','buffer':b'fixture'}])
    expect(first.locator('.v2-file em')).to_contain_text('无法推断作业单位')
    expect(first.locator('.confirm-outside-task')).to_have_count(0)
    expect(first.locator('.rd')).to_have_value('永年区')
    page.locator('#soilAdminImport .adm-close').click()
    # Replay actual index output shape in memory, just as a normal page reload.
    stats=page.evaluate("JSON.stringify(calculateDashboardStats('specialty'))")
    entries=[
      {'kind':'quality-control','dataKey':'specialty','city':'邯郸市','unit':'河北省农林科学院农业资源环境研究所','district':'永年区','batch':'2026年第二次第1批','path':'data/质控意见反馈_管理员导入/fixture-yongnian.docx','complete':True,'directoryStatus':'outside-list','unlistedConfirmed':True},
      {'kind':'quality-control','dataKey':'soilType','city':'石家庄市','unit':'河北湛泸软件开发有限公司','district':'平山县','batch':'2026年第二次第1批','path':'data/质控意见反馈_管理员导入/fixture-company.docx','complete':True},
      {'kind':'quality-control','dataKey':'soilAttr','city':'石家庄市','unit':'河北湛泸软件开发有限公司','district':'平山县','batch':'2026年第二次第1批','path':'data/质控意见反馈_管理员导入/fixture-matched.docx','complete':True},
      {'kind':'quality-control','dataKey':'specialty','city':'邯郸市','unit':'河北省农林科学院农业资源环境研究所','district':'邯郸市','batch':'2026年第二次第1批','path':'data/质控意见反馈_管理员导入/fixture-city.docx','complete':True}
    ]
    page.evaluate('(es)=>applyAdminQualityIndex(es.slice(0,1))',entries)
    assert page.evaluate("JSON.stringify(calculateDashboardStats('specialty'))")==stats,'Outside task changed expected/received counts'
    page.evaluate('(es)=>applyAdminQualityIndex(es.slice(1))',entries)
    page.locator('[data-tab="specialty"]').click()
    outside=page.locator('#tab-specialty a[href*="fixture-yongnian.docx"]')
    expect(outside).to_have_attribute('data-directory-status','outside-list')
    expect(outside).to_have_attribute('title',__import__('re').compile('与作业单位通讯录不一致'))
    expect(outside).to_have_attribute('title',__import__('re').compile('2026年第二次第1批'))
    outside.hover()
    assert outside.evaluate('(n)=>getComputedStyle(n).color')=='rgb(185, 28, 28)'
    # Dataset/type-specific: same company and county are red only for the wrong type.
    bad=page.locator('#tab-soilType a[href*="fixture-company.docx"]')
    good=page.locator('#tab-soilAttr a[href*="fixture-matched.docx"]')
    expect(bad).to_have_attribute('data-directory-status','unit-mismatch')
    expect(good).not_to_have_class(__import__('re').compile('directory-mismatch'))
    assert '与作业单位通讯录不一致' not in (good.get_attribute('title') or '')
    expect(page.locator('#tab-specialty a[href*="fixture-city.docx"]')).to_have_attribute('data-directory-status','unit-mismatch')
    # A second batch turns an individual link into a group; warning must survive.
    second=dict(entries[0],path='data/质控意见反馈_管理员导入/fixture-yongnian-2.docx',batch='2026年第二次第2批')
    page.evaluate('(e)=>applyAdminQualityIndex([e])',second)
    group=page.locator('#tab-specialty .district-group').filter(has_text='永年区').locator('.group-label')
    expect(group).to_have_attribute('data-directory-status','outside-list')
    group.click()
    expect(page.locator('#tab-specialty a[href*="fixture-yongnian-2.docx"]')).to_have_attribute('title',__import__('re').compile('与作业单位通讯录不一致'))
    page.locator('#tab-specialty .city-section').filter(has_text='河北省农林科学院').screenshot(path=str(out/(prefix+'-directory-red-display.png')))
    page.evaluate('window.refreshAllTabs()')
    expect(page.locator('#tab-specialty a[href*="fixture-yongnian.docx"]')).to_have_attribute('data-directory-status','outside-list')
    assert page.evaluate('JSON.stringify(SoilTaskUnitLists)')==before
    page.evaluate('(paths)=>removeAdminQualityPaths(paths)',[e['path'] for e in entries]+[second['path']])
    page.locator('[data-tab="soilType"]').click()
    return {'status':'passed','checks':['exact Yongnian filename preserved','explicit confirmation/cancel/revoke','unlisted-without-unit remains blocked','new batch dropdown backfill','red per-type exceptions with preserved tooltip information','normal items unchanged','multi-batch group warning','city-level mismatch warning','unlisted task does not affect roster statistics','embedded roster unchanged','no production writes']}
