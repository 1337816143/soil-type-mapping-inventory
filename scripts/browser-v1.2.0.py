#!/usr/bin/env python3
"""Real Chromium regression; all external requests are mocked. No live writes."""
from __future__ import annotations
import argparse, ast, base64, http.server, importlib.util, json, mimetypes, os, shutil, struct, tempfile, threading, zlib
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
P=argparse.ArgumentParser();P.add_argument('--root',type=Path,default=ROOT);args=P.parse_args();ROOT=args.root
ART=Path(os.getenv('SOIL_TEST_OUTPUT','test-results/browser'));ART.mkdir(parents=True,exist_ok=True)
SPEC=importlib.util.spec_from_file_location('workstore',Path(__file__).with_name('work-records-store.py'));store=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(store)
def original_tree():
    import subprocess
    filename=ROOT/'_test-repository-tree.txt'
    lines=filename.read_text().splitlines() if filename.exists() else subprocess.check_output(['git','ls-tree','-rl','HEAD'],cwd=ROOT,text=True).splitlines()
    result=[]
    for line in lines:
        meta,path=line.split('\t',1);mode,kind,sha,size=meta.split()
        if path.startswith('"'):path=ast.literal_eval(path).encode('latin1').decode('utf-8')
        result.append({'path':path,'type':kind,'sha':sha,'size':int(size) if size.isdigit() else 0})
    return result
TREE=original_tree()
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k):super().__init__(*a,directory=str(ROOT),**k)
    def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start();BASE=f'http://127.0.0.1:{server.server_port}'
class Network:
    def __init__(self,temp):
        self.root=Path(temp)/'repo';self.root.mkdir();self.out=Path(temp)/'staged';self.out.mkdir()
        store.write_json(self.root/'data/work-records/index.json',{'schemaVersion':1,'records':[]})
        self.blobs={};self.trees={};self.commits={};self.count=0;self.operations=0;self.requests=[]
    def respond(self,route,body,status=200,ctype='application/json'):
        if not isinstance(body,(str,bytes)):body=json.dumps(body,ensure_ascii=False)
        route.fulfill(status=status,body=body,content_type=ctype,headers={'Access-Control-Allow-Origin':'*'})
    def local(self,route,rel):
        if rel=='data/repository-tree.json':return self.respond(route,{'tree':TREE,'appVersion':(ROOT/'VERSION').read_text().strip()})
        p=self.root/rel
        if not p.is_file():p=ROOT/rel
        if p.is_file():return self.respond(route,p.read_bytes(),ctype=mimetypes.guess_type(str(p))[0] or 'application/octet-stream')
        if rel.startswith('assets/') and rel.lower().endswith(('.jpg','.png')):return self.respond(route,base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII='),ctype='image/png')
        return self.respond(route,{'message':'Not Found'},404)
    def route(self,route):
        req=route.request;url=urlsplit(req.url);path=unquote(url.path)
        if url.hostname=='api.github.com':
            prefix='/repos/1337816143/soil-type-mapping-inventory';endpoint=path[len(prefix):] if path.startswith(prefix) else path
            self.requests.append((req.method,endpoint));body=json.loads(req.post_data) if req.post_data else {}
            if endpoint=='/user':return self.respond(route,{'login':'offline-regression'})
            if req.method=='GET':
                if endpoint.startswith('/git/ref/'):return self.respond(route,{'object':{'sha':'testhead'}})
                if endpoint.startswith('/git/commits/'):return self.respond(route,{'tree':{'sha':'base-tree'}})
                if endpoint.startswith('/git/trees/'):return self.respond(route,{'tree':TREE})
                if endpoint.startswith('/contents/'):
                    rel=endpoint[len('/contents/'):];p=self.root/rel
                    if not p.is_file():p=ROOT/rel
                    if p.is_file():return self.respond(route,{'content':base64.b64encode(p.read_bytes()).decode(),'encoding':'base64','sha':'testsha'})
                    return self.respond(route,{'message':'Not Found'},404)
                if '/actions/' in endpoint:return self.respond(route,{'workflow_runs':[]})
                return self.respond(route,{})
            self.count+=1;sha='mock'+str(self.count)
            if endpoint=='/git/blobs':
                self.blobs[sha]=base64.b64decode(body['content']) if body.get('encoding')=='base64' else body['content'].encode();return self.respond(route,{'sha':sha},201)
            if endpoint=='/git/trees':self.trees[sha]=body['tree'];return self.respond(route,{'sha':sha},201)
            if endpoint=='/git/commits':self.commits[sha]=body['tree'];return self.respond(route,{'sha':sha},201)
            if endpoint=='/git/refs' and body['ref'].startswith('refs/heads/work-records-upload-'):
                entries=self.trees[self.commits[body['sha']]]
                for entry in entries:
                    p=self.root/entry['path'];p.parent.mkdir(parents=True,exist_ok=True)
                    p.write_bytes(entry['content'].encode() if 'content'in entry else self.blobs[entry['sha']])
                store.prepare(self.root,self.out);store.apply(self.root,self.out);self.operations+=1
                return self.respond(route,{'object':{'sha':body['sha']}},201)
            return self.respond(route,{'sha':sha},201)
        if url.hostname=='raw.githubusercontent.com':
            parts=path.split('/');rel='/'.join(parts[4:]);return self.local(route,rel)
        if url.hostname=='127.0.0.1':
            if path=='/data/repository-tree.json':return self.local(route,path[1:])
            if path.startswith('/assets/') and not(ROOT/path[1:]).is_file():return self.local(route,path[1:])
            return route.continue_()
        return self.respond(route,'',404,'text/plain')
with tempfile.TemporaryDirectory() as temp,sync_playwright() as pw:
    network=Network(temp)
    executable=os.getenv('CHROMIUM_PATH') or shutil.which('chromium')
    browser=pw.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':1440,'height':1000},locale='zh-CN')
    context.route('**/*',network.route);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    context.tracing.start(screenshots=True,snapshots=True,sources=False)
    try:
        page.goto(BASE+'/index.html');page.wait_for_function("document.documentElement.dataset.soilEnhancementsReady === 'true'",timeout=30000);page.wait_for_timeout(2300)
        original_quality_data=page.evaluate('JSON.stringify(tabData)')
        page.locator('[data-tab="workRecords"]').click();page.wait_for_timeout(1000)
        print('initial page errors',errors)
        page.screenshot(path=str(ART/'work-records-empty-desktop.png'))
        page.locator('#wr-new').click();page.wait_for_timeout(200);page.screenshot(path=str(ART/'work-records-editor-desktop.png'))
        page.locator('#wr-field-title').fill('国家抽检质控交流（浏览器回归样例）')
        page.locator('#wr-field-time').fill('2026-09-19T09:30')
        page.locator('#wr-field-location').fill('保定 · 线上会议')
        page.locator('#wr-field-people').fill('测试人员')
        page.locator('#wr-field-notes').fill('类型图与属性图资料核对，仅用于本地回归。')
        files=[]
        for i,color in enumerate([(226,238,255),(216,245,232),(251,231,209)]):
            width,height=500+i*20,320
            def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
            image=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+bytes(color)*width)*height))+chunk(b'IEND',b'')
            files.append({'name':f'图片{i+1}.png','mimeType':'image/png','buffer':image})
        files.append({'name':'会议资料.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\n%%EOF\n'})
        page.locator('#wr-files-input').set_input_files(files)
        page.locator('#wr-save-draft').click();page.wait_for_function("document.querySelector('#wr-draft-status').textContent.includes('已暂存')")
        page.reload();page.wait_for_function("document.documentElement.dataset.soilEnhancementsReady === 'true'");page.wait_for_timeout(2000)
        page.locator('[data-tab="workRecords"]').click();page.wait_for_timeout(300);page.locator('#wr-drafts').evaluate('(el)=>el.open=true');page.locator('[data-resume-draft]').first.click()
        assert page.locator('#wr-field-title').input_value().startswith('国家抽检')
        assert page.locator('#wr-editor-files li').count()==4
        assert page.evaluate("SoilWorkRecordsStore.drafts('list').then(x=>x[0].files.every(f=>f.file instanceof Blob && f.file.size>0))")
        page.locator('#wr-save').click();page.wait_for_selector('#wr-editor',state='detached',timeout=20000);page.wait_for_timeout(500)
        assert network.operations==1
        assert page.locator('.wr-record').count()==1
        page.wait_for_function("document.querySelector('#wr-images img').complete && document.querySelector('#wr-images img').naturalWidth>0")
        box=page.locator('#wr-images').bounding_box();page.mouse.move(box['x']+80,box['y']+90);page.mouse.wheel(0,90);page.wait_for_timeout(450)
        assert page.locator('.wr-deck-count').first.inner_text().startswith('2 /')
        page.locator('#wr-images').focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(450);assert page.locator('.wr-deck-count').first.inner_text().startswith('3 /')
        page.locator('#wr-images').dispatch_event('keydown',{'key':'8','code':'Numpad8','bubbles':True});page.wait_for_timeout(450);assert page.locator('.wr-deck-count').first.inner_text().startswith('2 /')
        page.screenshot(path=str(ART/'work-records-cards-desktop.png'))
        page.locator('#wr-view-table').click();assert page.locator('.wr-table td').count()==6
        page.locator('#wr-search').fill('不匹配的检索词');page.wait_for_timeout(250);assert page.locator('.wr-table').count()==0
        page.locator('#wr-search').fill('国家抽检 保定');page.wait_for_timeout(250);assert page.locator('.wr-table tbody tr').count()==1
        page.locator('#wr-view-cards').click()
        page.locator('[data-edit-record]').click();assert page.locator('#wr-editor').count()==0
        page.locator('#wr-admin-password').fill('wrong');page.locator('#wr-auth-confirm').click();assert page.locator('#wr-editor').count()==0
        password=page.evaluate('SoilAdminImport.PASS')
        page.locator('#wr-admin-password').fill(password);page.locator('#wr-auth-confirm').click();page.wait_for_selector('#wr-editor')
        page.locator('#wr-field-notes').fill('修改备注')
        page.locator('#wr-save-draft').click();page.wait_for_function("document.querySelector('#wr-draft-status').textContent.includes('已暂存')")
        page.locator('#wr-editor .wr-close').click();page.wait_for_selector('#wr-editor',state='detached')
        page.locator('#wr-drafts').evaluate('(el)=>el.open=true');page.locator('[data-resume-draft]').first.click()
        page.wait_for_selector('#wr-admin-password');assert page.locator('#wr-editor').count()==0
        page.locator('#wr-admin-password').fill(password);page.locator('#wr-auth-confirm').click();page.wait_for_selector('#wr-editor')
        assert page.locator('#wr-field-notes').input_value()=='修改备注'
        page.locator('#wr-save').click();page.wait_for_selector('#wr-editor',state='detached',timeout=20000)
        assert network.operations==2
        assert store.read_json(network.root/'data/work-records/index.json')['records'][0]['revision']==2
        results=[]
        for width,height in [(320,568),(360,640),(375,667),(390,844),(393,873),(412,915),(430,932),(667,375),(844,390),(390,380)]:
            page.set_viewport_size({'width':width,'height':height});page.locator('#wr-new').click();page.wait_for_timeout(100)
            for selector in ['#wr-editor .wr-close','#wr-save','#wr-save-draft']:
                r=page.locator(selector).bounding_box();assert r and r['x']>=-1 and r['y']>=-1 and r['x']+r['width']<=width+1 and r['y']+r['height']<=height+1,(width,height,selector,r)
            assert page.locator('#wr-editor .wr-dialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
            if width in [360,390] and height>600:page.screenshot(path=str(ART/f'work-editor-{width}x{height}.png'))
            page.locator('#wr-editor .wr-close').click();page.wait_for_selector('#wr-editor',state='detached')
            results.append({'width':width,'height':height,'pass':True})
        page.set_viewport_size({'width':1440,'height':1000})
        assert page.evaluate('JSON.stringify(tabData)')==original_quality_data,'工作记录不能修改质控数据'
        page.locator('[data-delete-record]').click();page.wait_for_selector('#wr-admin-password')
        assert len(store.read_json(network.root/'data/work-records/index.json')['records'])==1
        page.locator('#wr-admin-password').fill('wrong');page.locator('#wr-auth-confirm').click()
        assert len(store.read_json(network.root/'data/work-records/index.json')['records'])==1
        page.locator('#wr-admin-password').fill(password);page.locator('#wr-auth-confirm').click()
        page.wait_for_function('SoilWorkRecords.state.records.length===0',timeout=20000)
        assert network.operations==3
        assert not list((network.root/'data/work-records/attachments').rglob('*.png'))
        page.locator('[data-tab="soilType"]').click();page.wait_for_timeout(300)
        assert page.locator('#tab-soilType .batch-tag').first.inner_text().startswith('2026年第一次')
        aliases=page.evaluate("({same:SoilReplyWorkflow.replyKey('市','单位','县','第一批')===SoilReplyWorkflow.replyKey('市','单位','县','2026年第一次第1批'),different:SoilReplyWorkflow.replyKey('市','单位','县','第一批')!==SoilReplyWorkflow.replyKey('市','单位','县','2026年第二次第1批')})")
        assert aliases['same'] and aliases['different']
        page.evaluate("openSoilAdminImport({kind:'quality'})");page.wait_for_selector('#qc-cycle-apply');page.locator('#qc-cycle-round').select_option('2');page.locator('#qc-cycle-batch').fill('3');page.locator('#qc-cycle-apply').click();page.wait_for_timeout(300)
        assert page.evaluate('SoilAdminImport.state.qualityCycleOverride.round')==2
        page.locator('#soilAdminImport .adm-close').click()
        page.locator('[data-tab="references"]').click();page.wait_for_selector('#ref-admin');page.locator('#ref-admin').click();page.wait_for_timeout(300)
        assert page.locator('#soilReferenceUpload.show').count()==1
        quality_state=page.evaluate('JSON.stringify(SoilAdminImport.state.files)')
        page.locator('#ref-upload-files').set_input_files({'name':'耕地质量等级评价技术手册.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\n%%EOF'})
        page.wait_for_function('SoilReferenceUpload.getState().files.length===1');page.wait_for_timeout(400)
        ref_state=page.evaluate('SoilReferenceUpload.getState().files.map(x=>({directory:x.directory,manual:x.manualDirectory}))')
        assert '耕地质量' in ref_state[0]['directory'],ref_state
        page.locator('#ref-upload-bulk-dir').select_option(label='reference-files/third-soil-survey')
        page.locator('#ref-upload-apply-dir').click();page.wait_for_timeout(1200)
        assert page.evaluate('SoilReferenceUpload.getState().files[0].manualDirectory')
        assert page.evaluate('SoilReferenceUpload.getState().files[0].directory')=='reference-files/third-soil-survey'
        assert page.evaluate('JSON.stringify(SoilAdminImport.state.files)')==quality_state
        page.locator('#soilReferenceUpload .ref-upload-close').click()
        page.set_viewport_size({'width':360,'height':640})
        page.locator('#ref-batch-download').click();page.wait_for_selector('#soil-reference-batch-download-modal')
        close=page.locator('#soil-reference-batch-download-modal .soil-modal-close').bounding_box()
        assert close and close['y']>=0 and close['y']+close['height']<=640
        page.locator('#soil-reference-batch-download-modal .soil-modal-close').click()
        assert not errors,errors
        (ART/'browser-results.json').write_text(json.dumps({'status':'passed','viewports':results,'operations':network.operations,'errors':errors},ensure_ascii=False,indent=2))
        print('BROWSER PASS:',len(results),'viewports; drafts with bytes; save/edit/delete auth; image navigation; labels; reference isolation')
    except Exception:
        page.screenshot(path=str(ART/'failure.png'))
        (ART/'page-errors.json').write_text(json.dumps(errors,ensure_ascii=False))
        raise
    finally:
        context.tracing.stop(path=str(ART/'trace.zip'))
        browser.close();server.shutdown()
