"""Read-only real rows plus disposable UI fixtures; no upload requests."""
import re
from playwright.sync_api import expect

def check_merged_directory_ui(page,out,prefix):
    before=page.evaluate('JSON.stringify(SoilTaskUnitLists)')
    page.locator('[data-tab="soilType"]').click()
    for district in ['峰峰矿区','丛台区','复兴区']:
        link=page.locator('#tab-soilType .district-link').filter(has_text=district)
        expect(link).to_have_count(1)
        expect(link).not_to_have_class(re.compile('directory-mismatch'))
        expect(link).to_have_attribute('title',re.compile('通讯录按合并区.*单独质控'))
        expect(link).to_have_attribute('title',re.compile('河北向力规划设计有限公司'))
        assert '与作业单位通讯录不一致' not in link.get_attribute('title')
    actual=page.locator('#tab-soilType .city-section').filter(has_text='河北向力规划设计有限公司')
    actual.screenshot(path=str(out/(prefix+'-handan-merged.png')))
    page.evaluate("openSoilAdminImport({kind:'quality',dataKey:'soilType'})")
    name='邯郸市_峰峰矿区_土壤类型图_质控意见_2026年第二次第1批.pdf'
    page.locator('#adm-files').set_input_files([{'name':name,'mimeType':'application/pdf','buffer':b'disposable-ui-fixture'}])
    row=page.locator('#adm-list .v2-row').first
    expect(row.locator('.rc')).to_have_value('邯郸市')
    expect(row.locator('.ru')).to_have_value('河北向力规划设计有限公司')
    expect(row.locator('.rd')).to_have_value('峰峰矿区')
    expect(row.locator('.rb')).to_have_value('2026年第二次第1批')
    expect(row.locator('.confirm-outside-task')).to_have_count(0)
    expect(row.locator('.v2-file em')).to_contain_text('单独质控')
    page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-merged-upload-preview.png')))
    text=page.locator('#soilAdminImport').inner_text()
    assert not re.search(r'不计入(?:应交清单|应交|清单)?统计',text)
    page.locator('#soilAdminImport .adm-close').click()
    entries=[
      {'kind':'quality-control','dataKey':'soilType','city':'邯郸市','unit':'河北向力规划设计有限公司','district':'峰峰矿区','batch':'2026年第二次第1批','path':'data/质控意见反馈_管理员导入/merged-qa-2.pdf','complete':True,'directoryStatus':'outside-list','directoryMessage':'历史消息；不计入应交清单统计。'},
      {'kind':'quality-control','dataKey':'soilAttr','city':'邯郸市','unit':'河北向力规划设计有限公司','district':'峰峰矿区','batch':'2026年第二次第1批','path':'data/质控意见反馈_管理员导入/merged-qa-wrong.pdf','complete':True},
      {'kind':'quality-control','dataKey':'specialty','city':'邯郸市','unit':'河北省农林科学院农业资源环境研究所','district':'永年区','batch':'2026年第二次第1批','path':'data/质控意见反馈_管理员导入/merged-qa-outside.pdf','complete':True}
    ]
    page.evaluate('(es)=>applyAdminQualityIndex(es)',entries)
    group=page.locator('#tab-soilType .district-group').filter(has_text='峰峰矿区').locator('.group-label')
    expect(group).to_have_attribute('title',re.compile('单独质控'))
    group.click()
    expect(page.locator('#tab-soilType a[href*="merged-qa-2.pdf"]')).not_to_have_class(re.compile('directory-mismatch'))
    wrong=page.locator('#tab-soilAttr a[href*="merged-qa-wrong.pdf"]')
    expect(wrong).to_have_attribute('title',re.compile('该合并区通讯录单位：河北科沃'))
    expect(wrong).to_have_class(re.compile('directory-mismatch'))
    outside=page.locator('#tab-specialty a[href*="merged-qa-outside.pdf"]')
    expect(outside).to_have_attribute('title',re.compile('备注也未明确包含'))
    expect(outside).to_have_class(re.compile('directory-mismatch'))
    page.locator('[data-tab="specialty"]').click()
    # New real reports can place this fixture inside a collapsed group.
    if not outside.is_visible():
        outside.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," district-group ")][1]').locator('.group-label').click()
    expect(outside).to_be_visible()
    outside.hover()
    assert outside.evaluate('(n)=>getComputedStyle(n).color')=='rgb(185, 28, 28)'
    page.locator('#tab-specialty .city-section').filter(has_text='农业资源环境研究所').screenshot(path=str(out/(prefix+'-uncovered-red.png')))
    page.evaluate('refreshAllTabs()')
    all_text=page.evaluate("[document.body.innerText,...Array.from(document.querySelectorAll('[title],[aria-label]')).map(n=>(n.title||'')+(n.getAttribute('aria-label')||''))].join('\\n')")
    assert not re.search(r'不计入(?:应交清单|应交|清单)?统计',all_text)
    assert page.evaluate('JSON.stringify(SoilTaskUnitLists)')==before
    page.evaluate('(paths)=>removeAdminQualityPaths(paths)',[x['path'] for x in entries])
    page.locator('[data-tab="soilType"]').click()
    return {'status':'passed','checks':['actual Handan split rows normal with source tooltip','type-specific mismatch stays red','new split upload fills company and keeps district','original and new batch tooltip','uncovered remains red','no retired text on refresh','directory unchanged','no production uploads']}
