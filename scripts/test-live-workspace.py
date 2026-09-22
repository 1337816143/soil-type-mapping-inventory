"""Read-only smoke test of the actual Pages deployment. Never submits real records."""
import json, pathlib, time
from playwright.sync_api import sync_playwright, expect
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'test-artifacts';OUT.mkdir(exist_ok=True)
VERSION=(ROOT/'VERSION').read_text().strip()
URL='https://1337816143.github.io/soil-type-mapping-inventory/'
report={'version':VERSION,'url':URL,'mode':'read-only','checks':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    ctx=browser.new_context(viewport={'width':1440,'height':1000})
    page=ctx.new_page();errors=[];writes=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def readonly(route):
        if route.request.method not in ('GET','HEAD','OPTIONS'):
            writes.append(route.request.method);route.abort('blockedbyclient')
        else:route.continue_()
    ctx.route('**/*',readonly)
    try:
        deadline=time.monotonic()+180
        while True:
            page.goto(URL+'?verify='+str(int(time.time())),wait_until='domcontentloaded',timeout=45000)
            page.wait_for_function("document.documentElement.getAttribute('data-soil-enhancements-ready') === 'true'",timeout=45000)
            actual=page.evaluate('window.SOIL_RELEASE_VERSION')
            if actual==VERSION:break
            if time.monotonic()>deadline:raise AssertionError('Pages version differs from the tested commit')
            page.wait_for_timeout(10000)
        errors.clear()
        tabs=page.locator('header .tabs .tab').all_text_contents()
        assert '工作记录' in tabs and len(tabs)>=9,tabs
        report['tabs']=tabs;report['checks'].append('deployed version and all original tabs')
        import runpy
        report['glassUI']=runpy.run_path(str(ROOT/'scripts/glass-ui-checks.py'))['check_glass_ui'](page,OUT,'live')
        report['directoryUI']=runpy.run_path(str(ROOT/'scripts/check-directory-ui.py'))['check_directory_ui'](page,OUT,'live')
        page.locator('[data-tab="soilType"]').click()
        expect(page.locator('.batch-tag').first).to_contain_text('2026年第一次')
        assert not page.locator('.city-section tbody td:nth-child(3) .batch-tag').evaluate_all('''nodes=>nodes.filter(n=>{if(!n.getClientRects().length)return false;const r=n.getBoundingClientRect(),c=n.closest('td').getBoundingClientRect();return r.right>c.right-2||r.left<c.left;}).map(n=>n.textContent)'''),'Batch label overlaps another column'
        page.screenshot(path=str(OUT/'live-home-desktop.png'))
        page.locator('[data-tab="workRecords"]').click()
        expect(page.locator('#wr-new')).to_be_visible()
        expect(page.locator('#wr-status')).to_contain_text('已同步',timeout=25000)
        expect(page.locator('#wr-search')).to_be_visible()
        page.locator('[data-view="table"]').click()
        expect(page.locator('[data-view="table"]')).to_have_attribute('aria-pressed','true')
        page.locator('[data-view="cards"]').click()
        page.screenshot(path=str(OUT/'live-work-records-desktop.png'))
        page.locator('#wr-new').click()
        for key in ['title','time','location','people','notes']:
            expect(page.locator('#wr-field-'+key)).to_be_visible()
        expect(page.locator('#wr-attachments')).to_be_visible()
        expect(page.get_by_role('button',name='暂存草稿',exact=True)).to_be_visible()
        expect(page.get_by_role('button',name='正式保存',exact=True)).to_be_visible()
        page.screenshot(path=str(OUT/'live-editor-desktop.png'))
        page.set_viewport_size({'width':390,'height':844})
        expect(page.locator('.wr-dialog-head .wr-button')).to_be_in_viewport()
        expect(page.get_by_role('button',name='正式保存',exact=True)).to_be_in_viewport()
        page.screenshot(path=str(OUT/'live-editor-mobile.png'))
        # This only stores an empty draft in this disposable browser profile.
        page.get_by_role('button',name='暂存并关闭',exact=True).click()
        expect(page.locator('.wr-overlay')).to_have_count(0)
        assert not writes,'Unexpected write request attempted'
        assert not errors,errors
        report['checks']+=['historical batch labels and column containment','work-record query and view switches','editor fields and attachment controls','mobile dialog close/save visibility','no runtime errors or network writes during smoke interactions']
        report['status']='passed'
    except Exception:
        report['status']='failed';page.screenshot(path=str(OUT/'live-failure.png'));raise
    finally:
        (OUT/'live-workspace-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        ctx.close();browser.close()
print(json.dumps(report,ensure_ascii=False,indent=2))
