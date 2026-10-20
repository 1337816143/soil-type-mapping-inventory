"""Read-only checks of the real national-inspection page. No fixtures or writes."""
import json
from playwright.sync_api import expect

TOPICS = [
    ('soilType', '土壤类型图'), ('soilAttr', '土壤属性图'),
    ('farmland', '耕地质量等级评价'), ('degradation', '土壤退化与障碍分析'),
    ('specialty', '土特产品土壤适宜性评价'), ('agriSuitability', '土壤农业利用适宜性评价'),
    ('landUse', '土壤资源评价与利用报告'), ('reports', '总体、工作、数据报告'),
]
COUNTIES = ['jinzhou', 'shexian', 'ningjin', 'bazhou']


def check_national_inspection_ui(page, out, prefix):
    """Accept a ready real app page; restore viewport and the original soilType tab."""
    # The old dashboard starts its admin-index fetch outside the enhancement
    # promise. Wait for that existing initialization to settle before comparing
    # collection data; do not mistake its legitimate late merge for our mutation.
    page.wait_for_load_state('networkidle', timeout=45000)
    viewport = dict(page.viewport_size)
    summary_text = lambda entries: f"{len({m['path'] for m in entries})} 个文件 · {len({m['batchId'] for m in entries})} 个批次"
    report = {'mode': 'read-only; actual deployed catalog, no injected materials', 'initialization': 'networkidle before original data snapshot', 'checks': []}
    original = page.evaluate("""() => {
      const tabs = Array.from(document.querySelectorAll('header .tabs .tab'));
      window.__nationalInspectionTabIdentity = tabs.slice();
      return {ids:tabs.map(n=>n.dataset.tab), data:JSON.stringify(window.tabData), types:JSON.stringify(window.SoilDashboardTypes)};
    }""")
    assert original['ids'][-2:] == ['workRecords', 'nationalInspection'], original['ids']
    assert original['ids'] == [key for key, _ in TOPICS] + ['references', 'workRecords', 'nationalInspection']
    tab = page.locator('header [data-tab="nationalInspection"]')
    tab.click()
    expect(page.locator('#tab-nationalInspection')).to_be_visible()
    expect(page.locator('#missingBanner')).to_be_hidden()
    expect(tab).to_have_attribute('aria-selected', 'true')
    expect(page.locator('.ni-summary')).to_contain_text('个文件', timeout=20000)
    assert not page.locator('.ni-status').evaluate('(n)=>n.classList.contains("error")'), 'Catalog must load successfully'
    manifest = page.evaluate("""async () => {
      const r = await fetch('./data/national-inspection.json?v='+encodeURIComponent(String(window.SOIL_RELEASE_VERSION||'')), {cache:'no-cache',credentials:'omit'});
      if (!r.ok) throw Error('National inspection manifest HTTP '+r.status);
      return await r.json();
    }""")
    assert manifest['schemaVersion'] == 1
    materials = manifest['materials']
    expect(page.locator('.ni-summary')).to_have_text(summary_text(materials))
    assert page.locator('.ni-topic').count() == 8
    assert page.locator('.ni-topic.tab').count() == 0
    county_values = page.locator('#ni-county option').evaluate_all('nodes=>nodes.map(n=>n.value)')
    assert county_values == [''] + COUNTIES
    county_labels = page.locator('#ni-county option').all_text_contents()
    assert county_labels[1:] == ['石家庄 · 晋州', '邯郸 · 涉县', '邢台 · 宁晋', '廊坊 · 霸州']
    for key, label in TOPICS:
        button = page.locator('#ni-topic-' + key)
        expect(button).to_contain_text(label)
        button.click()
        expect(button).to_have_attribute('aria-selected', 'true')
        expect(page.locator('#ni-topic-panel')).to_have_attribute('aria-labelledby', 'ni-topic-' + key)
        expect(page.locator('.ni-topic-heading')).to_have_text(label)
        assert page.locator('.ni-topic[tabindex="0"]').count() == 1
        entries = [m for m in materials if m['topicId'] == key]
        assert page.locator('.ni-file').count() == len(entries)
        expect(page.locator('.ni-material-group')).to_have_count(2)
        expect(page.locator('.ni-material-group.quality .ni-material-title')).to_contain_text('质控材料')
        expect(page.locator('.ni-material-group.scoring .ni-material-title')).to_contain_text('评分材料')
        if not entries:
            expect(page.locator('.ni-material-group.quality')).to_contain_text('本专题暂无质控材料')
            expect(page.locator('.ni-material-group.scoring')).to_contain_text('本专题暂无评分材料')
            expect(page.get_by_role('button', name='下载当前筛选 ZIP', exact=True)).to_be_disabled()
            expect(page.locator('#ni-batch')).to_be_disabled()
            assert page.locator('#ni-batch option').count() == 1
    page.locator('#ni-topic-soilType').click()
    for county in COUNTIES:
        page.locator('#ni-county').select_option(county)
        entries = [m for m in materials if m['topicId'] == 'soilType' and m['countyId'] == county]
        expect(page.locator('.ni-status')).to_contain_text(summary_text(entries))
        assert page.locator('.ni-file').count() == len(entries)
        if not entries:
            expect(page.locator('.ni-material-group.quality')).to_contain_text('当前筛选下暂无质控材料')
            expect(page.locator('.ni-material-group.scoring')).to_contain_text('当前筛选下暂无评分材料')
    page.get_by_role('button', name='清除筛选', exact=True).click()
    expect(page.locator('#ni-county')).to_have_value('')
    expect(page.locator('#ni-batch')).to_have_value('')
    expect(page.locator('#ni-search')).to_have_value('')
    page.locator('#ni-topic-soilType').focus()
    page.keyboard.press('End')
    expect(page.locator('#ni-topic-reports')).to_be_focused()
    page.keyboard.press('Home')
    expect(page.locator('#ni-topic-soilType')).to_be_focused()
    expect(tab).to_have_attribute('aria-selected', 'true')
    report['checks'] += ['last main tab after work records', 'eight exact topic tabs and category columns', 'four county filters', 'actual catalog counts and no fake batches', 'subtab keyboard and ARIA remain independent']
    for width, height in [(1440, 1000), (320, 568), (390, 844), (430, 932), (844, 390)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate('window.scrollTo(0, 0)')
        overflow = page.locator('#tab-nationalInspection').evaluate('(n)=>({scroll:n.scrollWidth,width:n.clientWidth})')
        assert overflow['scroll'] <= overflow['width'] + 1, (width, height, overflow)
        controls = page.locator('.ni-topic,.ni-toolbar select,.ni-toolbar input,.ni-toolbar button').evaluate_all('''nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};})''')
        assert all(c['left'] >= -1 and c['right'] <= width + 1 and c['height'] >= 40 for c in controls), (width, height, controls)
        page.screenshot(path=str(out / f'{prefix}-national-inspection-{width}x{height}.png'), full_page=True)
    page.set_viewport_size(viewport)
    page.locator('[data-tab="soilType"]').click()
    expect(page.locator('#tab-soilType')).to_be_visible()
    expect(page.locator('#tab-nationalInspection')).to_be_hidden()
    expect(page.locator('#missingBanner')).to_be_visible()
    unchanged = page.evaluate("""() => {
      const current = Array.from(document.querySelectorAll('header .tabs .tab'));
      const identity = current.length===window.__nationalInspectionTabIdentity.length && current.every((n,i)=>n===window.__nationalInspectionTabIdentity[i]);
      delete window.__nationalInspectionTabIdentity;
      return {identity, data:JSON.stringify(window.tabData), types:JSON.stringify(window.SoilDashboardTypes)};
    }""")
    assert unchanged['identity'], 'Original navigation nodes were replaced'
    assert unchanged['data'] == original['data'], 'National inspection changed original collection data'
    assert unchanged['types'] == original['types'], 'National inspection changed original topic/statistics map'
    report['checks'] += ['desktop and four mobile viewport layouts', 'return to original tab, banner and node identity', 'original data and statistics map unchanged']
    report['catalog'] = {'files': len({m['path'] for m in materials}), 'batches': len({m['batchId'] for m in materials}), 'empty': not materials}
    report['status'] = 'passed'
    (out / f'{prefix}-national-inspection-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    return report
