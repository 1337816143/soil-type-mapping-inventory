"""Shared read-only UI assertions for fixture and deployed-browser checks."""
from playwright.sync_api import expect

def check_glass_ui(page, out, prefix):
    page.set_viewport_size({'width':1440,'height':1000})
    expect(page.locator('.glass-header-top')).to_have_count(1)
    expect(page.locator('.glass-header-top .glass-controls')).to_have_count(1)
    tabs = page.locator('header .tabs .tab')
    keys = tabs.evaluate_all('(ns)=>ns.map(n=>n.dataset.tab)')
    assert len(keys) == 9 and len(set(keys)) == 9, keys
    for key in keys:
        tab = page.locator('[data-tab="'+key+'"]')
        tab.click()
        expect(tab).to_have_attribute('aria-selected','true')
        assert page.locator('#tab-'+key).evaluate('(n)=>n.classList.contains("active")')
        expect(page.locator('header .tabs [aria-selected="true"]')).to_have_count(1)
    first = page.locator('[data-tab="soilType"]')
    first.click(); first.focus()
    first.press('End')
    expect(page.locator('[data-tab="workRecords"]')).to_have_attribute('aria-selected','true')
    page.keyboard.press('Home')
    expect(first).to_have_attribute('aria-selected','true')
    page.keyboard.press('ArrowRight')
    expect(page.locator('[data-tab="soilAttr"]')).to_have_attribute('aria-selected','true')
    page.keyboard.press('ArrowLeft')
    expect(first).to_have_attribute('aria-selected','true')
    page.screenshot(path=str(out/(prefix+'-navigation-desktop.png')))
    logo = page.locator('.footer-brand.cau img')
    expect(logo).to_have_attribute('src','./assets/cau-logo-transparent.png')
    page.wait_for_function("(()=>{const n=document.querySelector('.footer-brand.cau img');return n&&n.complete&&n.naturalWidth>0})()")
    alpha = logo.evaluate('''n=>{const c=document.createElement('canvas');c.width=n.naturalWidth;c.height=n.naturalHeight;const x=c.getContext('2d');x.drawImage(n,0,0);const p=x.getImageData(0,0,c.width,c.height).data;let transparent=0,solid=0;for(let i=3;i<p.length;i+=4){if(p[i]===0)transparent++;if(p[i]>220)solid++;}return {corner:p[3],transparent,solid};}''')
    assert alpha['corner']==0 and alpha['transparent']>10000 and alpha['solid']>1000, alpha
    for width in [320,390,430,760,1024,1440]:
        page.set_viewport_size({'width':width,'height':844})
        page.locator('[data-tab="workRecords"]').click()
        page.wait_for_timeout(450)
        bounds=page.locator('.glass-nav-frame').evaluate('(n)=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,w:innerWidth}}')
        assert bounds['left']>=0 and bounds['right']<=bounds['w']+1, bounds
        assert page.locator('header').evaluate('(n)=>n.scrollWidth<=n.clientWidth+1'), ('header overflow',width)
        active=page.locator('header .tabs .tab.active').evaluate('(n)=>{const r=n.getBoundingClientRect(),p=n.parentNode.getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1;}')
        assert active, ('active tab hidden',width)
        if width==390:
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(out/(prefix+'-navigation-mobile.png')))
            page.locator('footer').screenshot(path=str(out/(prefix+'-footer-mobile.png')))
        first.focus(); first.press('Home')
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('[data-tab="workRecords"]').click()
    page.locator('footer').screenshot(path=str(out/(prefix+'-footer-desktop.png')))
    toggle=page.locator('.glass-controls button')
    toggle.click()
    expect(toggle).to_have_attribute('aria-pressed','true')
    assert page.locator('header').evaluate('(n)=>getComputedStyle(n).backdropFilter')=='none'
    assert tabs.first.evaluate('(n)=>getComputedStyle(n).transitionDuration')=='0s'
    toggle.click();expect(toggle).to_have_attribute('aria-pressed','false')
    page.emulate_media(reduced_motion='reduce')
    assert tabs.first.evaluate('(n)=>getComputedStyle(n).transitionDuration')=='0s'
    page.emulate_media(reduced_motion='no-preference')
    first.click();page.evaluate('window.scrollTo(0,0)')
    gutters = check_page_gutters(page, out, prefix)
    return {'status':'passed','pageGutters':gutters,'tabs':keys,'widths':[320,390,430,760,1024,1440],
            'checks':['original tab/panel integration','keyboard navigation','active tab visibility',
                      'header overflow bounds','transparent source logo alpha','lightweight mode','reduced motion'],
            'logo':alpha}


def check_page_gutters(page, out, prefix):
    """Compare actual outer edges for every tab, including the breakpoint."""
    widths = [320, 360, 390, 430, 760, 761, 1024, 1440, 1920]
    keys = page.locator('header .tabs .tab').evaluate_all('(ns)=>ns.map(n=>n.dataset.tab)')
    results = []
    for width in widths:
        page.set_viewport_size({'width':width, 'height':1000 if width >= 1024 else 844})
        for key in keys:
            page.locator('[data-tab="'+key+'"]').click()
            page.wait_for_timeout(240)
            geometry = page.evaluate("""()=>{
              // Synthetic resizing/focus can retain document scrollX. Reset the
              // measurement origin, without relaxing any actual edge assertion.
              window.scrollTo({left:0,top:window.scrollY,behavior:'instant'});
              const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};};
              const header=rect(document.querySelector('body>header'));
              const main=document.querySelector('body>.container'), m=rect(main), s=getComputedStyle(main);
              const panel=rect(main.querySelector('.tab-content.active'));
              const surfaces=Array.from(main.querySelectorAll('#missingBanner,.tab-content.active .city-section .table-wrap,.tab-content.active .wr-page'))
                .filter(n=>n.getClientRects().length&&getComputedStyle(n).display!=='none').map(rect);
              return {header,content:{left:m.left+parseFloat(s.paddingLeft),right:m.right-parseFloat(s.paddingRight)},
                panel,footer:rect(document.querySelector('body>footer')),surfaces,viewport:document.documentElement.clientWidth};
            }""")
            h = geometry['header']
            expected = 6 if width <= 760 else 12
            assert abs(h['left']-expected)<1 and abs(geometry['viewport']-h['right']-expected)<1, ('header changed',width,key,geometry)
            for name in ['content','panel','footer']:
                r = geometry[name]
                assert abs(r['left']-h['left'])<1 and abs(r['right']-h['right'])<1, (name,width,key,geometry)
            for r in geometry['surfaces']:
                assert abs(r['left']-h['left'])<1 and abs(r['right']-h['right'])<1, ('surface alignment',width,key,r,h)
            results.append({'width':width,'tab':key,'left':h['left'],'rightGutter':geometry['viewport']-h['right']})
            if (width==1440 and key in ['soilType','references','workRecords']) or (width==390 and key=='soilType'):
                page.evaluate('window.scrollTo(0,0)')
                page.screenshot(path=str(out/(prefix+'-gutters-'+key+'-'+str(width)+'.png')))
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('[data-tab="soilType"]').click()
    page.evaluate('window.scrollTo(0,0)')
    return {'status':'passed','widths':widths,'tabCount':len(keys),'measurements':results}
