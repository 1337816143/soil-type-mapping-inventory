"""Read-only deployment check: actual platform metadata and served PDF hashes."""
from pathlib import Path
from urllib.parse import quote
import hashlib,json,runpy,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-artifacts';OUT.mkdir(exist_ok=True)
BASE='https://1337816143.github.io/soil-type-mapping-inventory/'
VERSION=(ROOT/'VERSION').read_text().strip()
receipt=json.loads((ROOT/'docs/unit-repair-v1.2.7.json').read_text())
report={'version':VERSION,'status':'running','documents':[],'productionWrites':0}
try:
    with sync_playwright() as p:
        browser=p.chromium.launch();context=browser.new_context(viewport={'width':1440,'height':1000})
        def read_only(route):
            if route.request.method not in ('GET','HEAD','OPTIONS'):
                report['productionWrites']+=1;route.abort()
            else:route.continue_()
        context.route('**/*',read_only)
        page=context.new_page();page.goto(BASE+'?unit-check='+VERSION,wait_until='domcontentloaded',timeout=90000)
        page.wait_for_function("document.documentElement.classList.contains('soil-ready') || (window.SoilAdminAutoClassifier && document.querySelector('header .tabs'))",timeout=90000)
        page.wait_for_function('window.SoilGlassNavigation && window.SoilWorkRecords',timeout=60000)
        assert page.evaluate('window.SOIL_APP_VERSION')==VERSION
        report['platform']=runpy.run_path(str(ROOT/'scripts/check-unit-repair-ui.py'))['check_unit_repair_ui'](page,OUT,'live')
        for item in receipt['reports']:
            if not item['documentChanged']:continue
            actual=''
            for attempt in range(3):
                url=BASE+quote(item['path'],safe='/')+'?unit-correction='+VERSION+'&attempt='+str(attempt)
                response=context.request.get(url,headers={'Cache-Control':'no-cache'},timeout=120000)
                if response.ok:actual=hashlib.sha256(response.body()).hexdigest()
                if actual==item['afterSHA256']:break
                time.sleep(3)
            assert actual==item['afterSHA256'],('Published PDF differs from verified correction',item['path'],response.status)
            report['documents'].append({'path':item['path'],'sha256':actual,'verified':True})
        assert len(report['documents'])==receipt['documentsChanged'] and report['productionWrites']==0
        browser.close()
    report['status']='passed'
finally:
    (OUT/'live-unit-repair-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('Live unit repair verified:',len(report['documents']),'actual PDFs and platform/reply behavior; no production writes.')
