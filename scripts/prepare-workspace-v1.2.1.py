"""One-off bounded patch: only run on the reviewed v1.2.0 baseline."""
from pathlib import Path
import re, subprocess
assert Path('VERSION').read_text().strip() == 'v1.2.0'
token_before=re.search(r'var tokenCodes = \[[^\]]+\]',Path('upload-config.js').read_text()).group(0)
def patch(file, old, new):
    p=Path(file);s=p.read_text()
    assert s.count(old)==1, f'{file}: ambiguous or missing patch anchor'
    p.write_text(s.replace(old,new))
patch('work-records-core.js',"""      tx.objectStore('drafts').put(d);
    });
  }
  async function listDrafts() {
    var list=await transaction(['drafts'],'readonly',function(tx,done){var req=tx.objectStore('drafts').getAll();req.onsuccess=function(){done(req.result);};});
    return transaction(['files'],'readonly',function(tx,done) {""", """      var ds=tx.objectStore('drafts');
      ds.put(d);
      // Metadata and garbage collection share a transaction: retain every file
      // referenced by any draft, including drafts edited in another browser tab.
      var all=ds.getAll();
      all.onsuccess=function(){
        var kept=new Set();
        all.result.forEach(function(row){(row.files||[]).forEach(function(f){kept.add(f.id);});});
        var cursor=tx.objectStore('files').openKeyCursor();
        cursor.onsuccess=function(){var c=cursor.result;if(c){if(!kept.has(c.key))tx.objectStore('files').delete(c.key);c.continue();}};
      };
    });
  }
  async function listDrafts(options) {
    var list=await transaction(['drafts'],'readonly',function(tx,done){var req=tx.objectStore('drafts').getAll();req.onsuccess=function(){done(req.result);};});
    return options && options.metadataOnly ? list : hydrateDrafts(list);
  }
  async function getDraft(id) {
    var row=await transaction(['drafts'],'readonly',function(tx,done){var req=tx.objectStore('drafts').get(id);req.onsuccess=function(){done(req.result);};});
    return row ? (await hydrateDrafts([row]))[0] : null;
  }
  async function hydrateDrafts(list) {
    return transaction(['files'],'readonly',function(tx,done) {""")
patch('work-records-core.js',"var drafts = {put:putDraft,remove:removeDraft,list:listDrafts};", "var drafts = {put:putDraft,remove:removeDraft,list:listDrafts,get:getDraft};")
patch('work-records.js',"var objects = new Map(), overlayCount = 0, priorOverflow = '';", "var objects = new Map(), overlayCount = 0, priorOverflow = '';\n  var openingEditor = false, dataEpoch = 0;")
patch('work-records.js',"""    if(!matches.length){var empty=el('div','wr-empty');empty.append(el('strong','',loaded?'从一条工作记录开始':'正在读取工作记录…'),el('span','',loaded?'记录检查、会议、培训与现场工作，材料与事项放在一起。':''));list.append(empty);}""", """    if(!matches.length){
      var filtered=!!(panel.querySelector('#wr-search').value.trim()||panel.querySelector('#wr-from').value||panel.querySelector('#wr-until').value),empty=el('div','wr-empty');
      empty.append(el('strong','',loaded?(filtered?'没有找到匹配的工作记录':'从一条工作记录开始'):'正在读取工作记录…'),el('span','',loaded?(filtered?'请调整关键词或日期范围；已有记录没有被删除。':'记录检查、会议、培训与现场工作，材料与事项放在一起。'):''));
      if(loaded&&filtered)empty.append(button('清除筛选','',function(){['#wr-search','#wr-from','#wr-until'].forEach(function(s){panel.querySelector(s).value='';});page=1;render();}));
      list.append(empty);
    }""")
patch('work-records.js',"if(loading)return;loading=true;notify('正在同步工作记录…');", "if(loading)return;loading=true;var epoch=dataEpoch;notify('正在同步工作记录…');")
patch('work-records.js',"data=C.store(await response.json());loaded=true;notify('已同步 · '+C.query(data.records).length+' 条记录');render();", "var incoming=C.store(await response.json());if(epoch!==dataEpoch)return;data=incoming;loaded=true;notify('已同步 · '+C.query(data.records).length+' 条记录');render();")
patch('work-records.js',"catch(e){notify('同步未完成：'+e.message+'。已有显示内容未清除。',true);}", "catch(e){if(epoch===dataEpoch)notify('同步未完成：'+e.message+'。已有显示内容未清除。',true);}")
patch('work-records.js',"var drafts=await C.drafts.list(),host=", "var drafts=await C.drafts.list({metadataOnly:true}),host=")
patch('work-records.js',"button('继续编辑','',function(){startEditor(null,d);})", "button('继续编辑','',async function(){try{var restored=await C.drafts.get(d.id);if(restored)await startEditor(null,restored);else{notify('这份草稿已在另一标签页移除，请刷新草稿列表。',true);renderDrafts();}}catch(e){notify('草稿读取失败：'+e.message,true);}})")
patch('work-records.js',"""    if(!editor||editor.busy)return;
    try{await persist();}catch(e){if(!confirm('本机暂存失败。仍然关闭会丢失未保存内容，确定关闭？'))return;}
    var m=editor.modal;editor=null;clearTimeout(draftTimer);m.dispose();objects.forEach(function(u){URL.revokeObjectURL(u);});objects.clear();renderDrafts();""", """    if(!editor||editor.busy)return;
    var state=editor;
    // Close is a single-flight operation too; freeze inputs before the first await.
    state.busy=true;state.modal.box.querySelectorAll('button,input,textarea').forEach(function(n){n.disabled=true;});
    try{
      try{await persist();}catch(e){if(!confirm('本机暂存失败。仍然关闭会丢失未保存内容，确定关闭？'))return;}
      editor=null;clearTimeout(draftTimer);state.modal.dispose();objects.forEach(function(u){URL.revokeObjectURL(u);});objects.clear();renderDrafts();
    }finally{if(editor===state){state.busy=false;state.modal.box.querySelectorAll('button,input,textarea').forEach(function(n){n.disabled=false;});}}""")
patch('work-records.js',"""    if(editor)return;
    if(resume&&""", """    if(editor||openingEditor)return;
    if(resume&&""")
patch('work-records.js',"""    var permitted=savedId?await authorize('修改'):false;
    if(savedId&&!permitted)return;""", """    var permitted=false;openingEditor=true;
    try{permitted=savedId?await authorize('修改'):false;}finally{openingEditor=false;}
    if((savedId&&!permitted)||editor)return;""")
patch('work-records.js',"data=result.data;loaded=true;", "dataEpoch++;data=result.data;loaded=true;")
patch('work-records.js',"data=result.data;render();notify('工作记录已删除。", "dataEpoch++;data=result.data;render();notify('工作记录已删除。")
patch('scripts/validate-workspace.js',"file+'?v=1.2.0'", "file+'?v='+fs.readFileSync('VERSION','utf8').trim().slice(1)")
patch('scripts/test-workspace-browser.py',"class Handler(http.server.SimpleHTTPRequestHandler):", "VERSION=(ROOT/'VERSION').read_text().strip()\nHARNESS=HARNESS.replace('v1.2.0',VERSION)\nBOOT=BOOT.replace('v1.2.0',VERSION)\nclass Handler(http.server.SimpleHTTPRequestHandler):")
patch('scripts/test-workspace-browser.py',"""            page.locator('#wr-new').click()
            page.locator('#wr-field-title').fill""", """            # Draft metadata lists must not hydrate every attachment; orphan cleanup
            # must preserve files still referenced by another draft.
            page.evaluate('''async()=>{
              const C=SoilWorkCore, file={id:'shared-test',file:new File(['bytes'],'keep.txt',{type:'text/plain'})};
              const a={id:'gc-a',fields:{title:'a'},files:[file]},b={id:'gc-b',fields:{title:'b'},files:[file]};
              await C.drafts.put(a);await C.drafts.put(b);
              const metadata=await C.drafts.list({metadataOnly:true});
              if(metadata.some(d=>d.files.some(f=>f.file)))throw Error('Metadata hydrated attachment bytes');
              a.files=[];await C.drafts.put(a);
              if(await (await C.drafts.get('gc-b')).files[0].file.text()!=='bytes')throw Error('Shared attachment was lost');
              b.files=[];await C.drafts.put(b);
              const count=await new Promise((resolve,reject)=>{const r=indexedDB.open('soil-work-record-drafts',2);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('files'),q=tx.objectStore('files').count();q.onsuccess=()=>resolve(q.result);tx.oncomplete=()=>db.close();};});
              if(count!==0)throw Error('Removed attachment bytes were not collected');
              await C.drafts.remove('gc-a');await C.drafts.remove('gc-b');
            }''')
            page.locator('#wr-new').click()
            page.locator('#wr-field-title').fill""")
patch('scripts/test-workspace-browser.py',"page.get_by_role('button',name='暂存并关闭',exact=True).click();", "page.get_by_role('button',name='暂存并关闭',exact=True).evaluate('(b)=>{b.click();b.click();}');")
patch('scripts/test-workspace-browser.py',"page.locator('#wr-search').fill('不存在的检索');expect(page.locator('.wr-table')).to_have_count(0)", "page.locator('#wr-search').fill('不存在的检索');expect(page.locator('.wr-table')).to_have_count(0)\n            expect(page.locator('.wr-empty')).to_contain_text('没有找到匹配的工作记录')")
patch('scripts/test-workspace-browser.py',"page.get_by_role('button',name='编辑',exact=True).click();expect(page.locator('#wr-auth-password')).to_be_visible()", """# Hold a stale refresh response while an edit commits, then release it.
            page.evaluate('''()=>{const native=window.fetch;window.releaseStaleRefresh=null;window.fetch=(url,options)=>String(url).includes('raw.githubusercontent.com')&&String(url).includes('data/work-records.json')?new Promise(resolve=>{window.releaseStaleRefresh=()=>{window.fetch=native;resolve(new Response(JSON.stringify({schemaVersion:1,records:[]})));};}):native(url,options);void SoilWorkRecords.refresh(true);}''')
            page.get_by_role('button',name='编辑',exact=True).evaluate('(b)=>{b.click();b.click();}');expect(page.locator('.wr-auth')).to_have_count(1);expect(page.locator('#wr-auth-password')).to_be_visible()""")
patch('scripts/test-workspace-browser.py',"""            assert remote['records'][0]['revision']==2
            page.get_by_role('button',name='删除',exact=True).click();""", """            assert remote['records'][0]['revision']==2
            page.evaluate('window.releaseStaleRefresh()');page.wait_for_timeout(100)
            expect(page.locator('.wr-record')).to_have_count(1);expect(page.locator('.wr-record')).to_contain_text('保定 · 现场')
            page.get_by_role('button',name='删除',exact=True).click();""")
patch('scripts/test-workspace-browser.py',"single-flight save, search/table,", "single-flight save/close/authorization, attachment garbage collection, metadata-only draft listing, stale-refresh protection, search/table,")
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert token_before==re.search(r'var tokenCodes = \[[^\]]+\]',Path('upload-config.js').read_text()).group(0), 'Credential changed'
p=Path('CHANGELOG.md');s=p.read_text();p.write_text(s.replace('# Changelog\n','# Changelog\n\n## v1.2.1 — 2026-09-19\n\n- 工作记录编辑窗口增加连续点击保护：关闭和管理员验证期间不会重复创建窗口或重复关闭。\n- 草稿附件移除后在同一事务清理无引用字节，保留其他草稿仍在使用的附件；列表只加载草稿元数据，继续编辑时按需恢复附件，减少内存占用。\n- 刷新与正式保存/删除同时发生时，迟到的旧响应不会覆盖刚保存的显示结果。\n- 搜索无结果与真正没有工作记录分别提示，并支持一键清除筛选。\n- 增补 Chromium/WebKit 回归用例；版本断言跟随 VERSION，内置凭证字节、历史质控文件和答复逻辑不变。\n',1))
print('Prepared v1.2.1; embedded credential bytes unchanged.')
