"""Real picker, confirmation and read-only browser projection; never uploads a report."""
import re
from playwright.sync_api import expect

def check_directory_ui(page,out,prefix):
    snapshot=page.evaluate('JSON.stringify(SoilTaskUnitLists)')
    name='邯郸市_永年区_土特产品土壤适宜性评价_河北省农林科学院农业资源环境研究所_质控意见_2026年第二次第1批.docx'
    page.set_viewport_size({'width':1440,'height':1000})
    page.evaluate("openSoilAdminImport({kind:'quality',dataKey:'specialty'})")
    picker=page.locator('#adm-files')
    def select(names):
        picker.set_input_files([{'name':n,'mimeType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','buffer':b'preview only'} for n in names])
    select([name])
    expect(page.locator('#adm-list .v2-file em')).to_contain_text('清单外任务')
    expect(page.locator('#adm-list .rc')).to_have_value('邯郸市')
    expect(page.locator('#adm-list .rd')).to_have_value('永年区')
    expect(page.locator('#adm-list .ru')).to_have_value('河北省农林科学院农业资源环境研究所')
    expect(page.locator('#adm-list .rb')).to_have_value('2026年第二次第1批')
    expect(page.locator('#adm-batch')).to_have_value('2026年第二次第1批')
    assert not page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete')
    page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-directory-pending.png')))
    page.get_by_role('button',name='确认按文件名归档',exact=True).click()
    assert page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete')
    page.evaluate('SoilAdminImport.renderPreview()')
    assert page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete')
    page.get_by_role('button',name='已确认清单外归档 · 撤销确认').click()
    assert not page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete')
    page.get_by_role('button',name='确认按文件名归档',exact=True).click()
    page.locator('#qc-feedback').fill('2');page.locator('#qc-round').fill('2')
    page.locator('#qc-apply-round').click()
    expect(page.locator('#adm-list .rb')).to_have_value('2026年第二次第2批')
    assert not page.evaluate('SoilAdminImport.state.files[0].autoMeta.assignment.complete')
    page.get_by_role('button',name='确认按文件名归档',exact=True).click()
    page.set_viewport_size({'width':390,'height':844})
    page.locator('.directory-confirm').scroll_into_view_if_needed()
    expect(page.locator('.directory-confirm')).to_be_in_viewport()
    page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-directory-pending-mobile.png')))
    page.set_viewport_size({'width':1440,'height':1000})
    select([name.replace('_河北省农林科学院农业资源环境研究所','')])
    expect(page.locator('#adm-list .v2-file em')).to_contain_text('不能推断作业单位')
    expect(page.locator('#adm-list .rc')).to_have_value('邯郸市')
    expect(page.locator('#adm-list .rd')).to_have_value('永年区')
    expect(page.locator('.directory-confirm')).to_have_count(0)
    page.locator('#soilAdminImport .adm-close').click()
    page.evaluate("openSoilAdminImport({kind:'quality',dataKey:'specialty'})")
    select([name,name.replace('第1批','第3批补充')])
    expect(page.locator('#adm-list .rb').nth(0)).to_have_value('2026年第二次第1批')
    expect(page.locator('#adm-list .rb').nth(1)).to_have_value('2026年第二次第3批补充')
    page.locator('#soilAdminImport .adm-close').click()
    # Receive fixture index entries into this disposable browser's memory only.
    before=page.evaluate("JSON.stringify(calculateDashboardStats('specialty'))")
    records=[{'kind':'quality-control','dataKey':'specialty','city':'邯郸市','district':'永年区','unit':'河北省农林科学院农业资源环境研究所','batch':'2026年第二次第1批','complete':True,'directoryStatus':'unlisted-task','directoryMismatch':True,'outsideDirectoryConfirmed':True,'path':'data/质控意见反馈_管理员导入/directory-fixture-yongnian.docx'},
             {'kind':'quality-control','dataKey':'soilType','city':'石家庄市','district':'平山县','unit':'河北湛泸软件开发有限公司','batch':'2026年第二次第1批','complete':True,'path':'data/质控意见反馈_管理员导入/directory-fixture-wrong-unit.docx'}]
    page.evaluate('(rows)=>applyAdminQualityIndex(rows)',records)
    assert page.evaluate("JSON.stringify(calculateDashboardStats('specialty'))")==before
    page.locator('[data-tab="specialty"]').click()
    badge=page.locator('#tab-specialty .district-link').filter(has_text='永年区')
    expect(badge).to_have_attribute('data-directory-mismatch','true')
    expect(badge).to_have_attribute('title',re.compile('与作业单位通讯录不一致'))
    badge.hover()
    assert badge.evaluate('(n)=>getComputedStyle(n).color')=='rgb(180, 35, 24)'
    expect(badge).to_have_attribute('href',re.compile('directory-fixture-yongnian'))
    page.locator('#tab-specialty .city-section').filter(has_text='河北省农林科学院农业资源环境研究所').screenshot(path=str(out/(prefix+'-directory-red-display.png')))
    catalog=page.evaluate("SoilFileAccess.buildCatalog('specialty')")
    assert 'directory-fixture-yongnian.docx' in str(catalog)
    page.evaluate('refreshAllTabs()')
    expect(badge).to_have_attribute('data-directory-mismatch','true')
    page.locator('.glass-controls button').click()
    assert badge.evaluate('(n)=>getComputedStyle(n).color')=='rgb(180, 35, 24)'
    page.locator('.glass-controls button').click()
    page.locator('[data-tab="soilType"]').click()
    wrong=page.locator('#tab-soilType a[href*="directory-fixture-wrong-unit"]')
    expect(wrong).to_have_attribute('data-directory-mismatch','true')
    expect(wrong).to_have_attribute('title',re.compile('与作业单位通讯录不一致'))
    match=page.evaluate("()=>{const u=SoilAdminAutoClassifier.listForKey('soilType').find(c=>c.city==='石家庄市').items.find(u=>u.districts.includes('平山县'));return u.unit;}")
    normal={'kind':'quality-control','dataKey':'soilType','city':'石家庄市','district':'平山县','unit':match,'batch':'2026年第二次第1批','complete':True,'path':'data/质控意见反馈_管理员导入/directory-fixture-normal.docx'}
    page.evaluate('(row)=>applyAdminQualityIndex([row])',normal)
    good=page.locator('#tab-soilType a[href*="directory-fixture-normal"]')
    assert not good.get_attribute('data-directory-mismatch')
    second=dict(records[0],path='data/质控意见反馈_管理员导入/directory-fixture-yongnian2.docx',batch='2026年第二次第2批')
    page.evaluate('(row)=>applyAdminQualityIndex([row])',second)
    page.locator('[data-tab="specialty"]').click()
    group=page.locator('#tab-specialty .group-label').filter(has_text='永年区')
    expect(group).to_have_attribute('data-directory-mismatch','true')
    group.click()
    expect(page.locator('#tab-specialty a[href*="directory-fixture-yongnian2"]')).to_be_visible()
    expect(page.locator('#tab-specialty a[href*="directory-fixture-yongnian2"]')).to_have_attribute('title',re.compile('与作业单位通讯录不一致'))
    assert page.evaluate("JSON.stringify(calculateDashboardStats('specialty'))")==before
    paths=[r['path'] for r in records]+[normal['path'],second['path']]
    page.evaluate('(paths)=>removeAdminQualityPaths(paths)',paths)
    assert page.evaluate('JSON.stringify(SoilTaskUnitLists)')==snapshot
    page.locator('[data-tab="soilType"]').click()
    return {'status':'passed','checks':['exact Yongnian picker','preserve extracted fields','new and mixed batch values','explicit confirmation/revoke','batch change invalidates consent','missing company not guessed','red task and company mismatch','normal task not red','hover notice and preserved file href','grouped batches','refresh and lite-mode persistence','batch catalog includes exception','original directory and progress unchanged','no report uploaded']}
