(function () {
  'use strict';
  var A = window.SoilRepoAdmin;
  if (!A) return;
  var Q = window.SoilAdminImport = window.SoilAdminImport || {};
  Q.A = A;
  Q.PASS = '478666';
  Q.MAX = 95 * 1024 * 1024;
  Q.ZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  Q.QUALITY_ROOT = 'data/质控意见反馈_管理员导入';
  Q.state = Q.state || {context:null,files:[],index:[],busy:false};
  Q.types = function () {
    return window.SoilDashboardTypes || {soilType:'土壤类型图',soilAttr:'土壤属性图',farmland:'耕地质量等级评价'};
  };

  Q.progress = function (text, percent, visible) {
    var box=document.getElementById('adm-prog'); if(!box)return;
    document.getElementById('adm-text').textContent=text||'';
    document.getElementById('adm-bar').style.width=Math.max(0,Math.min(100,percent||0))+'%';
    box.classList.toggle('show',visible!==false&&!!text);
  };
  Q.close = function () {
    if(Q.state.busy)return;
    var modal=document.getElementById('soilAdminImport'); if(modal)modal.classList.remove('show');
  };

  function styles(){
    if(document.getElementById('admin-quality-style'))return;
    var s=document.createElement('style'); s.id='admin-quality-style';
    s.textContent='.result-admin{display:none!important}.adm-mask{display:none;position:fixed;inset:0;z-index:12000;padding:16px;background:rgba(15,23,42,.48);align-items:center;justify-content:center}.adm-mask.show{display:flex}.adm-card{width:min(760px,96vw);max-height:92vh;overflow:auto;padding:21px;background:#fff;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.24)}.adm-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.adm-head h3{font-size:1.05rem}.adm-close{border:0;background:none;font-size:1.45rem;cursor:pointer}.adm-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.adm-field{display:flex;flex-direction:column;gap:5px}.adm-field.full{grid-column:1/-1}.adm-field label{font-size:.77rem;font-weight:650}.adm-field input,.adm-field select{padding:8px 9px;border:1px solid var(--rule);border-radius:7px;font:inherit;font-size:.81rem}.adm-quality-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;grid-column:1/-1}.adm-quality-grid.hidden{display:none}.adm-name-guide{grid-column:1/-1;padding:10px 12px;border:1px solid #fcd34d;border-radius:8px;background:#fffbeb;color:#92400e;font-size:.76rem;line-height:1.65}.adm-name-guide strong{display:block;color:#78350f}.adm-name-example{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.adm-picks{display:grid;grid-template-columns:1fr 1fr;gap:9px}.adm-pick{padding:9px;border:1px dashed #93c5fd;border-radius:8px;background:#f8fbff}.adm-pick small,.adm-tip{display:block;color:var(--muted);font-size:.71rem;line-height:1.55}.adm-pick input{border:0;padding:4px 0 0;font-size:.74rem}.adm-list{max-height:150px;overflow:auto;padding:7px;border:1px solid var(--rule);border-radius:7px;background:#fafafa;color:var(--muted);font-size:.72rem}.adm-list div{padding:2px 0;overflow-wrap:anywhere}.adm-progress{display:none;margin-top:11px;padding:9px 10px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;color:#1e40af;font-size:.77rem;white-space:pre-wrap}.adm-progress.show{display:block}.adm-bar{height:7px;margin-top:6px;overflow:hidden;border-radius:99px;background:#dbeafe}.adm-bar span{display:block;width:0;height:100%;background:linear-gradient(90deg,#2563eb,#0ea5e9)}.adm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.adm-actions button{padding:8px 16px;border:0;border-radius:7px;font-size:.8rem;font-weight:650;cursor:pointer}.adm-cancel{background:var(--bg2)}.adm-submit{background:var(--accent);color:#fff}.adm-submit:disabled{opacity:.5}@media(max-width:760px){.adm-grid,.adm-quality-grid,.adm-picks{grid-template-columns:1fr}.adm-field.full,.adm-name-guide{grid-column:auto}}';
    document.head.appendChild(s);
  }

  function createModal(){
    var old=document.getElementById('soilAdmin'); if(old)old.remove();
    var modal=document.getElementById('soilAdminImport'); if(modal)return modal;
    modal=document.createElement('div'); modal.id='soilAdminImport'; modal.className='adm-mask';
    modal.innerHTML='<div class="adm-card"><div class="adm-head"><h3>管理员导入文件</h3><button type="button" class="adm-close">×</button></div><div class="adm-grid"><div class="adm-field"><label>管理员密码</label><input id="adm-pass" type="password" autocomplete="off"></div><div class="adm-field"><label>导入类型</label><select id="adm-kind"><option value="quality">质控意见（成果栏）</option><option value="reference">参考资料</option></select></div><div id="adm-quality-fields" class="adm-quality-grid"><div class="adm-field"><label>成果类型</label><select id="adm-data-key"></select></div><div class="adm-field"><label>批次</label><select id="adm-batch"><option>管理员导入</option><option>第一批</option><option>第二批</option><option>第二批补充</option><option>第三批</option></select></div><div class="adm-field"><label>市</label><select id="adm-city"></select></div><div class="adm-field"><label>作业单位</label><select id="adm-unit"></select></div><div class="adm-field"><label>任务单元</label><select id="adm-district"></select></div><div class="adm-name-guide"><strong>上传前请规范命名</strong><span>推荐文件名：</span><span id="adm-name-example" class="adm-name-example"></span><br>系统统计以这里选择的成果类型、市、作业单位和任务单元为准；规范文件名便于后续查找和人工复核。</div></div><div class="adm-field full"><label>选择已有目录</label><select id="adm-directory"></select></div><div class="adm-field full"><label>新建子目录（可选）</label><input id="adm-new-directory" placeholder="例如：2026年第三批/补充意见"></div><div class="adm-field full"><label>选择文件</label><div class="adm-picks"><div class="adm-pick"><small>可选择多个文件或 ZIP；ZIP 会解压并保留内部层级。</small><input id="adm-files" type="file" multiple></div><div class="adm-pick"><small>可选择整个文件夹并保留内部层级。</small><input id="adm-folder" type="file" webkitdirectory directory multiple></div></div></div><div class="adm-field full"><label>待导入内容</label><div id="adm-list" class="adm-list">尚未选择文件</div></div><div class="adm-field full"><span class="adm-tip">单文件上限 95 MB；超限 PPTX 会先提示，并按连续幻灯片自动拆分。</span></div></div><div id="adm-prog" class="adm-progress"><span id="adm-text"></span><div class="adm-bar"><span id="adm-bar"></span></div></div><div class="adm-actions"><button type="button" class="adm-cancel">取消</button><button type="button" id="adm-ok" class="adm-submit">开始导入</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.adm-close').onclick=Q.close; modal.querySelector('.adm-cancel').onclick=Q.close;
    modal.onclick=function(e){if(e.target===modal)Q.close()};
    document.getElementById('adm-kind').onchange=updateMode;
    document.getElementById('adm-data-key').onchange=updateSelection;
    document.getElementById('adm-city').onchange=updateUnits;
    document.getElementById('adm-unit').onchange=updateDistricts;
    document.getElementById('adm-district').onchange=updateGuide;
    document.getElementById('adm-files').onchange=pick;
    document.getElementById('adm-folder').onchange=pick;
    return modal;
  }

  function populateTypes(){var s=document.getElementById('adm-data-key');s.innerHTML=Object.keys(Q.types()).map(function(k){return'<option value="'+A.esc(k)+'">'+A.esc(Q.types()[k])+'</option>'}).join('')}
  function populateCities(){var s=document.getElementById('adm-city');s.innerHTML=(window.masterList||[]).map(function(c){return'<option value="'+A.esc(c.city)+'">'+A.esc(c.city)+'</option>'}).join('')}
  function cityObject(){var v=document.getElementById('adm-city').value;return(window.masterList||[]).find(function(c){return c.city===v})}
  function updateUnits(){var c=cityObject(),s=document.getElementById('adm-unit');s.innerHTML=c?c.items.map(function(u){return'<option value="'+A.esc(u.unit)+'">'+A.esc(u.unit)+'</option>'}).join(''):'';updateDistricts()}
  function updateDistricts(){var c=cityObject(),n=document.getElementById('adm-unit').value,u=c&&c.items.find(function(x){return x.unit===n}),s=document.getElementById('adm-district');s.innerHTML=u?u.districts.map(function(d){return'<option value="'+A.esc(d)+'">'+A.esc(d)+'</option>'}).join(''):'';updateGuide();directories()}
  function recommended(){if(document.getElementById('adm-kind').value==='reference')return A.referenceRoot;var k=document.getElementById('adm-data-key').value,c=document.getElementById('adm-city').value||'未分类',u=document.getElementById('adm-unit').value||'未分类单位';return A.clean(Q.QUALITY_ROOT+'/'+(Q.types()[k]||k)+'/'+c+'/'+u)}
  function directories(){var kind=document.getElementById('adm-kind').value,s=document.getElementById('adm-directory'),r=Q.state.context&&Q.state.context.suggestedDirectory||recommended(),d=(A.dirs||[]).filter(function(p){return kind==='reference'?(p===A.referenceRoot||p.indexOf(A.referenceRoot+'/')===0):(p==='data'||p.indexOf('data/质控意见反馈_')===0)});if(d.indexOf(r)<0)d.unshift(r);if(kind==='reference'&&d.indexOf(A.referenceRoot)<0)d.unshift(A.referenceRoot);s.innerHTML=d.map(function(p){return'<option value="'+A.esc(p)+'">'+A.esc(p)+'</option>'}).join('');s.value=r}
  function updateGuide(){var k=document.getElementById('adm-data-key').value,c=document.getElementById('adm-city').value||'市名',d=document.getElementById('adm-district').value||'任务单元';document.getElementById('adm-name-example').textContent=(Q.types()[k]||'成果')+'成果质控意见_'+c+d+'.pdf'}
  function updateSelection(){updateGuide();directories()}
  function updateMode(){var q=document.getElementById('adm-kind').value==='quality';document.getElementById('adm-quality-fields').classList.toggle('hidden',!q);directories()}
  function pick(e){var folder=e.target.id==='adm-folder',other=document.getElementById(folder?'adm-files':'adm-folder');if(other)other.value='';Q.state.files=Array.prototype.slice.call(e.target.files||[]).map(function(f){return{file:f,path:folder?(f.webkitRelativePath||f.name):f.name}});document.getElementById('adm-list').innerHTML=Q.state.files.length?Q.state.files.slice(0,150).map(function(x){return'<div>'+A.esc(x.path)+' · '+A.size(x.file.size)+'</div>'}).join(''):'尚未选择文件'}

  Q.open=function(context){
    createModal();Q.state.context=context||{kind:'quality'};Q.state.files=[];
    document.getElementById('adm-pass').value='';document.getElementById('adm-kind').value=Q.state.context.kind||'quality';populateTypes();populateCities();
    if(Q.state.context.dataKey&&Q.types()[Q.state.context.dataKey])document.getElementById('adm-data-key').value=Q.state.context.dataKey;
    updateUnits();document.getElementById('adm-new-directory').value='';document.getElementById('adm-files').value='';document.getElementById('adm-folder').value='';document.getElementById('adm-list').textContent='尚未选择文件';Q.progress('',0,false);updateMode();document.getElementById('soilAdminImport').classList.add('show');A.loadTree(false).then(directories).catch(directories)
  };

  function install(){styles();createModal();window.openSoilAdminImport=Q.open;document.querySelectorAll('.result-admin').forEach(function(x){x.remove()})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
  setTimeout(install,500);setTimeout(install,1500);
})();
