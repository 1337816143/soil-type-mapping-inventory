"""Browser regression with mock records and mocked GitHub requests; no production writes."""
import base64, http.server, json, os, pathlib, threading, urllib.parse, traceback
from playwright.sync_api import sync_playwright, expect
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'test-artifacts'; OUT.mkdir(exist_ok=True)
HARNESS='''<!doctype html><html class="glass-ui" lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.container{max-width:1300px;margin:auto;padding:18px}.tabs{display:flex}.tab{cursor:pointer}.tab-content{display:none}.tab-content.active{display:block}</style><link rel="stylesheet" href="glass-interface.css"><link rel="stylesheet" href="work-records.css"></head><body><header><div class="container"><h1>河北省第三次全国土壤普查 · 质量控制意见交流平台</h1><div class="tabs"></div></div></header><div class="container"></div><script>window.SOIL_RELEASE_VERSION='v1.2.0';window.SOIL_GITHUB_UPLOAD_TOKEN='test-credential';window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN='test-credential';window.SoilAdminImport={PASS:'478666'};window.SoilDocumentPreview={open:function(url,name){window.lastPreview={url:url,name:name};}};</script><script src="batch-policy.js"></script><script src="work-records-core.js"></script><script src="work-records.js"></script></body></html>'''
BOOT="window.SOIL_RELEASE_VERSION='v1.2.0';window.SOIL_APP_VERSION='v1.2.0';window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN='test-credential';window.SOIL_GITHUB_UPLOAD_TOKEN='test-credential';window.SOIL_UPLOAD_API_URL='';var s=document.createElement('script');s.src='./page-enhancements.js';document.head.appendChild(s);"
VERSION=(ROOT/'VERSION').read_text().strip()
HARNESS=HARNESS.replace('v1.2.0',VERSION)
BOOT=BOOT.replace('v1.2.0',VERSION)
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,*a):pass
    def do_GET(self):
        path=urllib.parse.urlsplit(self.path).path
        if path in ('/__workspace_test__.html','/upload-config.js'):
            body=(HARNESS if path.endswith('.html') else BOOT).encode()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8' if path.endswith('.html') else 'application/javascript');self.end_headers();self.wfile.write(body)
        else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}'
SIZES=[(320,568),(360,640),(375,667),(390,844),(393,873),(412,915),(430,932),(667,375),(844,390)]
report={'engines':[],'viewports':SIZES,'checks':[]}
with sync_playwright() as p:
    for engine in os.getenv('BROWSER_ENGINES','chromium').split(','):
        args={'headless':True}
        if engine=='chromium' and os.getenv('CHROMIUM_PATH'):args['executable_path']=os.environ['CHROMIUM_PATH']
        browser=getattr(p,engine).launch(**args)
        ctx=browser.new_context(viewport={'width':1280,'height':900},has_touch=True)
        page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        remote={'schemaVersion':1,'records':[]};trees={};commits={};uploaded={};attachment_paths={};requests=[]
        def route(r):
            u=r.request.url
            if '/data/work-records.json' in u:
                r.fulfill(json={'content':base64.b64encode(json.dumps(remote).encode()).decode()} if 'api.github.com' in u else remote);return
            if 'api.github.com' in u:
                path=urllib.parse.urlsplit(u).path.split('/soil-type-mapping-inventory')[-1];body=r.request.post_data_json or {};requests.append(path)
                if path=='/git/ref/heads/main':r.fulfill(json={'object':{'sha':'head'}})
                elif path.startswith('/git/commits/'):r.fulfill(json={'tree':{'sha':'base'}})
                elif path=='/git/blobs':
                    k='blob'+str(len(uploaded));uploaded[k]=base64.b64decode(body['content']);r.fulfill(status=201,json={'sha':k})
                elif path=='/git/trees':k='tree'+str(len(trees));trees[k]=body['tree'];r.fulfill(status=201,json={'sha':k})
                elif path=='/git/commits':k='commit'+str(len(commits));commits[k]=body['tree'];r.fulfill(status=201,json={'sha':k})
                elif path=='/git/refs/heads/main':
                    assert body['force'] is False
                    entries=trees[commits[body['sha']]];content=next(x['content'] for x in entries if x['path']=='data/work-records.json')
                    attachment_paths.update({x['path']:uploaded[x['sha']] for x in entries if x.get('sha') in uploaded});remote.clear();remote.update(json.loads(content));r.fulfill(json={'object':{'sha':body['sha']}})
                else:r.fulfill(json={'tree':[],'login':'test'})
                return
            if 'raw.githubusercontent.com' in u:
                if '/work-record-attachments/' in u:
                    ap=urllib.parse.unquote(urllib.parse.urlsplit(u).path.split('/main/',1)[-1]);r.fulfill(body=attachment_paths.get(ap,b''),content_type='image/png');return
                suffix=urllib.parse.unquote(urllib.parse.urlsplit(u).path.split('/main/',1)[-1]);f=ROOT/suffix
                if f.is_file() and f.suffix=='.json':r.fulfill(body=f.read_bytes(),content_type='application/json')
                else:r.fulfill(status=404,body='Not Found')
                return
            r.continue_()
        ctx.route('**/*',route)
        try:
            page.goto(URL+'/__workspace_test__.html');page.locator('[data-tab="workRecords"]').click()
            expect(page.locator('#wr-count')).to_have_text('0 条工作记录')
            # Draft metadata lists must not hydrate every attachment; orphan cleanup
            # must preserve files still referenced by another draft.
            page.evaluate('''async()=>{
              const C=SoilWorkCore, file={id:'shared-test',file:new File(['bytes'],'keep.txt',{type:'text/plain'})};
              const a={id:'gc-a',fields:{title:'a'},files:[file]},b={id:'gc-b',fields:{title:'b'},files:[file]};
              await C.drafts.put(a);await C.drafts.put(b);
              const metadata=await C.drafts.list({metadataOnly:true});
              if(metadata.some(d=>d.files.some(f=>f.file)))throw Error('Metadata hydrated attachment bytes');
              a.files=[];await C.drafts.put(a);
              if(await (await C.drafts.get('gc-b')).files[0].file.text()!=='bytes')throw Error('Shared attachment was lost');
              b.files=[];await C.drafts.put(b);
              const count=await new Promise((resolve,reject)=>{const r=indexedDB.open('soil-work-record-drafts',2);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('files'),q=tx.objectStore('files').count();q.onsuccess=()=>resolve(q.result);tx.oncomplete=()=>db.close();};});
              if(count!==0)throw Error('Removed attachment bytes were not collected');
              await C.drafts.remove('gc-a');await C.drafts.remove('gc-b');
            }''')
            page.locator('#wr-new').click()
            page.locator('#wr-field-title').fill('北部片区质控交流会')
            page.locator('#wr-field-time').fill('2026-09-18T09:30')
            page.locator('#wr-field-location').fill('石家庄 · 会议室')
            page.locator('#wr-field-people').fill('张三、李四')
            page.locator('#wr-field-notes').fill('核对第一次质控意见，安排第二次材料收集。<b>原样保存测试</b>')
            images=page.evaluate('''() => [0,1,2].map(i=>{let c=document.createElement('canvas');c.width=700;c.height=420;let x=c.getContext('2d'),g=x.createLinearGradient(0,0,700,420);g.addColorStop(0,['#dcebed','#e1e8f6','#e6ecd9'][i]);g.addColorStop(1,['#698d9f','#7b86af','#6f8e7d'][i]);x.fillStyle=g;x.fillRect(0,0,700,420);x.fillStyle='#ffffff';x.font='bold 45px sans-serif';x.fillText('FIELD NOTES 0'+(i+1),50,210);return c.toDataURL('image/png').split(',')[1];})''')
            page.locator('#wr-attachments').set_input_files([{'name':f'现场{i+1}.png','mimeType':'image/png','buffer':base64.b64decode(v)} for i,v in enumerate(images)]+[{'name':'会议资料.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\n% fixture only'}])
            expect(page.locator('#wr-editor-files .wr-file')).to_have_count(4)
            page.get_by_role('button',name='暂存草稿',exact=True).click();expect(page.locator('.wr-draft-status')).to_contain_text('已暂存')
            for width,height in SIZES:
                page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
                bounds=page.locator('.wr-dialog').evaluate('(n)=>{let r=n.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,sw:n.scrollWidth,cw:n.clientWidth}}')
                assert bounds['x']>=0 and bounds['y']>=0 and bounds['r']<=width+1 and bounds['b']<=height+1,(engine,width,height,bounds)
                assert bounds['sw']<=bounds['cw']+1,(engine,'horizontal overflow',width,height,bounds)
                for selector in ['.wr-dialog-head .wr-button','.wr-dialog-foot .primary']:
                    b=page.locator(selector).bounding_box();assert b and b['y']>=0 and b['y']+b['height']<=height+1,(engine,width,height,selector,b)
                if width in (390,844):page.screenshot(path=str(OUT/f'{engine}-editor-{width}x{height}.png'))
            page.set_viewport_size({'width':1280,'height':900})
            page.get_by_role('button',name='暂存并关闭',exact=True).evaluate('(b)=>{b.click();b.click();}');expect(page.locator('.wr-overlay')).to_have_count(0)
            page.reload();page.locator('[data-tab="workRecords"]').click();page.get_by_role('button',name='继续编辑',exact=True).click()
            expect(page.locator('#wr-field-title')).to_have_value('北部片区质控交流会');expect(page.locator('#wr-editor-files .wr-file')).to_have_count(4)
            restored=page.evaluate('''async()=>{let rows=await SoilWorkCore.drafts.list();return Promise.all(rows[0].files.map(async x=>{let a=new Uint8Array(await x.file.arrayBuffer()),s='';for(let b of a)s+=String.fromCharCode(b);return {name:x.file.name,bytes:btoa(s)};}));}''')
            assert [x['bytes'] for x in restored[:3]]==images, 'Draft image bytes changed across reload'
            assert base64.b64decode(restored[3]['bytes'])==b'%PDF-1.4\n% fixture only'
            page.get_by_role('button',name='正式保存',exact=True).evaluate('(b)=>{b.click();b.click();}');expect(page.locator('.wr-overlay')).to_have_count(0,timeout=15000)
            assert requests.count('/git/refs/heads/main')==1, 'Double tap submitted twice'
            expect(page.locator('.wr-record')).to_have_count(1);expect(page.locator('.wr-record')).to_contain_text('石家庄 · 会议室')
            assert len(remote['records'][0]['attachments'])==4
            assert not page.locator('.wr-notes b').count(),'Notes were not escaped'
            expect(page.locator('.wr-draft-chip')).to_have_count(0)
            deck=page.locator('.wr-deck');deck.focus();deck.press('ArrowRight');expect(page.locator('.wr-gallery-controls span')).to_have_text('2 / 3')
            page.wait_for_timeout(300);deck.hover();page.mouse.wheel(0,150);expect(page.locator('.wr-gallery-controls span')).to_have_text('3 / 3')
            page.locator('.wr-file').get_by_role('button',name='预览').click();assert page.evaluate('window.lastPreview.name')=='会议资料.pdf'
            page.screenshot(path=str(OUT/f'{engine}-cards-desktop.png'),full_page=True)
            page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/f'{engine}-cards-mobile.png'),full_page=True)
            page.locator('[data-view="table"]').click();expect(page.locator('.wr-table tbody tr')).to_have_count(1)
            page.locator('#wr-search').fill('不存在的检索');expect(page.locator('.wr-table')).to_have_count(0)
            expect(page.locator('.wr-empty')).to_contain_text('没有找到匹配的工作记录')
            page.locator('#wr-search').fill('张三 第二次');expect(page.locator('.wr-table tbody tr')).to_have_count(1)
            page.locator('#wr-search').fill('');page.locator('[data-view="cards"]').click()
            # Hold a stale refresh response while an edit commits, then release it.
            page.evaluate('''()=>{const native=window.fetch;window.releaseStaleRefresh=null;window.fetch=(url,options)=>String(url).includes('raw.githubusercontent.com')&&String(url).includes('data/work-records.json')?new Promise(resolve=>{window.releaseStaleRefresh=()=>{window.fetch=native;resolve(new Response(JSON.stringify({schemaVersion:1,records:[]})));};}):native(url,options);void SoilWorkRecords.refresh(true);}''')
            page.get_by_role('button',name='编辑',exact=True).evaluate('(b)=>{b.click();b.click();}');expect(page.locator('.wr-auth')).to_have_count(1);expect(page.locator('#wr-auth-password')).to_be_visible()
            page.locator('#wr-auth-password').fill('wrong');page.get_by_role('button',name='验证并继续').click();expect(page.locator('.wr-auth')).to_contain_text('不正确')
            assert not page.locator('#wr-field-title').count()
            page.locator('#wr-auth-password').fill('478666');page.get_by_role('button',name='验证并继续').click();expect(page.locator('#wr-field-title')).to_be_visible()
            page.locator('#wr-field-location').fill('保定 · 现场');page.get_by_role('button',name='正式保存',exact=True).click();expect(page.locator('.wr-overlay')).to_have_count(0)
            assert remote['records'][0]['revision']==2
            page.evaluate('window.releaseStaleRefresh()');page.wait_for_timeout(100)
            expect(page.locator('.wr-record')).to_have_count(1);expect(page.locator('.wr-record')).to_contain_text('保定 · 现场')
            page.get_by_role('button',name='删除',exact=True).click();expect(page.locator('#wr-auth-password')).to_be_visible()
            page.locator('#wr-auth-password').fill('478666');page.get_by_role('button',name='验证并继续').click();expect(page.locator('.wr-record')).to_have_count(0)
            assert remote['records'][0].get('deletedAt')
            assert not errors,errors
            # Real application smoke check with network writes intercepted above.
            page.set_viewport_size({'width':1440,'height':1000});errors.clear();page.goto(URL+'/index.html')
            page.wait_for_function("document.documentElement.getAttribute('data-soil-enhancements-ready') === 'true'",timeout=30000)
            page.locator('[data-tab="workRecords"]').click();expect(page.locator('#wr-new')).to_be_visible()
            page.locator('[data-tab="soilType"]').click();page.wait_for_timeout(300)
            assert page.locator('.batch-tag').first.text_content().startswith('2026年第一次')
            page.evaluate("openSoilAdminImport({kind:'quality',dataKey:'soilType'})")
            expect(page.locator('#qc-round-controls')).to_be_visible();page.locator('#qc-round').fill('2');page.locator('#qc-apply-round').click()
            assert page.evaluate("SoilAdminImport.state.batchSelection.round")==2
            page.locator('#soilAdminImport .adm-close').click();page.screenshot(path=str(OUT/f'{engine}-full-site.png'),full_page=True)
            report['engines'].append(engine)
            report['checks'].append(engine+': CRUD/password, persistent draft attachment bytes, single-flight save/close/authorization, attachment garbage collection, metadata-only draft listing, stale-refresh protection, search/table, image keyboard/wheel, 9 responsive sizes, full application/tab/round integration')
        except Exception:
            page.screenshot(path=str(OUT/f'{engine}-failure.png'),full_page=True)
            (OUT/f'{engine}-errors.json').write_text(json.dumps(errors,ensure_ascii=False))
            (OUT/f'{engine}-failure.txt').write_text(traceback.format_exc())
            raise
        finally:ctx.close();browser.close()
server.shutdown()
(OUT/'workspace-browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
