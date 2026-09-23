"""Report-family UI and file access in a disposable browser; no production writes."""
import io, re, zipfile
from playwright.sync_api import expect

def pdf_fixture():
    stream=b'BT /F1 12 Tf 30 250 Td (Report tab PDF preview fixture) Tj ET'
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    data=b'%PDF-1.4\n';offsets=[0]
    for i,obj in enumerate(objects,1):
        offsets.append(len(data));data+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    xref=len(data);data+=b'xref\n0 6\n0000000000 65535 f \n'
    for offset in offsets[1:]:data+=f'{offset:010d} 00000 n \n'.encode()
    return data+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF\n'

def docx_fixture():
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Report tab Word preview fixture</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>')
    return buf.getvalue()

def check_report_tab_ui(page,out,prefix):
    before=page.evaluate('JSON.stringify(SoilTaskUnitLists)')
    original=page.evaluate("JSON.stringify(Object.fromEntries(Object.entries(tabData).filter(([k])=>k!=='reports')))")
    page.locator('[data-tab="reports"]').click()
    page.locator('#missingBanner .quality-admin-global').first.click()
    expect(page.locator('#adm-data-key')).to_have_value('reports')
    kinds=['总体报告','工作报告','数据报告']
    filenames=['石家庄市_平山县_'+kind+'_质控意见_2026年第二次第1批'+('.pdf' if i==1 else '.docx') for i,kind in enumerate(kinds)]
    buffers=[docx_fixture(),pdf_fixture(),docx_fixture()]
    page.locator('#adm-files').set_input_files([{'name':n,'mimeType':'application/pdf' if i==1 else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document','buffer':buffers[i]} for i,n in enumerate(filenames)])
    expect(page.locator('#adm-list .v2-row')).to_have_count(3)
    for i in range(3):
        row=page.locator('#adm-list .v2-row').nth(i)
        expect(row.locator('.ru')).to_have_value('河北湛泸软件开发有限公司')
        expect(row.locator('.rd')).to_have_value('平山县')
        expect(row.locator('.rb')).to_have_value('2026年第二次第1批')
        expect(row.locator('.v2-file em')).to_contain_text('总体、工作、数据报告')
    states=page.evaluate('SoilAdminImport.state.files.map(i=>({keys:i.autoMeta.dataKeys,complete:i.autoMeta.assignment.complete}))')
    assert all(x['keys']==['reports'] and x['complete'] for x in states),states
    page.locator('#adm-pass').fill('incorrect-test-password');page.locator('#adm-ok').click()
    expect(page.locator('#soilAdminImport')).to_contain_text('管理员密码错误')
    page.locator('#soilAdminImport .adm-card').screenshot(path=str(out/(prefix+'-report-upload-preview.png')))
    page.locator('#soilAdminImport .adm-close').click()
    entries=[{'kind':'quality-control','dataKey':'reports','city':'石家庄市','unit':'河北湛泸软件开发有限公司','district':'平山县','batch':'2026年第二次第1批','complete':True,'path':'data/质控意见反馈_管理员导入/report-family-fixture-'+str(i)+'_'+n} for i,n in enumerate(filenames)]
    def content(route):
        idx=int(re.search(r'report-family-fixture-(\d)',route.request.url)[1]);route.fulfill(body=buffers[idx],content_type='application/pdf' if idx==1 else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    page.route('**/*report-family-fixture-*',content)
    page.evaluate('(es)=>applyAdminQualityIndex(es)',entries)
    page.locator('[data-tab="reports"]').click()
    expect(page.locator('#tab-reports .report-family-empty')).to_have_count(0)
    group=page.locator('#tab-reports .district-group').filter(has_text='平山县');group.locator('.group-label').click()
    for i,kind in enumerate(kinds):
        link=page.locator('#tab-reports a[href*="report-family-fixture-'+str(i)+'"]')
        expect(link).to_contain_text(kind);expect(link).not_to_have_class(re.compile('directory-mismatch'))
        expect(link).to_have_attribute('title',re.compile(kind))
    expect(page.locator('#tab-reports .upload-btn[data-data-key="reports"]')).to_have_count(1)
    for idx in [1,0]:
        group.locator('.group-label').click()  # Reopen after the previous modal closed the menu.
        page.locator('#tab-reports a[href*="report-family-fixture-'+str(idx)+'"]').click()
        modal=page.locator('#soil-file-preview-modal');expect(modal).to_be_visible()
        expect(modal.locator('canvas') if idx==1 else modal.locator('.docx').first).to_be_visible(timeout=45000)
        modal.locator('[data-preview-zoom-in]').click();expect(modal.locator('.soil-preview-zoom-label')).not_to_have_text('100%')
        modal.locator('[data-preview-fit]').click()
        page.set_viewport_size({'width':390,'height':844})
        expect(modal.locator('.soil-modal-close')).to_be_in_viewport();expect(modal.locator('.soil-preview-download')).to_be_in_viewport()
        page.set_viewport_size({'width':1440,'height':1000});modal.locator('.soil-modal-close').click()
    page.locator('#missingBanner .soil-batch-download-trigger').click();modal=page.locator('#soil-batch-download-modal')
    expect(modal.locator('input[data-filter="resultType"][value="总体、工作、数据报告"]')).to_be_checked()
    expect(modal.locator('[data-batch-path]')).to_have_count(3)
    modal.locator('#soil-batch-search').fill('数据报告');expect(modal.locator('[data-batch-path]')).to_have_count(1)
    modal.locator('#soil-batch-search').fill('');expect(modal.locator('[data-batch-path]')).to_have_count(3)
    modal.locator('#soil-batch-select-all').click()
    with page.expect_download(timeout=45000) as downloaded:modal.locator('#soil-batch-download').click()
    with zipfile.ZipFile(downloaded.value.path()) as z:
        saved=[n for n in z.namelist() if not n.endswith('/')]
        assert len(saved)==3,saved
        assert sorted(len(z.read(n)) for n in saved)==sorted(len(x) for x in buffers)
    modal.locator('.soil-modal-close').click();page.evaluate('refreshAllTabs()')
    expect(page.locator('#tab-reports a[href*="report-family-fixture-"]')).to_have_count(3)
    page.locator('#tab-reports .district-group .group-label').click()
    page.locator('#tab-reports').screenshot(path=str(out/(prefix+'-report-fixtures-display.png')))
    page.locator('#missingBanner .admin-delete-trigger').click()
    expect(page.locator('#soilAdminDelete')).to_have_class(re.compile('show'));expect(page.locator('#delete-pass')).to_be_visible()
    page.locator('#soilAdminDelete .delete-close').click()
    page.evaluate('(paths)=>removeAdminQualityPaths(paths)',[x['path'] for x in entries]);page.unroute('**/*report-family-fixture-*',content)
    assert page.evaluate('JSON.stringify(SoilTaskUnitLists)')==before
    assert page.evaluate("JSON.stringify(Object.fromEntries(Object.entries(tabData).filter(([k])=>k!=='reports')))")==original
    expect(page.locator('#tab-reports .report-family-empty')).to_be_visible();page.locator('[data-tab="soilType"]').click()
    return {'status':'passed','checks':['three report names and other-list upload defaults','wrong admin password rejected','per-file labels within same batch','PDF.js and Word previews with zoom and mobile controls','public filtered ZIP download with three separate original files','persisted index replay and removal','report-scoped reply and delete entry','original tabs and rosters unchanged']}
