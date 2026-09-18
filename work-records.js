(function () {
  'use strict';
  if (window.SoilWorkRecords) return;
  var C = window.SoilWorkCore;
  if (!C) throw new Error('工作记录核心模块未加载');
  var data = {schemaVersion:1,records:[]}, view = 'cards', page = 1, editor = null, panel, status;
  var searchTimer, draftTimer, saveQueue = Promise.resolve(), loading = false, loaded = false;
  var objects = new Map(), overlayCount = 0, priorOverflow = '';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g,function (s) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]; }); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className=cls; if (text != null) n.textContent=text; return n; }
  function button(text, cls, fn) { var b=el('button','wr-button '+(cls||''),text); b.type='button'; if (fn) b.onclick=fn; return b; }
  function size(n) { return n < 1048576 ? Math.round(n/1024)+' KB' : (n/1048576).toFixed(1)+' MB'; }
  function raw(path) {
    if (!String(path).startsWith(C.fileRoot) && path !== C.storePath) throw new Error('非法工作记录文件路径');
    if (String(path).split('/').includes('..')) throw new Error('非法附件路径');
    return 'https://raw.githubusercontent.com/1337816143/soil-type-mapping-inventory/main/'+path.split('/').map(encodeURIComponent).join('/');
  }
  function url(a) {
    if (!a.file) return raw(a.path);
    if (!objects.has(a.id)) objects.set(a.id,URL.createObjectURL(a.file));
    return objects.get(a.id);
  }
  function notify(text, error) { if (status) { status.textContent=text; status.classList.toggle('error',!!error); } }
  function modal(title, cls, onClose) {
    var previous=document.activeElement, mask=el('div','wr-overlay '+(cls||'')), box=el('section','wr-dialog');
    box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
    var heading=el('div','wr-dialog-head'), h=el('h3','',title);h.id=C.uid();box.setAttribute('aria-labelledby',h.id);
    var body=el('div','wr-dialog-body'), foot=el('div','wr-dialog-foot');
    var close=button('关闭','',function () { if(onClose) onClose(); else dispose(); });close.setAttribute('aria-label','关闭'+title);
    heading.append(h,close);box.append(heading,body,foot);mask.append(box);document.body.append(mask);
    if (!overlayCount++) { priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden'; }
    function viewport() {
      var v=window.visualViewport, width=v?v.width:innerWidth,height=v?v.height:innerHeight,left=v?v.offsetLeft:0,top=v?v.offsetTop:0;
      var w=Math.min(1060,width-16),hh=Math.min(860,height-16);
      box.style.cssText='width:'+w+'px;height:'+hh+'px;left:'+(left+(width-w)/2)+'px;top:'+(top+(height-hh)/2)+'px;';
    }
    function keyboard(e) {
      if (mask !== document.querySelectorAll('.wr-overlay')[document.querySelectorAll('.wr-overlay').length-1] || document.querySelector('.soil-file-modal')) return;
      if(e.key==='Escape') { e.preventDefault();close.click(); }
      if(e.key==='Tab') {
        var items=Array.from(box.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea,select,a[href],[tabindex="0"]')).filter(function(n){return n.getClientRects().length;});
        if(!items.length)return;
        if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items[items.length-1].focus();}
        else if(!e.shiftKey&&document.activeElement===items[items.length-1]){e.preventDefault();items[0].focus();}
      }
    }
    function dispose() {
      if (!mask.isConnected) return;
      mask.remove();window.removeEventListener('resize',viewport);document.removeEventListener('keydown',keyboard);
      if(window.visualViewport){visualViewport.removeEventListener('resize',viewport);visualViewport.removeEventListener('scroll',viewport);}
      if(!--overlayCount)document.body.style.overflow=priorOverflow;
      if(previous&&previous.isConnected)previous.focus({preventScroll:true});
    }
    window.addEventListener('resize',viewport);document.addEventListener('keydown',keyboard);
    if(window.visualViewport){visualViewport.addEventListener('resize',viewport);visualViewport.addEventListener('scroll',viewport);}
    viewport();close.focus({preventScroll:true});
    return {mask:mask,box:box,body:body,foot:foot,close:close,dispose:dispose};
  }
  function authorize(action) {
    return new Promise(function(resolve){
      var m=modal('管理员验证','wr-auth',function(){m.dispose();resolve(false);});
      m.box.style.maxWidth='480px';
      m.body.append(el('p','',action+'已保存的工作记录需要管理员密码。'));
      var input=el('input');input.id='wr-auth-password';input.type='password';input.autocomplete='off';input.setAttribute('aria-label','管理员密码');
      var message=el('p','wr-status error');m.body.append(input,message);
      var ok=button('验证并继续','primary',function(){
        var expected=window.SoilAdminImport&&window.SoilAdminImport.PASS||'478666';
        if(input.value!==expected){message.textContent='管理员密码不正确';input.select();return;}
        input.value='';m.dispose();resolve(true);
      });m.foot.append(button('取消','',function(){m.dispose();resolve(false);}),ok);
      input.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();ok.click();}};input.focus();
    });
  }
  function showImage(items, start) {
    var index=start||0, zoom=1, m=modal('图片查看','wr-image-overlay'), stage=el('div','wr-image-stage'), img=el('img'), label=el('span','wr-status');
    m.body.style.padding='0';stage.append(img);m.body.append(stage);
    function update(){var a=items[index];img.src=url(a);img.alt=a.name||a.file.name;label.textContent=(index+1)+' / '+items.length;zoom=1;img.style.transform='';}
    var go=function(d){index=(index+d+items.length)%items.length;update();};
    m.foot.append(button('上一张','',function(){go(-1);}),label,button('下一张','',function(){go(1);}),button('缩放','',function(){zoom=zoom===1?1.5:1;img.style.transform='scale('+zoom+')';}),button('下载原图','primary',function(){download(items[index]);}));
    stage.tabIndex=0;stage.onkeydown=function(e){if(['ArrowLeft','ArrowUp'].includes(e.key)){e.preventDefault();go(-1);}if(['ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();go(1);}};
    update();
  }
  function gallery(items) {
    var outer=el('div','wr-gallery');
    if(!items.length){outer.append(el('div','wr-gallery-empty','图片附件会直接展示在这里'));return outer;}
    var index=0,last=0,pointer=null,deck=el('div','wr-deck');deck.tabIndex=0;deck.setAttribute('aria-label','图片卡片；滚轮、方向键或左右滑动切换');
    var cards=items.map(function(a,i){var p=el('div','wr-photo'),im=el('img');im.alt=a.name||a.file.name;im.decoding='async';p.append(im);p.onclick=function(){if(i===index)showImage(items,index);};deck.append(p);return p;});
    var controls=el('div','wr-gallery-controls'),label=el('span');label.setAttribute('aria-live','polite');
    function position(){
      cards.forEach(function(card,i){var rank=(i-index+items.length)%items.length, visible=rank<4;
        card.style.zIndex=String(10-Math.min(rank,5));card.style.opacity=visible?String(1-rank*.12):'0';card.style.pointerEvents=rank===0?'auto':'none';
        card.style.transform='translate3d(0,'+(Math.min(rank,4)*13)+'px,0) scale('+(1-Math.min(rank,4)*.045)+')';
        card.setAttribute('aria-hidden',rank===0?'false':'true');
        if(visible&&!card.firstChild.getAttribute('src'))card.firstChild.src=url(items[i]);
      });label.textContent=(index+1)+' / '+items.length;
    }
    function step(delta){if(items.length<2)return;index=(index+delta+items.length)%items.length;position();}
    deck.addEventListener('wheel',function(e){if(items.length<2||Math.abs(e.deltaY)+Math.abs(e.deltaX)<3)return;e.preventDefault();var now=performance.now();if(now-last<260)return;last=now;step((e.deltaY||e.deltaX)>0?1:-1);},{passive:false});
    deck.addEventListener('keydown',function(e){var next=['ArrowRight','ArrowDown'].includes(e.key)||['Numpad2','Numpad6'].includes(e.code),prev=['ArrowLeft','ArrowUp'].includes(e.key)||['Numpad4','Numpad8'].includes(e.code);if(next||prev){e.preventDefault();step(next?1:-1);}if(e.key==='Enter')showImage(items,index);});
    deck.onpointerdown=function(e){pointer={x:e.clientX,y:e.clientY};};deck.onpointerup=function(e){if(!pointer)return;var dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.2)step(dx<0?1:-1);};
    controls.append(button('‹','',function(){step(-1);}),label,button('›','',function(){step(1);}));outer.append(deck,controls,el('div','wr-gallery-hint','滚轮 / 方向键切换 · 点击查看原图'));position();return outer;
  }
  async function download(a) {
    try {var blob=a.file||await fetch(raw(a.path)).then(function(r){if(!r.ok)throw new Error('附件下载失败');return r.blob();});var u=URL.createObjectURL(blob),link=el('a');link.href=u;link.download=a.name||a.file.name;link.click();setTimeout(function(){URL.revokeObjectURL(u);},30000);}catch(e){notify(e.message,true);}
  }
  function preview(a) {
    var name=a.name||a.file.name;
    if(C.isImage(name)){showImage([a],0);return;}
    if(window.SoilDocumentPreview&&/\.(pdf|docx)$/i.test(name)){window.SoilDocumentPreview.open(url(a),name);return;}
    var m=modal('附件：'+name);m.body.append(el('p','wr-status','此格式不能直接在浏览器内预览，可以下载后查看。'));m.foot.append(button('下载文件','primary',function(){download(a);}));
  }
  function attachments(parent, items, remove) {
    var imageItems=items.filter(function(a){return C.isImage(a.name||a.file.name);});
    if(imageItems.length)parent.append(gallery(imageItems));
    items.forEach(function(a){
      if(!remove&&C.isImage(a.name||a.file.name))return;
      var row=el('div','wr-file'),name=el('div','wr-file-name',a.name||a.file.name);name.append(el('small','',size(a.size||a.file&&a.file.size||0)));
      row.append(name,button('预览','',function(){preview(a);}));
      if(remove)row.append(button('移除','',function(){remove(a);}));else row.append(button('下载','',function(){download(a);}));
      parent.append(row);
    });
    if(!items.length)parent.append(el('div','wr-gallery-empty','暂无附件'));
  }
  function openAttachments(r){var m=modal('工作记录附件');attachments(m.body,r.attachments||[]);m.foot.append(button('关闭','',m.dispose));}
  function recordCard(r){
    var card=el('article','wr-record'),left=el('div'),right=el('aside','wr-files');card.dataset.record=r.id;
    left.append(el('h3','',r.title));var meta=el('div','wr-meta');
    meta.append(el('div','',r.time.replace('T',' ')),el('div','地点：'+(r.location||'未填写')),el('div','','人员：'+(r.people||'未填写')));
    left.append(meta,el('div','wr-notes',r.notes||'暂无备注'));var actions=el('div','wr-record-actions');
    actions.append(button('编辑','',function(){startEditor(r);}),button('删除','danger',function(){deleteRecord(r);}));left.append(actions);
    attachments(right,r.attachments||[]);card.append(left,right);return card;
  }
  function render(){
    if(!panel)return;var list=panel.querySelector('.wr-results');list.replaceChildren();
    var matches=C.query(data.records,panel.querySelector('#wr-search').value,panel.querySelector('#wr-from').value,panel.querySelector('#wr-until').value);
    var pages=Math.max(1,Math.ceil(matches.length/20));page=Math.min(page,pages);var shown=matches.slice((page-1)*20,page*20);
    panel.querySelector('#wr-count').textContent=matches.length+' 条工作记录';
    if(!matches.length){var empty=el('div','wr-empty');empty.append(el('strong','',loaded?'从一条工作记录开始':'正在读取工作记录…'),el('span','',loaded?'记录检查、会议、培训与现场工作，材料与事项放在一起。':''));list.append(empty);}
    else if(view==='cards')shown.forEach(function(r){list.append(recordCard(r));});
    else{var wrap=el('div','wr-table-scroll'),table=el('table','wr-table');table.innerHTML='<thead><tr><th>事项</th><th>时间</th><th>地点</th><th>人员</th><th>备注</th><th>附件</th><th>操作</th></tr></thead>';var tbody=el('tbody');
      shown.forEach(function(r){var tr=el('tr');[r.title,r.time.replace('T',' '),r.location,r.people,r.notes].forEach(function(v){tr.append(el('td','',v||'—'));});var files=el('td'),act=el('td');files.append(button((r.attachments||[]).length+' 个附件','',function(){openAttachments(r);}));act.append(button('编辑','',function(){startEditor(r);}),button('删除','danger',function(){deleteRecord(r);}));tr.append(files,act);tbody.append(tr);});table.append(tbody);wrap.append(table);list.append(wrap);}
    var pager=panel.querySelector('.wr-pagination');pager.replaceChildren();var prev=button('上一页','',function(){page--;render();}),next=button('下一页','',function(){page++;render();});prev.disabled=page<=1;next.disabled=page>=pages;pager.append(prev,el('span','',page+' / '+pages),next);
    panel.querySelectorAll('[data-view]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.view===view));});
  }
  async function refresh(force){
    if(loading)return;loading=true;notify('正在同步工作记录…');
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},15000);
    try {var response=await fetch(force?raw(C.storePath)+'?t='+Date.now():'./'+C.storePath+'?v='+encodeURIComponent(window.SOIL_RELEASE_VERSION||''),{cache:'no-cache',signal:controller.signal});if(!response.ok)throw new Error('工作记录读取失败（HTTP '+response.status+'）');data=C.store(await response.json());loaded=true;notify('已同步 · '+C.query(data.records).length+' 条记录');render();}
    catch(e){notify('同步未完成：'+e.message+'。已有显示内容未清除。',true);}finally{clearTimeout(timer);loading=false;}
  }
  async function renderDrafts(){
    try{var drafts=await C.drafts.list(),host=panel.querySelector('.wr-drafts');host.replaceChildren();drafts.sort(function(a,b){return b.updatedAt.localeCompare(a.updatedAt);}).forEach(function(d){var chip=el('div','wr-draft-chip');chip.append(el('span','',d.fields.title||'未命名草稿'),button('继续编辑','',function(){startEditor(null,d);}),button('丢弃草稿','',async function(){if(confirm('仅删除本机这份草稿，不影响已保存的工作记录？')){await C.drafts.remove(d.id);renderDrafts();}}));host.append(chip);});}catch(e){notify('本机草稿不可用：'+e.message,true);}
  }
  function currentDraft(){return C.draft({id:editor.draftId,recordId:editor.recordId,baseRevision:editor.baseRevision,fields:readFields(),attachments:editor.attachments,files:editor.files});}
  function readFields(){var result={};['title','time','location','people','notes'].forEach(function(k){result[k]=document.getElementById('wr-field-'+k).value;});return result;}
  function persist(){
    if(!editor)return Promise.resolve();clearTimeout(draftTimer);var d=currentDraft(),state=editor;
    saveQueue=saveQueue.catch(function(){}).then(function(){return C.drafts.put(d);}).then(function(){if(editor===state)state.draftStatus.textContent='草稿已暂存在本机 · '+new Date().toLocaleTimeString();}).catch(function(e){if(editor===state)state.draftStatus.textContent='暂存失败：'+e.message;throw e;});
    return saveQueue;
  }
  async function closeEditor(){
    if(!editor||editor.busy)return;
    try{await persist();}catch(e){if(!confirm('本机暂存失败。仍然关闭会丢失未保存内容，确定关闭？'))return;}
    var m=editor.modal;editor=null;clearTimeout(draftTimer);m.dispose();objects.forEach(function(u){URL.revokeObjectURL(u);});objects.clear();renderDrafts();
  }
  function renderEditorAttachments(){var host=editor.modal.body.querySelector('#wr-editor-files');host.replaceChildren();attachments(host,editor.attachments.concat(editor.files),function(a){if(editor.busy)return;editor.attachments=editor.attachments.filter(function(x){return x.id!==a.id;});editor.files=editor.files.filter(function(x){return x.id!==a.id;});renderEditorAttachments();persist().catch(function(){});});}
  async function startEditor(record,resume){
    if(editor)return;
    var savedId=resume?resume.recordId:record&&record.id;
    var permitted=savedId?await authorize('修改'):false;
    if(savedId&&!permitted)return;
    var f=resume?resume.fields:record||{},m=modal(savedId?'编辑工作记录':'新增工作记录','',closeEditor);
    var now=new Date(),local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
    editor={modal:m,recordId:savedId||null,baseRevision:resume?resume.baseRevision:record?record.revision:null,
      draftId:resume?resume.id:record?'edit-'+record.id:'draft-'+C.uid(),id:savedId||(resume&&resume.id.replace(/^draft-/,''))||C.uid(),authorized:permitted,
      attachments:(resume?resume.attachments:record&&record.attachments||[]).map(function(a){return Object.assign({},a);}),files:resume?resume.files||[]:[],busy:false};
    if(!savedId&&!resume)editor.id=editor.draftId.replace(/^draft-/,'');
    m.body.innerHTML='<div class="wr-editor-layout"><div class="wr-fields">'+[['title','事项 *','text'],['time','时间 *','datetime-local'],['location','地点','text'],['people','人员','text']].map(function(x){return '<label>'+x[1]+'<input id="wr-field-'+x[0]+'" type="'+x[2]+'" value="'+esc(f[x[0]]||(x[0]==='time'?local:''))+'" '+(['title','time'].includes(x[0])?'required':'')+'></label>';}).join('')+'<label>备注<textarea id="wr-field-notes">'+esc(f.notes||'')+'</textarea></label><p class="wr-disclosure">草稿（含附件）仅暂存在当前设备。正式保存会同步到公开 GitHub 仓库，请勿填写不宜公开的信息。已保存记录再次修改或删除需要管理员密码。</p></div><aside class="wr-editor-aside"><h4>附件与现场图片</h4><div class="wr-attachment-input"><input id="wr-attachments" type="file" multiple accept="*/*"><p>支持 Word、PDF、图片等；每个文件不超过39 MiB，每条记录最多30个附件。</p></div><div id="wr-editor-files" class="wr-files"></div></aside></div><div id="wr-editor-message" class="wr-status" role="status"></div><div class="wr-progress"><span id="wr-editor-progress"></span></div>';
    editor.draftStatus=el('div','wr-draft-status','编辑中 · 自动暂存');
    m.foot.append(editor.draftStatus,button('暂存草稿','',function(){persist().catch(function(){});}),button('暂存并关闭','',closeEditor),button('正式保存','primary',saveEditor));
    m.body.querySelector('.wr-fields').addEventListener('input',function(){editor.draftStatus.textContent='正在编辑…';clearTimeout(draftTimer);draftTimer=setTimeout(function(){persist().catch(function(){});},600);});
    m.body.querySelector('#wr-attachments').onchange=function(){
      var incoming=Array.from(this.files||[]),message=m.body.querySelector('#wr-editor-message');
      if(incoming.length+editor.files.length+editor.attachments.length>30){message.textContent='每条记录最多30个附件';return;}
      if(incoming.some(function(f){return !f.size||f.size>C.maxFile;})){message.textContent='文件为空或超过39 MiB，未添加；已有附件保持不变。';return;}
      incoming.forEach(function(file){editor.files.push({id:C.uid(),file:file});});this.value='';message.textContent='';renderEditorAttachments();persist().catch(function(){});
    };renderEditorAttachments();m.body.querySelector('#wr-field-title').focus();
  }
  async function saveEditor(){
    if(!editor||editor.busy)return;var e=editor,msg=e.modal.body.querySelector('#wr-editor-message');
    try{var values=C.fields(readFields(),true);await persist();e.busy=true;e.modal.box.querySelectorAll('button,input,textarea').forEach(function(n){n.disabled=true;});
      var result=await C.save({operation:'save',id:e.id,baseRevision:e.baseRevision,authorized:e.authorized,fields:values,attachments:e.attachments,files:e.files},
        {progress:function(text,p){msg.textContent=text;document.getElementById('wr-editor-progress').style.width=p+'%';}});
      data=result.data;loaded=true;clearTimeout(draftTimer);await saveQueue.catch(function(){});await C.drafts.remove(e.draftId);editor=null;e.modal.dispose();objects.forEach(function(u){URL.revokeObjectURL(u);});objects.clear();render();renderDrafts();notify('工作记录已正式保存并同步 GitHub。上传成功！稍等3~5分钟刷新网站即可查看新上传的文件。');
    }catch(error){msg.textContent='保存未完成：'+error.message+'；草稿保留在本机。';msg.classList.add('error');}
    finally{if(editor===e){e.busy=false;e.modal.box.querySelectorAll('button,input,textarea').forEach(function(n){n.disabled=false;});}}
  }
  async function deleteRecord(record){
    if(!await authorize('删除'))return;
    try{var result=await C.save({operation:'delete',id:record.id,baseRevision:record.revision,authorized:true},{progress:function(t){notify(t);}});data=result.data;render();notify('工作记录已删除。历史版本和附件保留用于追溯。');}catch(e){notify('删除未完成：'+e.message,true);}
  }
  function enter(){document.querySelectorAll('.tab,.tab-content').forEach(function(n){n.classList.remove('active');});panel.classList.add('active');document.querySelector('[data-tab="workRecords"]').classList.add('active');var banner=document.getElementById('missingBanner');if(banner)banner.style.display='none';render();renderDrafts();if(!loaded)refresh(false);}
  function install(){
    var tabs=document.querySelector('header .tabs'),host=document.querySelector('body > .container');if(!tabs||!host)return;
    var tab=el('div','tab','工作记录');tab.dataset.tab='workRecords';tab.setAttribute('role','tab');tab.tabIndex=0;tab.onclick=function(e){e.preventDefault();e.stopPropagation();enter();};tab.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();enter();}};tabs.append(tab);
    panel=el('section','tab-content');panel.id='tab-workRecords';panel.innerHTML='<div class="wr-page"><div class="wr-heading"><div><div class="wr-kicker">WORK JOURNAL · 三普质控</div><h2>工作记录</h2><p>事项有记录，过程有留痕，材料随手可查。</p></div><button id="wr-new" class="wr-button primary" type="button">＋ 新增工作记录</button></div><div class="wr-toolbar"><input id="wr-search" type="search" placeholder="搜索事项、地点、人员、备注或附件" aria-label="搜索工作记录"><label>从<input id="wr-from" type="date" aria-label="开始日期"></label><label>至<input id="wr-until" type="date" aria-label="结束日期"></label><div class="wr-switch"><button data-view="cards" class="wr-button" aria-pressed="true">卡片</button><button data-view="table" class="wr-button" aria-pressed="false">表格</button></div><button id="wr-refresh" class="wr-button">刷新</button></div><div class="wr-drafts" aria-label="本机草稿"></div><div><span id="wr-count" class="wr-status"></span> · <span id="wr-status" class="wr-status" role="status"></span></div><div class="wr-results"></div><div class="wr-pagination"></div></div>';host.append(panel);status=panel.querySelector('#wr-status');
    panel.querySelector('#wr-new').onclick=function(){startEditor();};panel.querySelector('#wr-refresh').onclick=function(){refresh(true);};
    panel.querySelector('#wr-search').oninput=function(){clearTimeout(searchTimer);searchTimer=setTimeout(function(){page=1;render();},120);};
    ['#wr-from','#wr-until'].forEach(function(s){panel.querySelector(s).onchange=function(){page=1;render();};});
    panel.querySelectorAll('[data-view]').forEach(function(b){b.onclick=function(){view=b.dataset.view;render();};});
    window.addEventListener('beforeunload',function(e){if(editor){e.preventDefault();e.returnValue='';}});
    document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&editor&&!editor.busy)persist().catch(function(){});});
    render();
  }
  window.SoilWorkRecords={enter:enter,refresh:refresh,gallery:gallery,startEditor:startEditor};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
