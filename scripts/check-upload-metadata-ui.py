"""Screenshot regressions and actual click/preparation/upload chain with mocked APIs.
Only synthetic fixtures are submitted, and every GitHub request is intercepted.
"""
import base64,hashlib,json,re,urllib.parse
from playwright.sync_api import expect

def check_upload_metadata_ui(page,out,prefix):
    original=page.evaluate('JSON.stringify(SoilTaskUnitLists)')
    errors=[]
    def on_error(e): errors.append(str(e))
    page.on('pageerror',on_error)
    manifests=[];writes=[];file_sizes=[];committed=[]
    def api(route):
        request=route.request;url=urllib.parse.urlsplit(request.url);path=url.path
        data=request.post_data_json if request.method not in ('GET','HEAD') else {}
        if request.method not in ('GET','HEAD'):writes.append(path)
        if path.endswith('/git/blobs'):
            content=data.get('content','');raw=base64.b64decode(content) if data.get('encoding')=='base64' else content.encode()
            try:
                value=json.loads(raw)
                if isinstance(value,dict) and value.get('schemaVersion')==3 and 'files' in value:manifests.append(value)
            except (ValueError,UnicodeError):file_sizes.append(len(raw))
            route.fulfill(status=201,json={'sha':hashlib.sha256(raw).hexdigest()});return
        if path.endswith('/git/trees') and request.method=='POST':route.fulfill(status=201,json={'sha':'fixture-tree'});return
        if path.endswith('/git/commits') and request.method=='POST':route.fulfill(status=201,json={'sha':'fixture-commit'});return
        if path.endswith('/git/refs') and request.method=='POST':
            assert data['ref'].startswith('refs/heads/soil-upload-')
            committed.append(data['ref']);route.fulfill(status=201,json={'ref':data['ref'],'object':{'sha':'fixture-commit'}});return
        if '/git/ref/heads/' in path:route.fulfill(json={'object':{'sha':'fixture-base'}});return
        if '/git/commits/' in path:route.fulfill(json={'tree':{'sha':'fixture-base-tree'}});return
        if path.endswith('/commits'):
            route.fulfill(json=[{'sha':'fixture-archived','commit':{'message':'import '+(manifests[-1]['uploadId'] if manifests else 'none')}}]);return
        if '/contents/' in path:route.fulfill(status=404,json={'message':'Fixture-only missing file'});return
        route.fulfill(json={'tree':[],'login':'fixture-reader'})
    pattern='https://api.github.com/**'
    page.route(pattern,api)
    def open_tab(key):
        page.evaluate('(key)=>openSoilAdminImport({kind:"quality",dataKey:key})',key)
    def pick(names,size=64):
        page.locator('#adm-files').set_input_files([{'name':n,'mimeType':'application/pdf','buffer':b'%PDF-1.4 fixture\n'+b'0'*(size-len(b'%PDF-1.4 fixture\n'))} for n in names])
        page.wait_for_timeout(200)
    def states():
        return page.evaluate('SoilAdminImport.state.files.map(i=>({name:i.file.name,key:i.manualDataKey,keys:i.autoMeta.dataKeys,complete:i.autoMeta.assignment&&i.autoMeta.assignment.complete,report:i.autoMeta.reportOpinion,city:i.city,unit:i.unit,district:i.district,batch:i.batch}))')
    def click_upload():
        page.locator('#adm-pass').fill(page.evaluate('SoilAdminImport.PASS'))
        page.once('dialog',lambda d:d.accept())
        page.locator('#adm-ok').click()
        expect(page.locator('#soilAdminImport')).not_to_have_class(re.compile(r'\bshow\b'),timeout=40000)
    try:
        # Unknown filename + all manual geographical fields filled: show the
        # missing type beside this very file, then retain all other fields.
        open_tab('soilAttr');pick(['附件01.pdf'])
        row=page.locator('#adm-list .v2-row').first
        expect(row.locator('.rt')).to_be_visible()
        for cls,value in [('rc','沧州市'),('ru','河北玛恩农业科技有限公司'),('rd','黄骅市')]:row.locator('.'+cls).select_option(value)
        expect(row.locator('em')).to_contain_text('尚未填写：成果类型。')
        before=len(writes)
        page.locator('#adm-pass').fill(page.evaluate('SoilAdminImport.PASS'))
        page.locator('#adm-ok').click()
        expect(page.locator('#adm-text')).to_contain_text('尚未填写：成果类型。')
        expect(row.locator('.rt')).to_be_visible() # preparation must not replace it with plain text
        assert len(writes)==before,'Invalid metadata attempted a file write'
        row.locator('.rt').select_option('soilAttr')
        assert states()[0]['complete'] and states()[0]['unit']=='河北玛恩农业科技有限公司'
        page.locator('#soilAdminImport .adm-close').click()
        # A deliberate bulk type selected BEFORE a file is picked must persist.
        open_tab('soilType')
        page.locator('[data-auto-import-toggle]').click() if page.locator('[data-auto-import-toggle]').count() else None
        page.locator('#adm-data-key').evaluate('(n)=>{n.value="soilAttr";n.dispatchEvent(new Event("change",{bubbles:true}));}')
        pick(['黄骅市_附件02.pdf'])
        assert states()[0]['key']=='soilAttr' and states()[0]['complete']
        page.locator('#soilAdminImport .adm-close').click()
        # Screenshot 1: combined report title lacking a quality-opinion marker.
        districts=['元氏县','平山县','灵寿县','行唐县','井陉县','赞皇县','新乐市','正定县','藁城区','无极县','深泽县','晋州市','栾城区','赵县','高邑县','邯山区']
        names=[d+'_总体、工作、数据报告_2026年第二次第1批.pdf' for d in districts]
        names[0]='元氏县_总体、工作、数据报告-河北湛泸软件开发有限公司_2026年第二次第1批.pdf'
        open_tab('reports');pick(names)
        assert len(states())==16 and all(s['keys']==['reports'] and not s['complete'] for s in states())
        expect(page.locator('.confirm-report-opinions')).to_contain_text('16')
        page.once('dialog',lambda d:d.dismiss());page.locator('.confirm-report-opinions').click()
        assert all(not s['complete'] for s in states()),'Cancel must not confirm any report'
        page.once('dialog',lambda d:d.accept());page.locator('.confirm-report-opinions').click()
        assert all(s['complete'] and s['report']['confirmed'] for s in states())
        page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-report-upload-confirmed.png')))
        # Revocation is effective; a revised selection must not reuse approval.
        page.locator('.confirm-report-opinion').first.click()
        assert not states()[0]['complete']
        page.once('dialog',lambda d:d.accept());page.locator('.confirm-report-opinion').first.click()
        click_upload()
        assert len(committed)==1 and len(manifests[-1]['files'])==16
        assert all(f['quality']['dataKeys']==['reports'] and f['quality']['opinionConfirmation']['kind']=='quality-opinion' for f in manifests[-1]['files'])
        assert all(f['quality']['complete'] for f in manifests[-1]['files'])
        # Renamed opinion files are immediately valid and don't inherit guards.
        open_tab('reports');pick([names[0].replace('数据报告-','数据报告质控意见-')])
        assert states()[0]['complete'] and not states()[0]['report']['required']
        pick([names[0]])
        assert not states()[0]['complete'] and not states()[0]['report']['confirmed']
        page.locator('#soilAdminImport .adm-close').click()
        # Screenshot 2: the file says PROPERTY mapping, not TYPE mapping.
        name='黄骅市_土壤属性制图_河北玛恩农业科技有限公司_2026年第三次第1批.pdf'
        open_tab('soilType');pick([name],32*1024*1024)
        state=states()[0]
        assert state['keys']==['soilAttr'] and state['complete'] and state['batch']=='2026年第三次第1批'
        assert state['unit']=='河北玛恩农业科技有限公司'
        page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-attribute-upload-ready.png')))
        click_upload()
        assert len(committed)==2
        f=manifests[-1]['files'][0]
        assert f['size']==32*1024*1024 and f['storage']=='whole',f['size']
        assert f['quality']['dataKeys']==['soilAttr'] and f['quality']['batch']=='2026年第三次第1批'
        assert f['quality']['associationsByDataKey']['soilAttr'][0]['unit']=='河北玛恩农业科技有限公司'
        assert 32*1024*1024 in file_sizes
        assert page.evaluate('JSON.stringify(SoilTaskUnitLists)')==original
        assert not errors,errors
        (out/(prefix+'-upload-metadata-staged-manifests.json')).write_text(json.dumps(manifests,ensure_ascii=False,indent=2))
        return {'status':'passed','mode':'mock GitHub APIs; no production writes','submissions':2,'reportBatch':16,'attributeBytes':32*1024*1024,'checks':['visible required type','precise missing-field error','no incomplete writes','editable rows after preparation','type selected before files','report acknowledgement cancel/confirm/revoke','renaming/reselection resets guard','16-file batch manifest','32 MiB actual upload event chain','third round and correct property roster','directory unchanged']}
    except Exception:
        diagnostic={'progress':page.locator('#adm-text').inner_text(),'states':states(),'errors':errors,'requests':writes,'stagedManifestCount':len(manifests),'committedBranches':committed,'fileSizes':file_sizes}
        (out/(prefix+'-upload-metadata-failure.json')).write_text(json.dumps(diagnostic,ensure_ascii=False,indent=2))
        page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-upload-metadata-failure.png')))
        raise
    finally:
        page.unroute(pattern,api)
        page.remove_listener('pageerror',on_error)
        # Only disposable state was touched; uploaded file index remains mocked.
        if page.locator('#soilAdminImport.show').count():page.locator('#soilAdminImport .adm-close').click()
        page.locator('[data-tab="soilType"]').click()
