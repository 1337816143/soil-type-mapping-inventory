"""Actual upload click chain, with all GitHub writes intercepted.

The screenshots supplied filenames, not report bytes. Disposable byte fixtures
exercise routing and transfer without uploading user reports or test records.
"""
import base64, json, re
from urllib.parse import urlsplit
from playwright.sync_api import expect


def check_upload_recognition_ui(page, out, prefix):
    before = page.evaluate('JSON.stringify(SoilTaskUnitLists)')
    writes, manifests, uploads, payloads, trees = [], [], [], {}, {}
    dialogs, accept_dialog = [], [False]

    def dialog(d):
        dialogs.append(d.message)
        d.accept() if accept_dialog[0] else d.dismiss()

    def route(r):
        path = urlsplit(r.request.url).path.split('/soil-type-mapping-inventory', 1)[-1]
        method = r.request.method
        if method == 'GET':
            if path == '/git/ref/heads/main': r.fulfill(json={'object': {'sha': 'recognition-base'}})
            elif path.startswith('/git/commits/'): r.fulfill(json={'tree': {'sha': 'recognition-tree'}})
            elif path == '/commits':
                r.fulfill(json=[{'sha':'recognition-completed', 'commit':{'message':'fixture import '+x['uploadId']}} for x in manifests])
            else: r.fallback()
            return
        if method not in ('POST', 'PATCH', 'DELETE'): r.fallback(); return
        writes.append(path)
        body = r.request.post_data_json
        if path == '/git/blobs':
            raw = base64.b64decode(body['content']) if body.get('encoding') == 'base64' else body['content'].encode()
            sha = 'fixture-blob-'+str(len(payloads)); payloads[sha] = raw
            if body.get('encoding') == 'utf-8':
                try:
                    value = json.loads(raw)
                    if value.get('schemaVersion') == 3 and 'files' in value: manifests.append(value)
                except (ValueError, AttributeError): pass
            r.fulfill(status=201, json={'sha':sha})
        elif path == '/git/trees':
            sha = 'fixture-tree-'+str(len(trees)); trees[sha] = body['tree']; r.fulfill(status=201,json={'sha':sha})
        elif path == '/git/commits': r.fulfill(status=201,json={'sha':'fixture-stage-commit'})
        elif path == '/git/refs':
            assert body['ref'].startswith('refs/heads/soil-upload-'), body
            uploads.append(body); r.fulfill(status=201,json={'ref':body['ref'],'object':{'sha':body['sha']}})
        else:
            r.abort('blockedbyclient')
            raise AssertionError('Unexpected write endpoint in isolated fixture: '+path)

    pattern = 'https://api.github.com/repos/1337816143/soil-type-mapping-inventory/**'
    page.route(pattern, route); page.on('dialog', dialog)

    def pick(names, key):
        page.evaluate('(key)=>openSoilAdminImport({kind:"quality",dataKey:key})',key)
        page.locator('#adm-files').set_input_files([
            {'name':name,'mimeType':'application/pdf','buffer':b'%PDF-1.4\n% disposable transport fixture '+str(i).encode()}
            for i,name in enumerate(names)
        ])
        expect(page.locator('#adm-list .v2-row')).to_have_count(len(names))
        page.wait_for_timeout(250)

    def start():
        page.locator('#adm-pass').fill(' ４７８６６６ ')
        page.locator('#adm-ok').click()

    def wait_upload(count, file_count):
        expect(page.locator('#adm-text')).to_contain_text('归档完成',timeout=30000)
        expect(page.locator('#soilAdminImport')).not_to_have_class(re.compile(r'\bshow\b'),timeout=10000)
        assert len(uploads)==count and len(manifests)==count,(uploads,manifests)
        assert len(manifests[-1]['files'])==file_count
        tree=next(reversed(trees.values()))
        for f in manifests[-1]['files']:
            assert f['storage']=='whole' and f['quality']['complete']
            entry=next(x for x in tree if x['path']==f['whole']['path'])
            assert payloads[entry['sha']].startswith(b'%PDF-1.4\n% disposable transport fixture')
        assert not any(x.startswith('/git/refs/heads/main') for x in writes)

    try:
        exact='元氏县_总体、工作、数据报告-河北湛泸软件开发有限公司_2026年第二次第1批.pdf'
        more=page.evaluate("""()=>SoilAdminAutoClassifier.listForKey('reports').flatMap(c=>c.items.flatMap(u=>u.districts.map(d=>({city:c.city,district:d,unit:u.unit})))).filter(r=>r.district!=='元氏县').slice(0,15).map(r=>`${r.city}_${r.district}_总体、工作、数据报告-${r.unit}_2026年第二次第1批.pdf`)""")
        pick([exact]+more,'reports')
        states=page.evaluate('SoilAdminImport.state.files.map(i=>({keys:i.autoMeta.dataKeys,complete:i.autoMeta.assignment.complete,unit:i.unit}))')
        assert all(s['keys']==['reports'] and s['complete'] for s in states),states
        assert states[0]['unit']=='河北湛泸软件开发有限公司'
        expect(page.locator('#adm-list .v2-row').first.locator('.rk')).to_have_value('reports')
        page.locator('#adm-pass').fill('incorrect-test-password');page.locator('#adm-ok').click()
        expect(page.locator('#adm-text')).to_contain_text('管理员密码错误')
        assert not uploads
        start()
        expect(page.locator('#adm-text')).to_contain_text('尚未上传',timeout=15000)
        assert not uploads and not manifests
        expect(page.locator('#adm-list .v2-row')).to_have_count(16)
        assert any('16份文件已识别成果类型' in message for message in dialogs)
        page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-reports-recognized.png')))
        accept_dialog[0]=True;start();wait_upload(1,16)
        assert all(f['quality']['dataKeys']==['reports'] for f in manifests[-1]['files'])
        attr='黄骅市_土壤属性制图_河北玛恩农业科技有限公司_2026年第三次第1批.pdf'
        pick([attr],'soilType')
        row=page.locator('#adm-list .v2-row').first
        expect(row.locator('.rk')).to_have_value('soilAttr')
        expect(row.locator('.ru')).to_have_value('河北玛恩农业科技有限公司')
        expect(row.locator('.rb')).to_have_value('2026年第三次第1批')
        page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-attribute-recognized.png')))
        start();wait_upload(2,1)
        f=manifests[-1]['files'][0]
        assert f['quality']['dataKeys']==['soilAttr'] and f['quality']['batch']=='2026年第三次第1批'
        pick(['待核文件.pdf'],'soilAttr')
        row=page.locator('#adm-list .v2-row').first
        expect(row.locator('.rk')).to_be_visible()
        row.locator('.rc').select_option('沧州市')
        row.locator('.ru').select_option('河北玛恩农业科技有限公司')
        row.locator('.rd').select_option('黄骅市')
        expect(row.locator('.v2-file em')).to_contain_text('尚缺：成果类型')
        start();expect(page.locator('#adm-text')).to_contain_text('尚缺：成果类型',timeout=10000)
        assert len(uploads)==2
        for width in [1440,390]:
            page.set_viewport_size({'width':width,'height':1000 if width==1440 else 844})
            expect(row.locator('.rk')).to_be_visible()
            page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-manual-type-'+str(width)+'.png')))
        page.set_viewport_size({'width':1440,'height':1000})
        row.locator('.rk').select_option('soilAttr')
        expect(row.locator('.v2-file em')).to_contain_text('匹配完成')
        start();wait_upload(3,1)
        assert manifests[-1]['files'][0]['quality']['dataKeys']==['soilAttr']
        pick(['平山县_工作报告原件.pdf'],'reports')
        start();expect(page.locator('#adm-text')).to_contain_text('报告原件或参考资料',timeout=10000)
        assert len(uploads)==3
        page.locator('#soilAdminImport .adm-close').click()
        pick(['元氏县_总体、工作、数据报告_质控意见_2026年第二次第1批.pdf'],'reports')
        expect(page.locator('#adm-list .v2-file em')).to_contain_text('匹配完成')
        start();wait_upload(4,1)
        assert len(uploads)==4
        assert page.evaluate('JSON.stringify(SoilTaskUnitLists)')==before
        return {'status':'passed','simulatedTransfers':len(uploads),'batchFileCounts':[len(m['files']) for m in manifests],
                'checks':['16 report opinion names','cancel keeps files and metadata','original auth and preparation click chain','attribute alias and third round','per-file manual category and precise missing field','explicit originals blocked','renamed opinion upload','manifest types and byte preservation','no production writes','rosters unchanged']}
    finally:
        page.remove_listener('dialog',dialog);page.unroute(pattern,route)
