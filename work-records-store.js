(function () {
  'use strict';
  if (window.SoilWorkRecordsStore) return;
  var C = window.SoilWorkRecordsCore;
  var REPO = '1337816143/soil-type-mapping-inventory';
  var API = 'https://api.github.com/repos/' + REPO;
  var INDEX = 'data/work-records/index.json';
  var STAGE = '.work-records-upload';
  var LIMIT = 39 * 1024 * 1024;
  var dbPromise;
  function raw(path) { return 'https://raw.githubusercontent.com/' + REPO + '/main/' + path.split('/').map(encodeURIComponent).join('/'); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r,ms); }); }
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve,reject) {
      var req = indexedDB.open('soil-work-record-drafts-v1',1);
      req.onupgradeneeded = function () { req.result.createObjectStore('drafts',{keyPath:'key'}); };
      req.onsuccess = function () { req.result.onversionchange = function () { req.result.close(); dbPromise=null; }; resolve(req.result); };
      req.onerror = function () { dbPromise=null; reject(new Error('此浏览器暂存存储不可用，请勿关闭未保存记录。')); };
      req.onblocked = function () { dbPromise=null; reject(new Error('请关闭此网站的其他旧标签页后再暂存。')); };
    });
    return dbPromise;
  }
  async function drafts(action, value) {
    var db = await openDb();
    return new Promise(function (resolve,reject) {
      var tx = db.transaction('drafts', action === 'list' ? 'readonly' : 'readwrite');
      var store = tx.objectStore('drafts'), req;
      if (action === 'list') req=store.getAll();
      else if (action === 'put') req=store.put(value);
      else req=store.delete(value);
      tx.oncomplete=function () { resolve(req.result); };
      tx.onerror=tx.onabort=function () { reject(new Error('暂存未完成（存储空间不足或浏览器限制）。请保持页面打开并重试。')); };
    });
  }
  async function request(path, options, token, timeout) {
    var controller = new AbortController(), timer=setTimeout(function () { controller.abort(); },timeout||120000);
    options=options||{};
    try {
      var response=await fetch(API+path,{method:options.method||'GET',body:options.body ? JSON.stringify(options.body) : undefined,cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}});
      var text=await response.text(), data={};
      try { data=text ? JSON.parse(text) : {}; } catch (_) {}
      if (!response.ok) { var e=new Error((response.status===401 ? 'GitHub 拒绝本次上传凭证；内置凭证未改动。' : data.message || '请求失败')+'（HTTP '+response.status+'）'); e.status=response.status; throw e; }
      return data;
    } catch (e) { if (e.name==='AbortError') throw new Error('网络请求超时，请保留草稿并稍后重试。'); throw e; }
    finally { clearTimeout(timer); }
  }
  async function credential() {
    var tokens=[window.SOIL_GITHUB_UPLOAD_TOKEN,window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN].map(function (v) { return String(v||'').trim(); }).filter(function (v,i,a) { return v && a.indexOf(v)===i; });
    var error;
    for (var i=0;i<tokens.length;i++) {
      try { await request('/git/ref/heads/main',{},tokens[i],20000); return tokens[i]; }
      catch (e) { error=e; if (e.status!==401) throw e; }
    }
    throw error || new Error('尚无可用的上传凭证，请通过现有凭证设置更新。');
  }
  async function load() {
    var urls=[raw(INDEX)+'?t='+Date.now(),'./'+INDEX+'?t='+Date.now()];
    var error;
    for (var i=0;i<urls.length;i++) {
      var controller=new AbortController(),timer=setTimeout(function () { controller.abort(); },15000);
      try { var r=await fetch(urls[i],{cache:'no-store',signal:controller.signal}); if(!r.ok)throw new Error('HTTP '+r.status); var data=await r.json(); if(data.schemaVersion!==1||!Array.isArray(data.records))throw new Error('工作记录索引格式错误'); return data.records; }
      catch(e){error=e;} finally{clearTimeout(timer);}
    }
    throw new Error('工作记录读取失败，请点击刷新重试；现有草稿不受影响。'+(error ? ' '+error.message : ''));
  }
  function base64(buffer) {
    var bytes=new Uint8Array(buffer),s='';
    for(var i=0;i<bytes.length;i+=16384)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));
    return btoa(s);
  }
  async function poll(operation, onProgress, token, seconds) {
    token=token||await credential();
    var start=Date.now(),limit=(seconds||240)*1000;
    while(Date.now()-start<limit) {
      try {
        var result=await request('/contents/data/work-records/receipts/'+operation.id+'.json?ref=main',{},token,20000);
        var text=new TextDecoder().decode(Uint8Array.from(atob(String(result.content).replace(/\s/g,'')),function(c){return c.charCodeAt(0);}));
        var receipt=JSON.parse(text);
        if(receipt.status==='success') return {pending:false,receipt:receipt};
        throw new Error(receipt.message||'保存被拒绝');
      } catch(e) { if(e.status!==404) throw e; }
      onProgress('附件已暂存，正在等待仓库校验与保存（'+Math.round((Date.now()-start)/1000)+'秒）…',96);
      // A failed workflow must not masquerade as a completed save.
      if(Date.now()-start>12000) {
        try {
          var runs=await request('/actions/workflows/import-work-records.yml/runs?branch='+encodeURIComponent(operation.branch)+'&per_page=1',{},token,15000);
          var run=runs.workflow_runs&&runs.workflow_runs[0];
          if(run&&run.status==='completed'&&run.conclusion!=='success') throw new Error('仓库保存校验未通过，可能有其他人修改了这条记录。草稿已保留。请刷新工作记录并核对后再保存。');
        } catch(e) { if(!e.status)throw e; }
      }
      await sleep(3000);
    }
    return {pending:true,operation:operation};
  }
  async function submit(draft, action, onProgress, onStaged) {
    var record=C.normalize(draft.record),files=draft.files||[];
    if(action!=='delete') C.validate(record);
    var token=await credential(); // Freeze for this operation. Never mutate global credentials.
    var opId='op-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
    var branch='work-records-upload-'+opId;
    var head=await request('/git/ref/heads/main',{},token);
    var commit=await request('/git/commits/'+head.object.sha,{},token);
    var entries=[],manifest={schemaVersion:1,id:opId,action:action,record:record,baseRevision:Number(draft.baseRevision||0),createdAt:new Date().toISOString(),files:[]};
    var total=files.reduce(function(s,x){return s+x.file.size;},0)||1,done=0;
    for(var i=0;i<files.length;i++) {
      var item=files[i]; C.validateFile(item.file);
      var attachment=record.attachments.find(function(a){return a.id===item.id;});
      if(!attachment)continue;
      var descriptor={id:item.id,name:item.file.name,size:item.file.size,path:attachment.path,chunks:[]};
      for(var offset=0,index=0;offset<item.file.size;offset+=LIMIT,index++) {
        onProgress('读取附件 '+(i+1)+' / '+files.length+'：'+item.file.name,4+Math.round(done/total*75));
        var buffer=await item.file.slice(offset,offset+LIMIT).arrayBuffer();
        var content=base64(buffer); await sleep(0);
        onProgress('上传附件 '+(i+1)+' / '+files.length+'（分段 '+(index+1)+'，等待 GitHub 确认）',6+Math.round(done/total*75));
        var blob=await request('/git/blobs',{method:'POST',body:{content:content,encoding:'base64'}},token,240000);
        content=null;
        var path=STAGE+'/'+opId+'/'+item.id+'/'+index+'.bin';
        entries.push({path:path,mode:'100644',type:'blob',sha:blob.sha});
        descriptor.chunks.push({path:path,size:buffer.byteLength});
        done+=buffer.byteLength; buffer=null;
      }
      manifest.files.push(descriptor);
    }
    onProgress('正在提交工作记录和附件清单…',85);
    entries.push({path:STAGE+'/ready.json',mode:'100644',type:'blob',content:JSON.stringify(manifest)});
    var tree=await request('/git/trees',{method:'POST',body:{base_tree:commit.tree.sha,tree:entries}},token);
    var created=await request('/git/commits',{method:'POST',body:{message:'work-records: '+action+' '+record.id,tree:tree.sha,parents:[head.object.sha]}},token);
    // Creating the ref at the ready commit emits a single push, not a click replay.
    await request('/git/refs',{method:'POST',body:{ref:'refs/heads/'+branch,sha:created.sha}},token);
    var operation={id:opId,branch:branch,recordId:record.id,action:action};
    await onStaged(operation);
    return poll(operation,onProgress,token);
  }
  window.SoilWorkRecordsStore={load:load,submit:submit,poll:poll,raw:raw,drafts:drafts,indexPath:INDEX};
})();
