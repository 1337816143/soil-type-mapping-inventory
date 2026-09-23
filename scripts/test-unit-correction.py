"""Disposable local fixtures only; never uploads documents."""
import importlib.util,json,shutil,zipfile
from pathlib import Path
import pymupdf as fitz
from docx import Document
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('repair',ROOT/'scripts/repair-quality-units.py');M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
TEMP=ROOT/'data'/'_unit_correction_fixture';TEMP.mkdir(exist_ok=True)
OUT=ROOT/'test-artifacts';OUT.mkdir(exist_ok=True)
checks=[];old='中地科动察设计有限公司';new='中地科勘察设计有限公司'
def record(p,unit=old,key='soilType',city='石家庄市',district='平山县'):
 return dict(path=str(p.relative_to(ROOT)),dataKey=key,city=city,district=district,unit=unit,origin='legacy',batch='第一批')
def pdf(name,unit,geo='130131 平山县'):
 p=TEMP/name;d=fitz.open();page=d.new_page(width=595,height=842)
 for x in [40,140,280,358,554]:page.draw_line((x,80),(x,118),color=(.7,.7,.7))
 for y in [80,118]:page.draw_line((40,y),(554,y),color=(.7,.7,.7))
 font=fitz.Font('cjk');page.insert_font(fontname='fixture',fontbuffer=font.buffer)
 for x,t in [(46,'县（市、区）'),(146,geo),(286,'提交单位'),(364,unit)]:
  if t:page.insert_text((x,103),t,fontname='fixture',fontsize=10.45)
 page.insert_text((46,160),'数据不全；正文及审核结论保持原样。',fontname='fixture',fontsize=12)
 p2=d.new_page();p2.insert_text((40,70),'Unchanged second page and annotations.');p2.add_text_annot((45,100),'Keep annotation')
 d.save(p);return p
try:
 initial=M.node()['hashes']
 for value,expected in [(old,'typo'),('未标明公司','fill'),(new,'keep'),('河北湛泸软件开发有限公司','keep'),('中地科','keep'),('中地科学设计有限公司','keep')]:
  r=dict(dataKey='soilType',city='石家庄市',district='平山县',unit=value);e=M.node([r])[0]['evidence'];assert e['action']==expected,(value,e);checks.append('policy '+value)
 p=pdf('typo.pdf',old);r=record(p);a=M.process([r],OUT/'unit-pdf-qa')[0]
 assert a['documentChanged'] and r['unit']==new,a
 assert M.pdf_field(p)['value']==new
 assert '数据不全' in fitz.open(p)[0].get_text();checks.append('PDF typo: pixel and stream preservation')
 before=p.read_bytes();a=M.process([r])[0];assert not a['documentChanged'] and p.read_bytes()==before;checks.append('idempotent corrected PDF')
 p=pdf('missing.pdf','','130523 内丘县');r=record(p,'未标明公司',district='内丘县',city='邢台市');a=M.process([r])[0]
 assert r['unit']=='天津华勘检验测试有限公司' and a['documentChanged'],a;checks.append('blank field uses soilType directory')
 p=pdf('conflict.pdf','河北湛泸软件开发有限公司');r=record(p,'未标明公司');original=p.read_bytes();a=M.process([r])[0]
 assert not a['documentChanged'] and r['unit']=='未标明公司' and r['unitReviewRequired'] and original==p.read_bytes(),(r,a);checks.append('contrary source keeps unknown and red')
 p=pdf('wronggeo.pdf',old,'永年区');r=record(p);original=p.read_bytes();a=M.process([r])[0]
 assert not a['documentChanged'] and p.read_bytes()==original;checks.append('no report edit for different geography')
 p=TEMP/'table.docx';d=Document();t=d.add_table(rows=1,cols=4);t.style='Table Grid'
 for cell,value in zip(t.rows[0].cells,['县（市、区）','平山县','提交单位','']):cell.text=value
 para=t.cell(0,3).paragraphs[0];para.add_run(old[:4]).bold=True;para.add_run(old[4:])
 d.add_paragraph('正文：中地科动察设计有限公司。此处属于意见正文，保留。');d.save(p)
 styles=zipfile.ZipFile(p).read('word/styles.xml');r=record(p);a=M.process([r])[0]
 assert a['documentChanged'] and M.docx_field(p)['value']==new,a
 result=Document(p);assert old in result.paragraphs[0].text and zipfile.ZipFile(p).read('word/styles.xml')==styles;checks.append('DOCX header only; body and styles unchanged')
 p=pdf('outside.pdf','河北示例研究所','永年区');r=record(p,'河北示例研究所',key='specialty',city='邯郸市',district='永年区');a=M.process([r])[0]
 assert not a['documentChanged'] and r['unit']=='河北示例研究所';checks.append('outside directory retained')
 p=pdf('manual.pdf',old);r=record(p,'人工选择有限公司');r['unitSource']='manual';a=M.process([r])[0]
 assert not a['documentChanged'] and r['unit']=='人工选择有限公司';checks.append('manual choice preserved')
 assert initial==M.node()['hashes'];checks.append('directory hashes unchanged')
 (OUT/'unit-correction-report.json').write_text(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
 print('Unit correction tests passed:',len(checks))
finally:shutil.rmtree(TEMP,ignore_errors=True)
