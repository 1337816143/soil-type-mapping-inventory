(function () {
  'use strict';
  if (window.SoilWorkRecords) return;
  var C=window.SoilWorkRecordsCore,S=window.SoilWorkRecordsStore;
  var state={records:[],loaded:false,loading:false,selected:'',query:'',from:'',to:'',view:'cards',page:1,drafts:[]};
  var editor=null,deck=null,imageDeck=null,searchTimer=null;
  var pageSize=20;
  function $(s,root){return(root||document).querySelector(s);}
  function localTime(){var d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  function status(text,error){var n=$('#wr-status');if(n){n.textContent=text;n.classList.toggle('wr-error',!!error);}}
  function attachmentUrl(a){return S.raw(a.path);}
  function viewport(modal){var v=window.visualViewport;modal.style.setProperty('--wr-height',(v?v.height:innerHeight)+'px');modal.style.setProperty('--wr-top',(v?v.offsetTop:0)+'px');}
  function makeModal(id,title,extra){
    var previous=document.activeElement, m=document.createElement('div');m.id=id;m.className='wr-modal '+(extra||'');m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-labelledby',id+'-title');
    m.innerHTML='<div class="wr-dialog"><header class="wr-modal-head" style="margin:0;border:0;border-radius:0;box-shadow:none;backdrop-filter:none"><h3 id="'+id+'-title">'+C.esc(title)+'</h3><button type="button" class="wr-btn wr-close" aria-label="关闭">关闭</button></header><div class="wr-modal-body"></div><div class="wr-modal-foot"></div></div>';
    document.body.appendChild(m);var oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    function resize(){viewport(m);}resize();window.addEventListener('resize',resize,{passive:true});if(window.visualViewport){window.visualViewport.addEventListener('resize',resize,{passive:true});window.visualViewport.addEventListener('scroll',resize,{passive:true});}
    m.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();$('.wr-close',m).click();}
      if(e.key!=='Tab')return;
      var all=Array.from(m.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(function(n){return n.getClientRects().length;});
      if(!all.length)return;var first=all[0],last=all[all.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
    m.dispose=function(){window.removeEventListener('resize',resize);if(window.visualViewport){window.visualViewport.removeEventListener('resize',resize);window.visualViewport.removeEventListener('scroll',resize);}m.remove();document.body.style.overflow=oldOverflow;if(previous&&previous.isConnected)previous.focus({preventScroll:true});};
    $('.wr-close',m).focus({preventScroll:true});return m;
  }
  function requestAdmin(action){
    return new Promise(function(resolve){
      if($('#wr-admin-check')){resolve(false);return;}
      var m=makeModal('wr-admin-check','管理员确认','wr-auth');
      $('.wr-modal-body',m).innerHTML='<p class="wr-help">'+C.esc(action)+'需要输入现有管理员密码。未保存的新记录不需要密码。</p><label class="wr-field" style="margin-top:12px">管理员密码<input type="password" id="wr-admin-password" autocomplete="off"></label><p class="wr-status" id="wr-auth-error" role="alert"></p>';
      $('.wr-modal-foot',m).innerHTML='<button type="button" class="wr-btn primary" id="wr-auth-confirm">确认</button>';
      function close(value){$('#wr-admin-password',m).value='';m.dispose();resolve(value);}
      $('.wr-close',m).onclick=function(){close(false);};
      function verify(){var expected=String(window.SOIL_ADMIN_PASSWORD || (window.SoilAdminImport&&window.SoilAdminImport.PASS)||'');if(!expected||$('#wr-admin-password',m).value!==expected){$('#wr-auth-error',m).textContent='管理员密码不正确。';return;}close(true);}
      $('#wr-auth-confirm',m).onclick=verify;$('#wr-admin-password',m).addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();verify();}});$('#wr-admin-password',m).focus();
    });
  }
  function openImages(images,index){
    var m=makeModal('wr-image-view','图片附件','wr-image-view');
    $('.wr-modal-body',m).innerHTML='<div id="wr-large-deck"></div>';
    $('.wr-modal-foot',m).innerHTML='<button class="wr-btn" type="button" id="wr-image-download">下载当前图片</button>';
    imageDeck=window.SoilWorkImageDeck.mount($('#wr-large-deck',m),images,{onOpen:function(){}});imageDeck.setIndex(index||0);
    $('.wr-close',m).onclick=function(){imageDeck.destroy();imageDeck=null;m.dispose();};
    $('#wr-image-download',m).onclick=function(){var a=images[imageDeck.getIndex()];download(a.url,a.name,this);};
  }
  async function download(url,name,button){
    if(button)button.disabled=true;
    try{var response=await fetch(url);if(!response.ok)throw new Error('HTTP '+response.status);var blob=await response.blob(),link=document.createElement('a'),u=URL.createObjectURL(blob);link.href=u;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(u);},30000);}
    catch(e){status('下载失败：'+e.message,true);}finally{if(button)button.disabled=false;}
  }
  function preview(a){
    if(C.isImage(a.name)){var record=state.records.find(function(r){return r.id===state.selected;}),images=(record?record.attachments:[a]).filter(function(x){return C.isImage(x.name);}).map(function(x){return{name:x.name,url:attachmentUrl(x)};});openImages(images,images.findIndex(function(x){return x.name===a.name;}));return;}
    if(window.SoilFileAccess&&typeof window.SoilFileAccess.openPreview==='function')window.SoilFileAccess.openPreview(attachmentUrl(a),a.name);
    else status('预览组件尚未加载完成，请稍后重试。',true);
  }
  function fileList(record){
    if(!record.attachments.length)return '<p class="wr-help" style="margin-top:15px">这条记录尚无附件，可通过“修改”补充。</p>';
    return '<ul class="wr-files">'+record.attachments.map(function(a){return '<li><span class="wr-file-ext">'+C.esc(a.name.split('.').pop().toUpperCase().slice(0,5))+'</span><span class="wr-file-info">'+C.esc(a.name)+'<small>'+C.bytes(a.size)+'</small></span><button type="button" class="wr-btn" data-preview="'+C.esc(a.id)+'">预览</button><button type="button" class="wr-btn" data-download="'+C.esc(a.id)+'">下载</button></li>';}).join('')+'</ul>';
  }
  function renderAttachments(){
    if(deck){deck.destroy();deck=null;}
    var aside=$('#wr-attachments'),record=state.records.find(function(r){return r.id===state.selected;});
    if(!record){aside.innerHTML='<h3>附件预览</h3><p class="wr-help" style="margin-top:12px">选择一条工作记录，在这里查看图片、文档及其他附件。</p>';return;}
    aside.innerHTML='<h3>'+C.esc(record.title)+'</h3><p class="wr-help">'+record.attachments.length+' 个附件 · 图片可滚轮切换</p><div id="wr-images"></div>'+fileList(record);
    var images=record.attachments.filter(function(a){return C.isImage(a.name);}).map(function(a){return{name:a.name,url:attachmentUrl(a)};});
    if(images.length)deck=window.SoilWorkImageDeck.mount($('#wr-images'),images,{onOpen:openImages});
  }
  function actionButtons(record){return '<button type="button" class="wr-btn" data-select-record="'+record.id+'">附件 '+record.attachments.length+'</button><button type="button" class="wr-btn" data-edit-record="'+record.id+'">修改</button><button type="button" class="wr-btn danger" data-delete-record="'+record.id+'">删除</button>';}
  function render(){
    var root=$('#wr-results');if(!root)return;
    var list=C.visible(state.records,state.query,state.from,state.to),pages=Math.max(1,Math.ceil(list.length/pageSize));state.page=Math.min(state.page,pages);
    var rows=list.slice((state.page-1)*pageSize,state.page*pageSize);
    if(!state.selected&&rows.length)state.selected=rows[0].id;
    if(!list.some(function(r){return r.id===state.selected;}))state.selected=rows.length?rows[0].id:'';
    if(!rows.length)root.innerHTML='<div class="wr-empty"><h3>'+(!state.loaded?'工作记录':state.records.length?'没有匹配的记录':'还没有工作记录')+'</h3><p class="wr-help">'+(state.records.length?'调整搜索词或日期范围后重试。':'点击“新增工作记录”开始。编辑可随时暂存，保存后团队可见。')+'</p></div>';
    else if(state.view==='table')root.innerHTML='<div class="wr-table-wrap" tabindex="0" aria-label="工作记录表格，可横向滚动"><table class="wr-table"><thead><tr><th>事项</th><th>时间</th><th>地点</th><th>人员</th><th>备注</th><th>操作 / 附件</th></tr></thead><tbody>'+rows.map(function(r){return '<tr><td>'+C.esc(r.title)+'</td><td>'+C.esc(r.time.replace('T',' '))+'</td><td>'+C.esc(r.location||'—')+'</td><td>'+C.esc(r.people||'—')+'</td><td>'+C.esc(r.notes||'—')+'</td><td>'+actionButtons(r)+'</td></tr>';}).join('')+'</tbody></table></div>';
    else root.innerHTML=rows.map(function(r){return '<article class="wr-record '+(r.id===state.selected?'is-selected':'')+'"><div class="wr-record-time">'+C.esc(r.time.replace('T',' '))+'</div><div class="wr-record-top"><button class="wr-record-title" type="button" data-select-record="'+r.id+'">'+C.esc(r.title)+'</button></div><div class="wr-record-meta"><span>地点：'+C.esc(r.location||'未填写')+'</span><span>人员：'+C.esc(r.people||'未填写')+'</span></div>'+(r.notes?'<details class="wr-record-notes" '+(r.notes.length<220?'open':'')+'><summary>备注</summary>'+C.esc(r.notes)+'</details>':'')+'<div class="wr-record-actions">'+actionButtons(r)+'<span class="wr-revision">已保存 · 第 '+r.revision+' 版</span></div></article>';}).join('');
    $('#wr-pagination').innerHTML='<button type="button" class="wr-btn" data-page="-1" '+(state.page<=1?'disabled':'')+'>上一页</button><span>第 '+state.page+' / '+pages+' 页 · '+list.length+' 条</span><button type="button" class="wr-btn" data-page="1" '+(state.page>=pages?'disabled':'')+'>下一页</button>';
    $('#wr-view-cards').setAttribute('aria-pressed',state.view==='cards');$('#wr-view-table').setAttribute('aria-pressed',state.view==='table');renderAttachments();
  }
  async function load(){
    if(state.loading)return;state.loading=true;status('正在读取工作记录…');
    try{state.records=(await S.load()).map(C.normalize);state.loaded=true;render();status('已保存 '+state.records.length+' 条工作记录。');}
    catch(e){status(e.message,true);}finally{state.loading=false;}
  }
  async function refreshDrafts(){
    try{state.drafts=await S.drafts('list');var box=$('#wr-drafts');if(!box)return;box.hidden=!state.drafts.length;box.innerHTML='<summary>本机暂存 '+state.drafts.length+' 条（仅当前浏览器，不会提前上传）</summary>'+state.drafts.sort(function(a,b){return b.savedAt.localeCompare(a.savedAt);}).map(function(d){return '<div class="wr-draft-item"><span>'+C.esc(d.record.title||'未命名事项')+'<small> · '+C.esc((d.record.time||'').replace('T',' '))+(d.pending?' · 等待保存确认':'')+'</small></span><button type="button" class="wr-btn" data-resume-draft="'+C.esc(d.key)+'">继续编辑</button><button type="button" class="wr-btn" data-discard-draft="'+C.esc(d.key)+'">丢弃草稿</button></div>';}).join('');}
    catch(e){status(e.message,true);}
  }
  function readEditor(){
    if(!editor)return;
    ['title','time','location','people','notes'].forEach(function(k){editor.draft.record[k]=$('#wr-field-'+k,editor.modal).value;});
  }
  function setEditorStatus(text,error){if(!editor)return;var n=$('#wr-draft-status',editor.modal);n.textContent=text;n.classList.toggle('wr-error',!!error);}
  function progress(text,value){if(!editor)return;var node=$('#wr-save-status',editor.modal);node.textContent=text;$('#wr-save-progress',editor.modal).value=value;}
  async function saveDraft(){
    if(!editor)return false;var e=editor;clearTimeout(e.timer);readEditor();
    e.draft.key=C.draftKey(e.draft.record);e.draft.savedAt=new Date().toISOString();
    // Snapshot the object now: IndexedDB serializes Blob/File attachments atomically.
    try{await S.drafts('put',structuredClone(e.draft));if(editor===e){e.dirty=false;setEditorStatus('已暂存到本机 · '+new Date().toLocaleTimeString('zh-CN'));}await refreshDrafts();return true;}
    catch(err){if(editor===e)setEditorStatus(err.message,true);return false;}
  }
  function scheduleDraft(){if(!editor||editor.busy)return;editor.dirty=true;setEditorStatus('正在编辑，稍后自动暂存…');clearTimeout(editor.timer);editor.timer=setTimeout(saveDraft,800);}
  function disposeEditor(){if(!editor)return;clearTimeout(editor.timer);editor.urls.forEach(function(u){URL.revokeObjectURL(u);});editor.modal.dispose();editor=null;}
  async function closeEditor(){if(!editor)return;if(editor.busy){progress('正在保存，请等待仓库确认。',96);return;}if(editor.dirty&&!(await saveDraft()))return;disposeEditor();}
  function renderEditorFiles(){
    if(!editor)return;var e=editor;e.urls.forEach(function(u){URL.revokeObjectURL(u);});e.urls=[];e.previewFiles=[];
    $('#wr-editor-files',e.modal).innerHTML=e.draft.record.attachments.map(function(a){var incoming=e.draft.files.find(function(f){return f.id===a.id;}),url=incoming?URL.createObjectURL(incoming.file):attachmentUrl(a);if(incoming)e.urls.push(url);e.previewFiles.push({id:a.id,name:a.name,url:url});return '<li>'+(C.isImage(a.name)?'<img src="'+C.esc(url)+'" alt="'+C.esc(a.name)+'">':'<b class="wr-file-ext">'+C.esc(a.name.split('.').pop().toUpperCase().slice(0,5))+'</b>')+'<span>'+C.esc(a.name)+'<small> · '+C.bytes(a.size)+'</small></span><button type="button" class="wr-btn" data-preview-draft="'+a.id+'">预览</button><button type="button" class="wr-btn" data-remove-attachment="'+a.id+'" '+(e.busy?'disabled':'')+'>移除</button></li>';}).join('');
  }
  function setBusy(value){if(!editor)return;editor.busy=value;editor.modal.querySelectorAll('input,textarea,select,button').forEach(function(n){n.disabled=value || (!!editor.draft.pending && !n.matches('#wr-save,#wr-save-draft,.wr-close'));});}
  async function saveRecord(){
    if(!editor||editor.busy||editor.saving)return;readEditor();var e=editor;e.saving=true;
    try{
      C.validate(e.draft.record);
      if(e.draft.baseRevision>0&&!e.authorized)throw new Error('修改已保存记录前必须确认管理员密码。');
      if(!(await saveDraft()))return;
      setBusy(true);progress('正在校验记录和上传凭证…',1);
      var result;
      if(e.draft.pending)result=await S.poll(e.draft.pending,progress,undefined,60);
      else result=await S.submit(e.draft,e.draft.baseRevision?'update':'create',progress,async function(op){e.draft.pending=op;await saveDraft();});
      if(result.pending){progress('任务已提交，尚未确认保存完成。草稿保留；稍后点击“检查保存结果”。',96);$('#wr-save',e.modal).textContent='检查保存结果';return;}
      progress('工作记录与附件已保存到仓库。',100);
      await S.drafts('delete',e.draft.key);e.dirty=false;disposeEditor();await refreshDrafts();await load();status('保存成功！稍等3~5分钟刷新网站即可查看新上传的文件。');
    }catch(err){progress('保存未完成：'+err.message,0);if(e.draft.pending)$('#wr-save',e.modal).textContent='检查保存结果';}
    finally{e.saving=false;if(editor===e)setBusy(false);}
  }
  async function openEditor(record,draft){
    if(editor)return;
    var base=draft?Number(draft.baseRevision||0):record?record.revision:0;
    var authorized=base>0?await requestAdmin('修改已保存的工作记录'):false;if(base>0&&!authorized)return;
    if(draft&&base>0&&!draft.pending){var live=state.records.find(function(r){return r.id===draft.record.id;});if(!live||live.revision!==base){status('该草稿对应的记录已被修改或删除，请先核对当前记录。草稿内容仍保留。',true);return;}}
    var data=draft?structuredClone(draft):{record:C.normalize(record||{time:localTime()}),files:[],baseRevision:base,pending:null};
    var m=makeModal('wr-editor',base?'修改工作记录':'新增工作记录');editor={modal:m,draft:data,authorized:authorized,busy:false,dirty:false,timer:null,urls:[],previewFiles:[]};
    $('.wr-modal-body',m).innerHTML='<div class="wr-editor-grid"><div class="wr-fields"><label class="wr-field">事项 *<input id="wr-field-title" maxlength="300" required placeholder="例如：省级成果质控交流会议"></label><label class="wr-field">时间 *<input type="datetime-local" id="wr-field-time" required></label><label class="wr-field">地点<input id="wr-field-location" maxlength="500" placeholder="会议室、线上会议或实地地点"></label><label class="wr-field">人员<input id="wr-field-people" maxlength="1000" placeholder="填写参加人员或单位"></label><label class="wr-field">备注<textarea id="wr-field-notes" maxlength="20000" placeholder="记录过程、结论与待办事项"></textarea></label></div><aside class="wr-editor-attachments"><h4>附件</h4><p class="wr-help">Word、PDF、图片等。每个附件最大 95 MiB，每条最多 30 个；图片可直接查看。</p><input id="wr-files-input" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,.txt,.csv,.md,.zip,.rar,.7z,.mp4,.mov"><ul id="wr-editor-files" class="wr-editor-files"></ul><p class="wr-privacy">暂存仅保存在当前设备浏览器。正式保存后，记录和附件会同步到公开仓库，网站访问者可查看；请勿填写敏感个人信息。</p></aside></div>';
    $('.wr-modal-foot',m).innerHTML='<div class="wr-progress"><div id="wr-save-status" role="status" aria-live="polite"></div><progress id="wr-save-progress" max="100" value="0" aria-label="工作记录保存进度"></progress></div><div class="wr-editor-actions"><span class="wr-draft-status" id="wr-draft-status" aria-live="polite">'+(draft?'已恢复本机草稿':'编辑内容会自动暂存')+'</span><button type="button" class="wr-btn" id="wr-save-draft">暂存</button><button type="button" class="wr-btn primary" id="wr-save">'+(data.pending?'检查保存结果':'保存记录')+'</button></div>';
    ['title','time','location','people','notes'].forEach(function(k){$('#wr-field-'+k,m).value=data.record[k]||'';$('#wr-field-'+k,m).addEventListener('input',scheduleDraft);});
    $('.wr-close',m).onclick=closeEditor;$('#wr-save-draft',m).onclick=saveDraft;$('#wr-save',m).onclick=saveRecord;
    $('#wr-files-input',m).addEventListener('change',function(){
      var e=editor;if(!e||e.busy)return;var chosen=Array.from(this.files||[]);this.value='';
      try{
        if(e.draft.record.attachments.length+chosen.length>30)throw new Error('每条记录最多 30 个附件。');chosen.forEach(C.validateFile);
        chosen.forEach(function(file){var aid='att-'+C.id().slice(3),attachment={id:aid,name:file.name,size:file.size,type:file.type||'',path:'data/work-records/attachments/'+e.draft.record.id+'/'+aid+'/'+C.safeName(file.name)};e.draft.files.push({id:aid,file:file});e.draft.record.attachments.push(attachment);});
        renderEditorFiles();scheduleDraft();
      }catch(err){setEditorStatus(err.message,true);}
    });
    $('#wr-editor-files',m).addEventListener('click',function(ev){var prev=ev.target.closest('[data-preview-draft]');if(prev&&editor){var item=editor.previewFiles.find(function(x){return x.id===prev.dataset.previewDraft;});if(item){if(C.isImage(item.name)){var images=editor.previewFiles.filter(function(x){return C.isImage(x.name);});openImages(images,images.findIndex(function(x){return x.id===item.id;}));}else if(window.SoilFileAccess)window.SoilFileAccess.openPreview(item.url,item.name);}return;}var button=ev.target.closest('[data-remove-attachment]');if(!button||!editor||editor.busy)return;var id=button.dataset.removeAttachment;editor.draft.record.attachments=editor.draft.record.attachments.filter(function(a){return a.id!==id;});editor.draft.files=editor.draft.files.filter(function(a){return a.id!==id;});renderEditorFiles();scheduleDraft();});
    renderEditorFiles();setBusy(false);$('#wr-field-title',m).focus({preventScroll:true});
  }
  async function deleteRecord(record){
    if(!(await requestAdmin('删除“'+record.title+'”及其附件')))return;
    if(!confirm('确定删除这条工作记录及其附件？此操作会同步到仓库。'))return;
    status('正在提交删除请求…');
    var temporary={record:C.normalize(record),files:[],baseRevision:record.revision};
    try{var result=await S.submit(temporary,'delete',function(t){status(t);},async function(){});if(result.pending){status('删除请求已提交，等待仓库确认，请稍后刷新。');return;}await load();status('记录及附件已删除。');}
    catch(e){status('删除未完成：'+e.message,true);}
  }
  function build(){
    var tabs=$('header .tabs'),container=$('body > .container');if(!tabs||!container)return;
    var tab=document.createElement('div');tab.className='tab';tab.dataset.tab='workRecords';tab.textContent='工作记录';tab.setAttribute('role','tab');tab.tabIndex=-1;tabs.appendChild(tab);
    var panel=document.createElement('div');panel.id='tab-workRecords';panel.className='tab-content';panel.innerHTML='<div class="wr-toolbar"><div class="wr-heading"><h2>工作记录</h2><p>记录事项与过程，附件随记录归档。</p></div><button type="button" class="wr-btn" id="wr-refresh">刷新</button><button type="button" class="wr-btn primary" id="wr-new">＋ 新增工作记录</button></div><details id="wr-drafts" class="wr-drafts" hidden></details><div class="wr-controls"><input id="wr-search" type="search" aria-label="查询工作记录" placeholder="查询事项、地点、人员、备注或附件名"><label>从<input id="wr-from" type="date"></label><label>至<input id="wr-to" type="date"></label><button type="button" class="wr-btn" id="wr-view-cards" aria-pressed="true">按条展示</button><button type="button" class="wr-btn" id="wr-view-table" aria-pressed="false">表格展示</button></div><div id="wr-status" class="wr-status" role="status" aria-live="polite"></div><div class="wr-layout"><div class="wr-list"><div id="wr-results"></div><div id="wr-pagination" class="wr-pagination"></div></div><aside id="wr-attachments" class="wr-attachments-panel"></aside></div>';
    container.appendChild(panel);
    tab.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();document.querySelectorAll('.tab,.tab-content').forEach(function(n){n.classList.remove('active');});tab.classList.add('active');panel.classList.add('active');var b=$('#missingBanner');if(b)b.style.display='none';if(!state.loaded)load();refreshDrafts();});
    $('#wr-new').onclick=function(){openEditor();};$('#wr-refresh').onclick=load;
    ['cards','table'].forEach(function(v){$('#wr-view-'+v).onclick=function(){state.view=v;render();};});
    $('#wr-search').addEventListener('input',function(){state.query=this.value;state.page=1;clearTimeout(searchTimer);searchTimer=setTimeout(render,140);});
    ['from','to'].forEach(function(k){$('#wr-'+k).onchange=function(){state[k]=this.value;state.page=1;render();};});
    panel.addEventListener('click',async function(ev){
      var b=ev.target.closest('button');if(!b)return;var record;
      if(b.dataset.selectRecord){state.selected=b.dataset.selectRecord;render();if(matchMedia('(max-width:760px)').matches)$('#wr-attachments').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}
      if(b.dataset.editRecord){record=state.records.find(function(r){return r.id===b.dataset.editRecord;});if(record)openEditor(record);}
      if(b.dataset.deleteRecord){record=state.records.find(function(r){return r.id===b.dataset.deleteRecord;});if(record)deleteRecord(record);}
      if(b.dataset.preview||b.dataset.download){record=state.records.find(function(r){return r.id===state.selected;});var a=record&&record.attachments.find(function(x){return x.id===(b.dataset.preview||b.dataset.download);});if(a){if(b.dataset.preview)preview(a);else download(attachmentUrl(a),a.name,b);}}
      if(b.dataset.page){state.page+=Number(b.dataset.page);render();}
      if(b.dataset.resumeDraft){var d=state.drafts.find(function(x){return x.key===b.dataset.resumeDraft;});if(d)openEditor(null,d);}
      if(b.dataset.discardDraft&&confirm('仅丢弃这份本机草稿？已保存的工作记录不会被删除。')){await S.drafts('delete',b.dataset.discardDraft);refreshDrafts();}
    });
    render();
  }
  window.addEventListener('beforeunload',function(e){if(editor&&(editor.dirty||editor.busy)){e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',function(){if(document.hidden&&editor&&!editor.busy&&editor.dirty)saveDraft();});
  window.SoilWorkRecords={refresh:load,open:openEditor,state:state};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
})();
