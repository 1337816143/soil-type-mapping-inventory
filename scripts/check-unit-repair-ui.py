"""Real-page read checks and DOM-only fixtures, never production uploads."""
from playwright.sync_api import expect
import re

def check_unit_repair_ui(page,out,engine):
    page.locator('[data-tab="soilType"]').click()
    evidence=page.evaluate('''()=>{
      const rows=[];for(const c of tabData.soilType||[])for(const u of c.units||[])for(const d of u.districts||[]){
        if((c.name==='石家庄市'&&['平山县','新乐市','灵寿县','行唐县'].includes(d.label))||(c.name==='邢台市'&&['内丘县','任泽区'].includes(d.label)))rows.push({city:c.name,unit:u.name,district:d.label,docs:d.docs});
      }return rows;
    }''')
    assert len(evidence)==6,evidence
    for r in evidence:
        expected='中地科勘察设计有限公司' if r['city']=='石家庄市' else '天津华勘检验测试有限公司'
        assert r['unit']==expected,r
        assert r['docs'] and all(d.get('unitCorrection') for d in r['docs']),r
    v=page.evaluate('''()=>{const i={file:{name:'石家庄市_平山县_土壤类型图_中地科动察设计有限公司_质控意见_2026年第二次第1批.pdf',size:42}};const m=SoilAdminAutoClassifier.applyItemMetadata(i);return {unit:i.unit,source:m.association.unitSource,correction:m.association.unitCorrection};}''')
    assert v['unit']=='中地科勘察设计有限公司' and v['source']=='directory-evidence',v
    result=page.evaluate('''()=>{
      const prior=window.replyIndex;const batch='2026年第一次第1批';window.replyIndex={};
      window.replyIndex[getReplyKey('石家庄市','中地科动察设计有限公司','平山县',batch)]={file:'legacy-unit-reply.docx',time:'20260922000000'};
      const old=renderReplyCell('石家庄市','中地科勘察设计有限公司','平山县');
      const other=renderReplyCell('邢台市','天津华勘检验测试有限公司','内丘县');window.replyIndex=prior;return {old,other};
    }''')
    assert 'legacy-unit-reply.docx' in result['old'] and 'legacy-unit-reply.docx' not in result['other'],result
    page.evaluate('''()=>{window.__unitRepairOriginal=tabData.soilType;const copy=JSON.parse(JSON.stringify(tabData.soilType));const c=copy.find(x=>x.name==='石家庄市');const u=c.units.find(x=>x.name==='中地科勘察设计有限公司');const d=u.districts.find(x=>x.label==='平山县');d.docs[0].unitReviewRequired=true;d.docs[0].unitReviewMessage='表头存在另一单位，证据不足，保留原文。';tabData.soilType=copy;refreshAllTabs();}''')
    sample=page.locator('#tab-soilType a.directory-mismatch').filter(has_text='平山县').first
    expect(sample).to_be_visible();expect(sample).to_have_attribute('title',re.compile('与作业单位通讯录不一致'))
    page.evaluate('tabData.soilType=window.__unitRepairOriginal;delete window.__unitRepairOriginal;refreshAllTabs()')
    page.set_viewport_size({'width':1440,'height':1000});page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(out/(engine+'-unit-repair.png')))
    return {'status':'passed','checks':['six real corrected records','future filename evidence','historic reply alias','unverified header stays red'],'records':evidence}
