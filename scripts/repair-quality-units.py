"""Evidence-bounded repair of report submitter metadata and platform assignments.

Uses the browser's exact result-specific directory policy. Changes only an
identified submitter cell, never substantive review text or the task directory.
"""
from __future__ import annotations
import argparse, collections, copy, hashlib, io, json, re, subprocess, tempfile, zipfile
from pathlib import Path
from lxml import etree as ET
import pymupdf as fitz
ROOT=Path(__file__).resolve().parents[1]
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
LABELS={'提交单位','作业单位','承编单位','编制单位','承担单位','中标单位'}
GEO={'县市区','县市区名称','任务单元','地区','区县'}
def compact(x):
    import unicodedata
    return re.sub(r'[\s\u200b-\u200d\ufeff（）()、，：:]', '', unicodedata.normalize('NFKC',str(x or '')))
def digest(x):return hashlib.sha256(x).hexdigest()
def node(inputs=None):
    args=['node',str(ROOT/'scripts/unit-evidence-context.js')]
    if inputs is not None:args+=['--decide']
    p=subprocess.run(args,input=json.dumps(inputs,ensure_ascii=False) if inputs is not None else None,text=True,capture_output=True,check=True,cwd=ROOT)
    return json.loads(p.stdout)
def pdf_field(path):
    with fitz.open(path) as d:
        if d.needs_pass or d.get_sigflags()>0:return {'error':'加密或带数字签名；不自动修改'}
        if not d.page_count:return {'error':'空 PDF'}
        page=d[0];found=[]
        for table in page.find_tables().tables:
            if table.bbox[1]>page.rect.height*.35:continue
            for row in table.rows:
                cells=row.cells
                values=[page.get_textbox(fitz.Rect(c)+(1,1,-1,-1)) if c else '' for c in cells]
                for i,val in enumerate(values[:-1]):
                    if compact(val) not in LABELS or not cells[i+1]:continue
                    geo=''
                    for j,g in enumerate(values[:-1]):
                        if compact(g) in GEO:geo=values[j+1]
                    rect=fitz.Rect(cells[i+1]);inner=rect+(2,2,-2,-2)
                    spans=[s for b in page.get_text('dict',clip=inner)['blocks'] for l in b.get('lines',[]) for s in l['spans']]
                    found.append({'format':'pdf','rect':list(rect),'value':values[i+1].strip(),'geo':geo,'label':val,'spans':spans,'headerText':page.get_text()[:1500]})
        if len(found)>1:return {'error':'存在多个提交单位字段，不能确定应修改哪一个'}
        return found[0] if found else {'format':'pdf','absent':True,'headerText':page.get_text()[:1500]}
def docx_field(path):
    with zipfile.ZipFile(path) as z:
        if any(n.startswith('_xmlsignatures/') for n in z.namelist()):return {'error':'带数字签名；不自动修改'}
        root=ET.fromstring(z.read('word/document.xml'));body=root.find('w:body',NS);found=[];preceding=0
        for child in body:
            if preceding>1000:break
            if child.tag.endswith('}tbl'):
                for row in child.findall('w:tr',NS):
                    cells=row.findall('w:tc',NS);vals=[''.join(c.xpath('.//w:t/text()',namespaces=NS)) for c in cells]
                    for i,val in enumerate(vals[:-1]):
                        if compact(val) not in LABELS:continue
                        geo=next((vals[j+1] for j,g in enumerate(vals[:-1]) if compact(g) in GEO),'')
                        if cells[i+1].xpath('.//w:del|.//w:ins',namespaces=NS):return {'error':'单位字段有修订记录，需人工审核'}
                        found.append({'format':'docx','value':vals[i+1],'geo':geo,'label':val,'cellPath':root.getroottree().getpath(cells[i+1]),'headerText':''.join(root.xpath('//w:t/text()',namespaces=NS))[:1500]})
            preceding+=len(''.join(child.xpath('.//w:t/text()',namespaces=NS)))
        if len(found)>1:return {'error':'存在多个提交单位字段'}
        return found[0] if found else {'format':'docx','absent':True,'headerText':''.join(root.xpath('//w:t/text()',namespaces=NS))[:1500]}
def field(path):
    try:
        if path.suffix.lower()=='.pdf':return pdf_field(path)
        if path.suffix.lower()=='.docx':return docx_field(path)
        return {'error':'非可安全编辑的 PDF/DOCX 原格式'}
    except Exception as e:return {'error':type(e).__name__+': '+str(e)[:150]}
def text_cell_xml(root,xpath,new):
    cell=root.xpath(xpath,namespaces=root.nsmap)[0];texts=cell.xpath('.//w:t',namespaces=NS)
    if not texts:
        p=cell.find('w:p',NS)
        if p is None:p=ET.SubElement(cell,'{'+NS['w']+'}p')
        r=ET.SubElement(p,'{'+NS['w']+'}r');texts=[ET.SubElement(r,'{'+NS['w']+'}t')]
    start=0
    for i,t in enumerate(texts):
        n=len(t.text or '') if i<len(texts)-1 else len(new)-start
        t.text=new[start:start+n];start+=n;t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
def write_docx(path,info,target):
    before=path.read_bytes();original=zipfile.ZipFile(io.BytesIO(before));root=ET.fromstring(original.read('word/document.xml'))
    text_cell_xml(root,info['cellPath'],target)
    updated=ET.tostring(root,encoding='UTF-8',xml_declaration=True,standalone=True);output=io.BytesIO()
    with zipfile.ZipFile(output,'w') as z:
        for entry in original.infolist():z.writestr(copy.copy(entry),updated if entry.filename=='word/document.xml' else original.read(entry.filename))
    after=output.getvalue();check=zipfile.ZipFile(io.BytesIO(after))
    assert all(original.read(n)==check.read(n) for n in original.namelist() if n!='word/document.xml')
    with tempfile.NamedTemporaryFile(suffix='.docx',delete=False) as f:f.write(after);tmp=Path(f.name)
    try:assert compact(docx_field(tmp)['value'])==compact(target)
    finally:tmp.unlink()
    path.write_bytes(after)
    return {'beforeSHA256':digest(before),'afterSHA256':digest(after),'verification':'only submitter text in document.xml; all other ZIP entries unchanged'}
def write_pdf(path,info,target,qa=None):
    before=path.read_bytes();d=fitz.open(stream=before,filetype='pdf');page=d[0];rect=fitz.Rect(info['rect'])
    inner=rect+(3,2,-3,-2);spans=info.get('spans') or [];size=spans[0]['size'] if spans else 10.45
    font=fitz.Font('cjk');color=fitz.sRGB_to_pdf(spans[0].get('color',0)) if spans else (0,0,0)
    size=min(size,(inner.width-6)/max(1,len(target)))
    if size<8.5:raise ValueError('公司全称无法在原单元格以可读字号容纳，不自动压缩版式')
    if info['value']:
        for s in spans:
            b=fitz.Rect(s['bbox']);b&=inner
            if not b.is_empty:page.add_redact_annot(b,fill=False,cross_out=False)
        page.apply_redactions(images=0,graphics=0,text=0)
    x=spans[0]['origin'][0] if spans else rect.x0+6
    baseline=spans[0]['origin'][1] if spans else rect.y0+(rect.height+size*.65)/2
    if x+font.text_length(target,fontsize=size)>inner.x1:x=inner.x0+1
    page.insert_font(fontname='UnitEvidence',fontbuffer=font.buffer)
    page.insert_text((x,baseline),target,fontname='UnitEvidence',fontsize=size,color=color)
    after=d.tobytes(garbage=0,deflate=True)
    if len(after)>=99*1024*1024:raise ValueError('订正后文件超过安全大小限制')
    out=fitz.open(stream=after,filetype='pdf');old=fitz.open(stream=before,filetype='pdf')
    assert len(out)==len(old) and [list(p.rect) for p in out]==[list(p.rect) for p in old]
    assert compact(out[0].get_textbox(inner))==compact(target),'Inserted company failed text verification'
    import numpy as np
    for i in range(len(old)):
        if i:assert [old.xref_stream(n) for n in old[i].get_contents()]==[out.xref_stream(n) for n in out[i].get_contents()],'Another page content changed'
        a=old[i].get_pixmap(matrix=fitz.Matrix(1,1),alpha=False);b=out[i].get_pixmap(matrix=fitz.Matrix(1,1),alpha=False)
        assert (a.width,a.height)==(b.width,b.height)
        arr=np.frombuffer(a.samples,dtype=np.uint8).reshape(a.height,a.width,a.n);brr=np.frombuffer(b.samples,dtype=np.uint8).reshape(b.height,b.width,b.n)
        diff=np.any(arr!=brr,axis=2)
        if i==0:diff[max(0,int(rect.y0)-2):int(rect.y1)+3,max(0,int(rect.x0)-2):int(rect.x1)+3]=False
        assert not diff.any(),'Visible changes outside submitter cell'
    name=digest(str(path).encode())[:12]
    if qa:
        qa.mkdir(parents=True,exist_ok=True)
        old[0].get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(qa/(name+'-before.png'))
        out[0].get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(qa/(name+'-after.png'))
    path.write_bytes(after)
    return {'beforeSHA256':digest(before),'afterSHA256':digest(after),'pages':len(out),'rect':list(rect),'verification':'all pages pixel-checked; no changes outside submitter cell','qaPrefix':name}
def qualified_geo(info,rows):
    geo=compact(info.get('geo',''))
    return bool(geo) and all(compact(r['district']) in geo or re.sub(r'[县市区]$','',compact(r['district'])) in geo for r in rows)
def process(records,qa=None):
    audits=[];groups=collections.defaultdict(list)
    for r in records:groups[r['path']].append(r)
    fields={};requests=[];refs=[]
    for rel,rows in groups.items():
        path=(ROOT/rel).resolve()
        if not path.is_relative_to(ROOT.resolve()) or not rel.startswith('data/') or not path.is_file():fields[rel]={'error':'文件路径不存在或不在质控数据目录'};continue
        if any(r.get('origin')=='shared-authority' for r in rows):fields[rel]={'protected':True};continue
        info=fields[rel]=field(path)
        for r in rows:
            requests.append(r);refs.append((r,'platform'))
            if 'value' in info:requests.append(dict(r,unit=compact(info['value'])));refs.append((r,'header'))
    decisions={}
    for (r,kind),answer in zip(refs,node(requests)):decisions[(id(r),kind)]=answer
    for rel,rows in groups.items():
        info=fields[rel];audit={'path':rel,'associations':[],'header':{k:info[k] for k in ['value','label','geo','error','absent','protected'] if k in info},'documentChanged':False}
        if info.get('protected'):audit['status']='protected-authoritative-shared';audits.append(audit);continue
        changes=[];desired_headers=[]
        for r in rows:
            if (id(r),'platform') not in decisions:continue
            answer=decisions[(id(r),'platform')];e=answer['evidence'];expected=answer['directory']['listedUnits']
            r.pop('unitReviewRequired',None);r.pop('unitReviewMessage',None)
            old=r.get('unit','');new=old if r.get('unitSource')=='manual' else e['unit'];reason=e['reason'];h=decisions.get((id(r),'header'));review=''
            if h and qualified_geo(info,[r]) and len(expected)==1:
                hv=compact(info['value']);he=h['evidence']
                if r.get('unitSource')!='manual' and hv==compact(expected[0]) and old!=expected[0]:
                    new=expected[0];reason='报告表头提交单位与该成果、该地区的原通讯录全称一致；平台旧归属录入错误。'
                if he['action'] in {'typo','fill'} and compact(new)==compact(expected[0]):desired_headers.append(expected[0])
                elif hv and h['directory']['mismatch'] and he['action']=='keep':
                    is_short=compact(expected[0]).startswith(hv) and len(hv)>=4
                    if not is_short:
                        review='报告表头单位“'+info['value']+'”与通讯录不一致，证据不足，不自动改写。'
                        new=old;reason='报告与通讯录有实质冲突，保留现有归属与红色提示。'
            if new!=old:
                changes.append((r,new,reason));audit['associations'].append({'dataKey':r['dataKey'],'city':r.get('city',''),'district':r.get('district',''),'oldUnit':old,'newUnit':new,'reason':reason,'action':e['action'] if e['action']!='keep' else 'header-and-directory-agree'})
            elif answer['directory']['mismatch']:
                audit['associations'].append({'dataKey':r['dataKey'],'city':r.get('city',''),'district':r.get('district',''),'oldUnit':old,'newUnit':old,'reason':answer['directory']['message']+' 未达到自动订正证据门槛，保留红色。','action':'retained-red'})
            if review:r['unitReviewRequired']=True;r['unitReviewMessage']=review
        if desired_headers and len(set(desired_headers))==1 and qualified_geo(info,rows):
            target=desired_headers[0];planned={next((n for rr,n,_ in changes if rr is r),r.get('unit','')) for r in rows}
            if len(planned)==1 and compact(next(iter(planned)))==compact(target):
                try:
                    result=write_pdf(ROOT/rel,info,target,qa) if info['format']=='pdf' else write_docx(ROOT/rel,info,target)
                    audit.update(result);audit['documentChanged']=True;audit['headerNewUnit']=target
                except Exception as exc:
                    audit['documentError']=str(exc)
                    for r in rows:r['unitReviewRequired']=True;r['unitReviewMessage']='单位依据已核实，但报告表头未能安全自动编辑：'+str(exc)
        for r,new,reason in changes:
            previous=r.get('unitCorrection') or {}
            r['unitCorrection']={'originalUnit':previous.get('originalUnit',r.get('unit','')),'unit':new,'reason':reason}
            r['unit']=new;r['unitSource']='directory-evidence'
        audit['status']='repaired' if changes or audit['documentChanged'] else ('retained-red' if audit['associations'] else 'unchanged');audits.append(audit)
    return audits
def migrate_legacy(records):
    p=ROOT/'index.html';text=p.read_text();before_master=re.search(r'var masterList = \[[\s\S]*?\n\];',text).group()
    by_path={(r['dataKey'],r['path']):r for r in records if r.get('origin')=='legacy'}
    for key,var in {'soilType':'soilTypeData','soilAttr':'soilAttrData','farmland':'farmlandData'}.items():
        m=re.search(r'var '+var+r' = (\[[\s\S]*?\n\]);',text);data=json.loads(m[1])
        for city in data:
            units=[];mapped={}
            for u in city['units']:
                for d in u['districts']:
                    grouped={}
                    for doc in d.get('docs',[]):
                        record=by_path.get((key,'data/'+doc['file']),{});name=record.get('unit',u['name']);copy_doc=copy.deepcopy(doc)
                        for f in ['unitCorrection','unitReviewRequired','unitReviewMessage']:
                            if f in record:copy_doc[f]=record[f]
                        grouped.setdefault(name,[]).append(copy_doc)
                    for name,docs in grouped.items():
                        if name not in mapped:mapped[name]=dict(u,name=name,districts=[]);units.append(mapped[name])
                        old=next((x for x in mapped[name]['districts'] if x['label']==d['label']),None)
                        if old:old['docs']+=docs
                        else:mapped[name]['districts'].append(dict(d,docs=docs))
                    if not d.get('docs'):
                        name=u['name']
                        if name not in mapped:mapped[name]=dict(u,districts=[]);units.append(mapped[name])
                        mapped[name]['districts'].append(d)
            city['units']=units
        new=json.dumps(data,ensure_ascii=False,indent=2);text=text[:m.start(1)]+new+text[m.end(1):]
    assert re.search(r'var masterList = \[[\s\S]*?\n\];',text).group()==before_master
    p.write_text(text)
def run(mode,upload_id='',qa=None):
    snapshot=node();records=snapshot['records']
    if mode=='incoming':records=[r for r in records if r.get('origin')=='index' and r.get('uploadId')==upload_id]
    audits=process(records,qa)
    if mode=='migrate':migrate_legacy(records)
    index_path=ROOT/'data/admin-import-index.json';index=json.loads(index_path.read_text())
    for r in records:
        if r.get('origin')!='index':continue
        target=next((x for x in index if x.get('path')==r['path'] and x.get('dataKey')==r.get('dataKey') and x.get('district')==r.get('district')),None)
        if target is not None:
            for f in ['unit','unitSource','unitCorrection','unitReviewRequired','unitReviewMessage']:
                if f in r:target[f]=r[f]
                elif f in ['unitReviewRequired','unitReviewMessage']:target.pop(f,None)
            status=node([r])[0]['directory'];target['directoryStatus']=status['code'];target['directoryMessage']=status['message']
    new_index=json.dumps(index,ensure_ascii=False,indent=2)+'\n'
    if index_path.read_text()!=new_index:index_path.write_text(new_index)
    audit_path=ROOT/('docs/unit-repair-v1.2.7.json' if mode=='migrate' else 'data/unit-correction-history/'+upload_id+'.json')
    report={'policy':'v1.2.7','directoryHashes':snapshot['hashes'],'scope':mode,'originals':'Historical originals remain in parent commit; new originals remain on source staging branch. Paths are stable.','recordsChecked':len(records),'documentsChecked':len(audits),'documentsChanged':sum(a['documentChanged'] for a in audits),'platformCorrections':sum(sum(x['oldUnit']!=x['newUnit'] for x in a['associations']) for a in audits),'reports':audits}
    audit_path.parent.mkdir(parents=True,exist_ok=True);audit_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    assert node()['hashes']==snapshot['hashes'],'Task directory changed'
    print(json.dumps({k:v for k,v in report.items() if k!='reports'},ensure_ascii=False));return report
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--mode',choices=['migrate','incoming'],required=True);ap.add_argument('--upload-id',default='');ap.add_argument('--qa-dir',type=Path);args=ap.parse_args()
    if args.mode=='incoming' and not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',args.upload_id):ap.error('Invalid upload id')
    run(args.mode,args.upload_id,args.qa_dir)
