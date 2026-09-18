(function () {
  'use strict';
  if(window.SoilBatchManager)return;
  var policy=window.SoilBatchPolicy;
  function labelText(text){
    return String(text||'').replace(/(?:20\d{2}年第[一二三四五六七八九十\d]+次(?:质控)?第[一二三四五六七八九十\d]+批(?:补充)?|第[一二三四五六七八九十\d]+批(?:补充)?|第一轮)/g,function(s){return policy.format(s);});
  }
  function html(text){return String(text||'').replace(/>([^<>]*)(?=<)/g,function(all,t){return '>'+labelText(t);});}
  function mount(){
    var q=window.SoilAdminImport,modal=document.getElementById('soilAdminImport');
    if(!q||!modal||document.getElementById('qc-round-controls'))return;
    var controls=document.createElement('div');controls.id='qc-round-controls';controls.className='qc-round-controls';
    controls.innerHTML='<label>年份<input id="qc-year" type="number" min="2000" max="2100" value="2026"></label><label>第几次质控<input id="qc-round" type="number" min="1" max="99" value="1"></label><label>第几批反馈<input id="qc-feedback" type="number" min="1" max="999" value="1"></label><label>补充批次<input id="qc-supplement" type="checkbox"></label><button type="button" class="wr-button primary" id="qc-apply-round">应用到本次上传</button><small id="qc-round-status">历史反馈统一属于2026年第一次质控；后续第二次质控请选择轮次2。原文件路径保持不变。</small>';
    modal.querySelector('.adm-head').insertAdjacentElement('afterend',controls);
    controls.querySelector('#qc-apply-round').onclick=function(){
      var message=controls.querySelector('#qc-round-status');
      try{
        var selected=policy.validate({year:+controls.querySelector('#qc-year').value,round:+controls.querySelector('#qc-round').value,
          batch:+controls.querySelector('#qc-feedback').value,supplement:controls.querySelector('#qc-supplement').checked});
        q.state.batchSelection=selected;
        (q.state.files||[]).forEach(function(item){item.manualBatch=policy.format(selected);item.batch=item.manualBatch;if(item.autoMeta)policy.applyToItem(item,item.autoMeta,selected);});
        var select=document.getElementById('adm-batch'),value=policy.format(selected);
        if(select){if(!Array.from(select.options).some(function(o){return o.value===value;})){var opt=document.createElement('option');opt.value=opt.textContent=value;select.append(opt);}select.value=value;}
        if(typeof q.renderPreview==='function')q.renderPreview();
        if(window.SoilAdminAutoClassifier)window.SoilAdminAutoClassifier.refresh();
        message.textContent='本次上传已指定：'+value+'。之后加入的文件也使用这一轮次；单文件仍可人工调整。';
      }catch(e){message.textContent=e.message;}
    };
  }
  function reset(){var controls=document.getElementById('qc-round-controls');if(controls)controls.remove();mount();}
  function install(){
    var original=window.renderCities;
    if(typeof original==='function'&&!original.__qcYearRoundLabels){
      var wrapped=function(){return html(original.apply(this,arguments));};Object.assign(wrapped,original);wrapped.__qcYearRoundLabels=true;window.renderCities=wrapped;
    }
    var controls=document.createElement('div');controls.className='glass-controls';var toggle=document.createElement('button');toggle.type='button';
    var low=false;try{low=localStorage.getItem('soilGlassLite')==='1';}catch(e){}
    function show(){document.documentElement.classList.toggle('glass-lite',low);toggle.textContent=low?'恢复玻璃效果':'轻量显示';toggle.setAttribute('aria-pressed',String(low));}
    toggle.onclick=function(){low=!low;show();try{localStorage.setItem('soilGlassLite',low?'1':'0');}catch(e){}};show();controls.append(toggle);
    var heading=document.querySelector('header .container');if(heading&&!heading.querySelector('.glass-controls'))heading.append(controls);
    mount();if(typeof window.refreshAllTabs==='function')window.refreshAllTabs();
  }
  window.SoilBatchManager={mount:mount,reset:reset,labelText:labelText,decorateHtml:html};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
