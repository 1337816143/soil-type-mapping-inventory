(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SoilWorkCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var STORE_PATH = 'data/work-records.json';
  var FILE_ROOT = 'work-record-attachments/';
  var MAX_FILE = 39 * 1024 * 1024;
  function uid() { return 'wr-' + crypto.randomUUID(); }
  function text(v, max) {
    var s = String(v == null ? '' : v).trim();
    if (s.length > max) throw new Error('输入内容过长，请适当精简');
    return s;
  }
  function fields(source, required) {
    var s = source || {}, out = {title:text(s.title,300), time:text(s.time,40), location:text(s.location,1000),
      people:text(s.people,2000), notes:text(s.notes,20000)};
    if (required && (!out.title || !out.time)) throw new Error('请填写事项和时间');
    if (out.time && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(out.time)) throw new Error('时间格式不正确');
    return out;
  }
  function store(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.records)) throw new Error('工作记录数据格式异常，已停止操作以保护原数据');
    var ids = new Set();
    value.records.forEach(function (r) {
      if (!r || !/^wr-[a-zA-Z0-9-]+$/.test(r.id) || ids.has(r.id) || !Number.isInteger(r.revision) || r.revision < 1) throw new Error('工作记录索引异常，请刷新后重试');
      ids.add(r.id);
    });
    return value;
  }
  function safeName(name) {
    return String(name || '附件').replace(/[\\/\u0000-\u001f:*?"<>|]/g, '_').replace(/^\.+/, '_').slice(0,180);
  }
  function isImage(name) { return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(String(name || '')); }
  function query(records, term, from, until) {
    var tokens = String(term || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return (records || []).filter(function (r) {
      if (r.deletedAt) return false;
      var day = String(r.time || '').slice(0,10);
      if ((from && day < from) || (until && day > until)) return false;
      var hay = [r.title,r.time,r.location,r.people,r.notes].concat((r.attachments || []).map(function (a) { return a.name; })).join(' ').toLocaleLowerCase();
      return tokens.every(function (t) { return hay.indexOf(t) >= 0; });
    }).sort(function (a,b) { return String(b.time).localeCompare(String(a.time)) || String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  }
  function draft(value) {
    // Credentials and temporary edit authorization never enter a saved draft.
    return {id:String(value.id), recordId:value.recordId || null, baseRevision:value.baseRevision == null ? null : +value.baseRevision,
      fields:fields(value.fields,false), attachments:(value.attachments || []).map(function (a) { return {id:a.id,name:a.name,path:a.path,size:a.size,type:a.type}; }),
      files:(value.files || []).map(function (f) { return {id:f.id,file:f.file}; }), updatedAt:new Date().toISOString()};
  }
  function draftsDB() {
    return new Promise(function (resolve,reject) {
      var req = indexedDB.open('soil-work-record-drafts',2);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts',{keyPath:'id'});
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files',{keyPath:'id'});
      };
      req.onsuccess = function () {
        req.result.onversionchange = function () { req.result.close(); };
        resolve(req.result);
      };
      req.onerror = function () { reject(req.error || new Error('当前浏览器不支持草稿暂存')); };
      req.onblocked = function () { reject(new Error('草稿数据库正在另一标签页更新，请关闭旧编辑页后重试')); };
    });
  }
  async function transaction(stores, mode, action) {
    var db = await draftsDB();
    try {
      return await new Promise(function (resolve,reject) {
        var tx = db.transaction(stores,mode), result, failure;
        tx.oncomplete = function () { resolve(result); };
        tx.onabort = tx.onerror = function () {
          var e = failure || tx.error;
          reject(new Error('草稿暂存失败' + (e ? '（'+e.name+'：'+e.message+'）' : '，请检查设备存储空间与浏览器权限')));
        };
        try { action(tx, function (v) { result=v; }); }
        catch(e) { failure=e; try { tx.abort(); } catch(ignore) { reject(e); } }
      });
    } finally { db.close(); }
  }
  async function putDraft(value) {
    var d = draft(value);
    // Some WebKit versions fail to persist a file-backed Blob. Store plain bytes
    // separately, and only write each attachment once. Typing saves metadata only.
    var existing = await transaction(['files'],'readonly',function(tx,done) {
      var req=tx.objectStore('files').getAllKeys();req.onsuccess=function(){done(req.result);};
    });
    var known = new Set(existing), pending=[];
    for (var i=0;i<d.files.length;i++) {
      var entry=d.files[i], f=entry.file;
      if (!f || typeof f.arrayBuffer !== 'function') throw new Error('草稿附件无法读取；现有草稿未被覆盖');
      if (!known.has(entry.id)) pending.push({id:entry.id,name:f.name,type:f.type,lastModified:f.lastModified,bytes:await f.arrayBuffer()});
    }
    d.files=d.files.map(function(f){return {id:f.id,persisted:true};});
    return transaction(['drafts','files'],'readwrite',function(tx) {
      pending.forEach(function(f){tx.objectStore('files').put(f);});
      tx.objectStore('drafts').put(d);
    });
  }
  async function listDrafts() {
    var list=await transaction(['drafts'],'readonly',function(tx,done){var req=tx.objectStore('drafts').getAll();req.onsuccess=function(){done(req.result);};});
    return transaction(['files'],'readonly',function(tx,done) {
      done(list);
      list.forEach(function(d){(d.files||[]).forEach(function(entry){
        if (entry.file) return; // Read older draft schema without losing its files.
        var req=tx.objectStore('files').get(entry.id);
        req.onsuccess=function(){
          var f=req.result;
          if(f)entry.file=new File([f.bytes],f.name,{type:f.type||'',lastModified:f.lastModified||0});
          else entry.missing=true;
        };
      });});
    });
  }
  async function removeDraft(id) {
    return transaction(['drafts','files'],'readwrite',function(tx) {
      var ds=tx.objectStore('drafts'),req=ds.getAll();
      req.onsuccess=function(){
        var rows=req.result,kept=new Set();
        rows.filter(function(d){return d.id!==id;}).forEach(function(d){(d.files||[]).forEach(function(f){kept.add(f.id);});});
        rows.filter(function(d){return d.id===id;}).forEach(function(d){(d.files||[]).forEach(function(f){if(!kept.has(f.id))tx.objectStore('files').delete(f.id);});});
        ds.delete(id);
      };
    });
  }
  var drafts = {put:putDraft,remove:removeDraft,list:listDrafts};
  function encodeBlob(file) {
    return new Promise(function (resolve,reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取附件失败：' + file.name)); };
      reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
      reader.readAsDataURL(file);
    });
  }
  function decodeContent(content) {
    var bytes = Uint8Array.from(atob(String(content).replace(/\s+/g,'')),function (c) { return c.charCodeAt(0); });
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  // Each operation snapshots credentials; it never changes the global upload token or transport.
  function client() {
    var current = String(globalThis.SOIL_GITHUB_UPLOAD_TOKEN || globalThis.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN || '').trim();
    var fallback = String(globalThis.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN || '').trim();
    return async function request(path, options) {
      options = options || {};
      if (!current) throw new Error('未配置上传凭证，请联系管理员');
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); },180000);
      try {
        var response = await fetch('https://api.github.com/repos/1337816143/soil-type-mapping-inventory' + path, {
          method:options.method || 'GET', cache:'no-store', signal:controller.signal,
          headers:{Authorization:'Bearer ' + current,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
          body:options.body ? JSON.stringify(options.body) : undefined
        });
        var data = await response.json();
        if (!response.ok) {
          if (response.status === 401 && fallback && current !== fallback) { current = fallback; return request(path,options); }
          var error = new Error(response.status === 401 ? 'GitHub 拒绝了本次凭证；草稿已保留，内置 Token 未修改。' : (data.message || 'GitHub 请求失败'));
          error.status = response.status; throw error;
        }
        return data;
      } finally { clearTimeout(timer); }
    };
  }
  async function snapshot(request) {
    var ref = await request('/git/ref/heads/main');
    var head = ref.object.sha;
    var commit = await request('/git/commits/' + head);
    var contents = await request('/contents/' + STORE_PATH + '?ref=' + head);
    return {head:head,tree:commit.tree.sha,data:store(decodeContent(contents.content))};
  }
  function prepareRecord(input, existing, now) {
    if (input.operation === 'delete') return Object.assign({},existing,{deletedAt:now,updatedAt:now,revision:existing.revision+1});
    return Object.assign({id:input.id},fields(input.fields,true),{attachments:input.attachments || [],revision:existing ? existing.revision+1 : 1,
      createdAt:existing ? existing.createdAt : now,updatedAt:now});
  }
  async function save(input, dependencies) {
    var deps = dependencies || {}, request = deps.request || client(), encode = deps.encode || encodeBlob;
    var progress = deps.progress || function () {};
    if (!/^wr-[a-zA-Z0-9-]+$/.test(input.id)) throw new Error('工作记录编号无效');
    if (input.operation !== 'save' && input.operation !== 'delete') throw new Error('未知工作记录操作');
    if ((input.baseRevision != null || input.operation === 'delete') && !input.authorized) throw new Error('修改或删除已保存记录需要管理员验证');
    if (input.operation === 'save') fields(input.fields,true);
    var files = input.files || [];
    if (files.length + (input.attachments || []).length > 30) throw new Error('单条记录最多保留30个附件');
    files.forEach(function (entry) {
      if (!entry.file || entry.file.size <= 0 || entry.file.size > MAX_FILE) throw new Error('每个附件须为非空文件且不超过39 MiB；草稿将保留');
    });
    (input.attachments || []).forEach(function (a) {
      if (!a.path || !a.path.startsWith(FILE_ROOT + input.id + '/') || a.path.split('/').includes('..')) throw new Error('附件路径无效');
    });
    var now = new Date().toISOString(), blobEntries = [], attachments = (input.attachments || []).slice();
    function check(snap) {
      var r = snap.data.records.find(function (x) { return x.id === input.id; });
      if (input.baseRevision == null ? !!r : (!r || r.deletedAt || r.revision !== input.baseRevision)) throw new Error('这条记录已在其他设备被修改或删除。草稿已保留，请刷新后核对再保存。');
      return r;
    }
    progress('正在核对工作记录版本…',3);
    var first = await snapshot(request); check(first);
    for (var i=0;i<files.length;i++) {
      var file = files[i].file, name = safeName(file.name), path = FILE_ROOT + input.id + '/' + uid() + '/' + name;
      progress('正在读取并上传附件 ' + (i+1) + '/' + files.length + '：' + name,8 + Math.round(i/Math.max(1,files.length)*65));
      var created = await request('/git/blobs',{method:'POST',body:{encoding:'base64',content:await encode(file)}});
      blobEntries.push({path:path,mode:'100644',type:'blob',sha:created.sha});
      attachments.push({id:uid(),name:name,path:path,size:file.size,type:file.type || ''});
    }
    input = Object.assign({},input,{attachments:attachments});
    for (var attempt=0;attempt<3;attempt++) {
      var snap = attempt ? await snapshot(request) : first;
      var existing = check(snap), result = prepareRecord(input,existing,now);
      var records = snap.data.records.filter(function (r) { return r.id !== input.id; }).concat([result]);
      var data = {schemaVersion:1,records:records};
      progress('正在原子保存记录及附件索引…',80);
      var tree = await request('/git/trees',{method:'POST',body:{base_tree:snap.tree,tree:blobEntries.concat([{path:STORE_PATH,mode:'100644',type:'blob',content:JSON.stringify(data,null,2)+'\n'}])}});
      var commit = await request('/git/commits',{method:'POST',body:{message:'docs: '+(input.operation === 'delete'?'delete':'save')+' work record '+input.id,tree:tree.sha,parents:[snap.head]}});
      try {
        await request('/git/refs/heads/main',{method:'PATCH',body:{sha:commit.sha,force:false}});
        progress('工作记录已保存。上传成功！稍等3~5分钟刷新网站即可查看新上传的文件。',100);
        return {data:data,record:result,commit:commit.sha};
      } catch (error) {
        if (![409,422].includes(error.status) || attempt === 2) throw error;
        progress('其他成员刚刚提交了内容，正在合并最新版本…',85);
      }
    }
  }
  return {storePath:STORE_PATH,fileRoot:FILE_ROOT,maxFile:MAX_FILE,uid:uid,fields:fields,store:store,safeName:safeName,isImage:isImage,
    query:query,draft:draft,drafts:drafts,save:save,client:client};
});
