(function () {
  'use strict';
  if(window.SoilQualityBatchControls)return;
  var B=window.SoilQualityBatches;
  function onOpen(){
    var modal=document.getElementById('soilAdminImport'),q=window.SoilAdminImport;
    if(!modal||!q)return;
    var old=modal.querySelector('.wr-round-controls');if(old)old.remove();
    var box=document.createElement('div');box.className='wr-round-controls';
    box.innerHTML='<label>质控年度<input id="qc-cycle-year" type="number" min="2020" max="2099" value="2026"></label><label>质控次数<select id="qc-cycle-round">'+Array.from({length:10},function(_,i){return '<option value="'+(i+1)+'">第 '+(i+1)+' 次质控</option>';}).join('')+'</select></label><label>反馈批次<input id="qc-cycle-batch" type="number" min="1" max="99" value="1"></label><label><span>补充反馈</span><input id="qc-cycle-supplement" type="checkbox" aria-label="本批为补充反馈"></label><button type="button" class="wr-btn" id="qc-cycle-apply">应用此批次到全部文件</button><div class="wr-round-note">文件名中的年度、质控次数和批次优先自动识别。上方设置仅在点击“应用”后覆盖待上传文件；逐项人工选择不会被识别器改回。</div>';
    modal.querySelector('.adm-head').insertAdjacentElement('afterend',box);
    q.state.qualityCycleOverride=null;
    box.querySelector('#qc-cycle-apply').onclick=function(){
      var cycle={year:Number(box.querySelector('#qc-cycle-year').value),round:Number(box.querySelector('#qc-cycle-round').value),batch:Number(box.querySelector('#qc-cycle-batch').value),supplement:box.querySelector('#qc-cycle-supplement').checked};
      if(!Number.isInteger(cycle.year)||cycle.year<2020||cycle.year>2099||!Number.isInteger(cycle.batch)||cycle.batch<1||cycle.batch>99){q.progress('请填写有效的年度和反馈批次。',0,true);return;}
      q.state.qualityCycleOverride=cycle;
      var value=B.label(cycle);
      (q.state.files||[]).forEach(function(item){item.manualBatch=value;item.batch=value;if(item.autoMeta)item.autoMeta.batch=value;});
      var select=document.getElementById('adm-batch');if(select){if(!Array.from(select.options).some(function(o){return o.value===value;}))select.add(new Option(value,value));select.value=value;}
      if(window.SoilAdminAutoClassifier)window.SoilAdminAutoClassifier.refresh();
      if(q.renderPreview)q.renderPreview();
      q.progress('已应用：'+value+'。保存路径和整改答复将按本轮次独立关联。',0,true);
    };
  }
  window.SoilQualityBatchControls={onOpen:onOpen};
})();
