(function () {
  'use strict';

  if (window.__soilAdminDeleteInstalled) return;
  window.__soilAdminDeleteInstalled = true;

  var OWNER = '1337816143';
  var REPO = 'soil-type-mapping-inventory';
  var BRANCH = 'main';
  var API_ROOT = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
  var REFERENCE_ROOT = 'reference-files/third-soil-survey/';
  var QUALITY_ROOT = 'data/质控意见反馈_管理员导入/';
  var INDEX_PATH = 'data/admin-import-index.json';
  var REPLY_ROOT = 'replies/';
  var state = {items:[], filtered:[], index:[], busy:false, context:null};

  function A() { return window.SoilRepoAdmin || {}; }
  function Q() { return window.SoilAdminImport || {}; }
  function token() { return String(window.SOIL_GITHUB_UPLOAD_TOKEN || '').trim(); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function size(bytes) {
    if (A().size) return A().size(bytes || 0);
    return bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(2) + ' MB';
  }
  function base(path) { return String(path || '').slice(String(path || '').lastIndexOf('/') + 1); }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function request(path, options) {
    options = options || {};
    var headers = Object.assign({
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, options.headers || {});
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(API_ROOT + path, Object.assign({}, options, {cache:'no-store', headers:headers})).then(function (response) {
      return response.text().then(function (text) {
        var data = {};
        if (text) {
          try { data = JSON.parse(text); } catch (error) { data = {message:text}; }
        }
        if (!response.ok) {
          var failure = new Error(data.message || ('GitHub API ' + response.status));
          failure.status = response.status;
          throw failure;
        }
        return data;
      });
    });
  }

  function ensureToken() {
    function validate() {
      if (!token()) return Promise.reject(new Error('尚未设置 GitHub 上传凭证。'));
      return fetch('https://api.github.com/user', {
        cache:'no-store',
        headers:{Authorization:'Bearer ' + token(), Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'}
      }).then(function (response) {
        if (!response.ok) throw new Error('GitHub 凭证校验失败：HTTP ' + response.status);
        return token();
      });
    }
    return validate().catch(function (error) {
      if (typeof window.openSoilCredentialDialog !== 'function') throw error;
      return window.openSoilCredentialDialog().then(validate);
    });
  }

  function typeLabel(type) {
    return type === 'quality' ? '质控意见' : type === 'reply' ? '整改答复' : '参考文件';
  }

  function replyMeta(filename) {
    var batch = filename.match(/^(.+)_批次-(.+)_整改答复_([0-9]+)\.([a-z0-9]+)$/i);
    if (batch) return batch[1] + '｜批次：' + batch[2];
    return '整改答复文件';
  }

  function normalizeIndex(entries) {
    return (Array.isArray(entries) ? entries : []).filter(function (entry) {
      return entry && entry.kind === 'quality-control' && entry.path;
    });
  }

  function fetchIndex() {
    return fetch('https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/' + BRANCH + '/' + INDEX_PATH + '?_=' + Date.now(), {cache:'no-store'})
      .then(function (response) { return response.ok ? response.json() : []; })
      .catch(function () { return []; });
  }

  function buildItems(tree, index) {
    var blobs = (tree || []).filter(function (entry) { return entry && entry.type === 'blob' && entry.path; });
    var existing = {};
    blobs.forEach(function (entry) { existing[entry.path] = entry; });
    var items = [];
    var seen = {};

    blobs.forEach(function (entry) {
      var type = '';
      if (entry.path.indexOf(REFERENCE_ROOT) === 0 && !/(^|\/)(README\.md|manifest\.json|archive\.json)$/i.test(entry.path)) type = 'reference';
      else if (entry.path.indexOf(REPLY_ROOT) === 0) type = 'reply';
      else if (entry.path.indexOf(QUALITY_ROOT) === 0) type = 'quality';
      if (!type) return;
      seen[entry.path] = true;
      var record = index.find(function (item) { return item.path === entry.path; });
      var title = base(entry.path);
      var meta = entry.path;
      if (type === 'quality' && record) {
        meta = [record.dataKey, record.city, record.unit, record.district, record.batch].filter(Boolean).join('｜');
      } else if (type === 'reply') {
        meta = replyMeta(title);
      } else if (type === 'reference') {
        meta = entry.path.slice(REFERENCE_ROOT.length);
      }
      items.push({type:type, path:entry.path, title:title, meta:meta, size:entry.size || 0, indexed:!!record});
    });

    index.forEach(function (record) {
      if (seen[record.path] || !record.path) return;
      items.push({
        type:'quality', path:record.path, title:base(record.path), size:0, indexed:true, missing:true,
        meta:[record.dataKey, record.city, record.unit, record.district, record.batch, '索引存在但仓库文件缺失'].filter(Boolean).join('｜')
      });
    });

    var order = {quality:0, reply:1, reference:2};
    items.sort(function (left, right) {
      return order[left.type] - order[right.type] || left.path.localeCompare(right.path, 'zh-CN');
    });
    return items;
  }

  function styles() {
    if (document.getElementById('admin-delete-style')) return;
    var style = document.createElement('style');
    style.id = 'admin-delete-style';
    style.textContent =
      '.admin-delete-trigger{border-color:#fca5a5!important;background:#fff7f7!important;color:#b91c1c!important}' +
      '.delete-mask{display:none;position:fixed;inset:0;z-index:17000;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.58)}' +
      '.delete-mask.show{display:flex}.delete-card{width:min(920px,97vw);max-height:92vh;overflow:auto;padding:20px;background:#fff;border-radius:12px;box-shadow:0 24px 72px rgba(0,0,0,.28)}' +
      '.delete-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.delete-head h3{margin:0;color:#991b1b}.delete-close{border:0;background:none;font-size:1.45rem;cursor:pointer}' +
      '.delete-warning{margin:10px 0;padding:9px 11px;border:1px solid #fecaca;border-radius:8px;background:#fff7f7;color:#991b1b;font-size:.76rem;line-height:1.55}' +
      '.delete-filters{display:grid;grid-template-columns:160px minmax(220px,1fr) 160px;gap:8px;align-items:center}.delete-filters select,.delete-filters input{padding:8px 9px;border:1px solid #cbd5e1;border-radius:7px;font:inherit;font-size:.8rem}' +
      '.delete-list{margin-top:10px;max-height:410px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px}.delete-row{display:grid;grid-template-columns:28px 90px minmax(0,1fr) 90px;gap:8px;align-items:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:.76rem}.delete-row:last-child{border-bottom:0}.delete-row.missing{background:#fffbeb}.delete-type{font-weight:750;color:#475569}.delete-title{font-weight:650;overflow-wrap:anywhere}.delete-meta{margin-top:2px;color:#64748b;font-size:.69rem;overflow-wrap:anywhere}.delete-size{text-align:right;color:#64748b}.delete-empty{padding:28px;text-align:center;color:#64748b}' +
      '.delete-footer{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:12px;align-items:end;margin-top:12px}.delete-pass{display:flex;flex-direction:column;gap:5px;font-size:.76rem;font-weight:650}.delete-pass input{padding:8px 9px;border:1px solid #cbd5e1;border-radius:7px;font:inherit}.delete-actions{display:flex;gap:8px;align-items:center}.delete-actions button{padding:8px 14px;border:0;border-radius:7px;cursor:pointer;font-weight:650}.delete-cancel{background:#f1f5f9}.delete-submit{background:#dc2626;color:#fff}.delete-submit:disabled{opacity:.5}.delete-status{min-height:22px;margin-top:8px;color:#b91c1c;font-size:.76rem;white-space:pre-wrap}' +
      '@media(max-width:700px){.delete-filters{grid-template-columns:1fr}.delete-row{grid-template-columns:28px 74px minmax(0,1fr)}.delete-size{display:none}.delete-footer{grid-template-columns:1fr}.delete-actions{justify-content:flex-end}}';
    document.head.appendChild(style);
  }

  function createModal() {
    var modal = document.getElementById('soilAdminDelete');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'soilAdminDelete';
    modal.className = 'delete-mask';
    modal.innerHTML = '<div class="delete-card"><div class="delete-head"><h3>管理员删除文件</h3><button type="button" class="delete-close">×</button></div>' +
      '<div class="delete-warning">删除会直接写入仓库 main 分支，并同步清理质控意见索引。请仅勾选确认不再需要的文件；该操作不会删除受管目录之外的内容。</div>' +
      '<div class="delete-filters"><select id="delete-type"><option value="all">全部类型</option><option value="quality">质控意见</option><option value="reply">整改答复</option><option value="reference">参考文件</option></select>' +
      '<input id="delete-search" type="search" placeholder="搜索文件名、批次、市、单位或目录"><button id="delete-all-visible" type="button" class="delete-cancel">勾选当前结果</button></div>' +
      '<div id="delete-list" class="delete-list"><div class="delete-empty">正在读取仓库文件……</div></div>' +
      '<div class="delete-footer"><label class="delete-pass">管理员密码<input id="delete-pass" type="password" autocomplete="off"></label><div class="delete-actions"><span id="delete-count">已选择 0 项</span><button type="button" class="delete-cancel">取消</button><button id="delete-submit" type="button" class="delete-submit">删除所选</button></div></div>' +
      '<div id="delete-status" class="delete-status"></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.delete-close').onclick = close;
    modal.querySelector('.delete-actions .delete-cancel').onclick = close;
    modal.onclick = function (event) { if (event.target === modal && !state.busy) close(); };
    modal.querySelector('#delete-type').onchange = renderList;
    modal.querySelector('#delete-search').oninput = renderList;
    modal.querySelector('#delete-all-visible').onclick = toggleVisible;
    modal.querySelector('#delete-submit').onclick = removeSelected;
    modal.addEventListener('change', function (event) {
      if (event.target.matches('.delete-check')) updateCount();
    });
    return modal;
  }

  function close() {
    if (state.busy) return;
    var modal = document.getElementById('soilAdminDelete');
    if (modal) modal.classList.remove('show');
  }

  function selectedPaths() {
    return Array.prototype.slice.call(document.querySelectorAll('.delete-check:checked')).map(function (input) { return input.value; });
  }

  function updateCount() {
    var count = selectedPaths().length;
    var output = document.getElementById('delete-count');
    if (output) output.textContent = '已选择 ' + count + ' 项';
  }

  function renderList() {
    var type = document.getElementById('delete-type').value;
    var query = document.getElementById('delete-search').value.trim().toLowerCase();
    state.filtered = state.items.filter(function (item) {
      return (type === 'all' || item.type === type) && (!query || (item.title + ' ' + item.meta + ' ' + item.path).toLowerCase().indexOf(query) >= 0);
    });
    var list = document.getElementById('delete-list');
    if (!state.filtered.length) {
      list.innerHTML = '<div class="delete-empty">没有符合条件的受管文件</div>';
      updateCount();
      return;
    }
    list.innerHTML = state.filtered.map(function (item) {
      return '<label class="delete-row ' + (item.missing ? 'missing' : '') + '"><input class="delete-check" type="checkbox" value="' + esc(item.path) + '"><span class="delete-type">' + typeLabel(item.type) + '</span><span><span class="delete-title">' + esc(item.title) + '</span><span class="delete-meta">' + esc(item.meta) + '</span></span><span class="delete-size">' + (item.missing ? '仅索引' : size(item.size)) + '</span></label>';
    }).join('');
    updateCount();
  }

  function toggleVisible() {
    var checks = Array.prototype.slice.call(document.querySelectorAll('.delete-check'));
    var shouldCheck = checks.some(function (input) { return !input.checked; });
    checks.forEach(function (input) { input.checked = shouldCheck; });
    updateCount();
  }

  function load() {
    var modal = createModal();
    var list = document.getElementById('delete-list');
    list.innerHTML = '<div class="delete-empty">正在读取仓库文件……</div>';
    document.getElementById('delete-status').textContent = '';
    return Promise.all([
      A().loadTree ? A().loadTree(true) : request('/git/trees/' + BRANCH + '?recursive=1').then(function (data) { return data.tree || []; }),
      fetchIndex()
    ]).then(function (values) {
      state.index = normalizeIndex(values[1]);
      state.items = buildItems(values[0], state.index);
      renderList();
      modal.classList.add('show');
    }).catch(function (error) {
      list.innerHTML = '<div class="delete-empty">读取失败：' + esc(error.message) + '</div>';
      modal.classList.add('show');
    });
  }

  function open(context) {
    state.context = context || {};
    createModal();
    document.getElementById('delete-pass').value = '';
    document.getElementById('delete-search').value = '';
    document.getElementById('delete-type').value = state.context.scope || 'all';
    return load();
  }

  function latestIndex() {
    return fetchIndex().then(normalizeIndex);
  }

  function commitDeletion(paths) {
    return Promise.all([
      request('/git/ref/heads/' + BRANCH),
      request('/git/trees/' + BRANCH + '?recursive=1'),
      latestIndex()
    ]).then(function (values) {
      var ref = values[0];
      var tree = values[1].tree || [];
      var currentIndex = values[2];
      var existing = {};
      tree.forEach(function (entry) { if (entry.type === 'blob') existing[entry.path] = true; });
      var selected = {};
      paths.forEach(function (path) { selected[path] = true; });
      var deletions = paths.filter(function (path) { return existing[path]; });
      var filteredIndex = currentIndex.filter(function (entry) { return !selected[entry.path]; });
      var indexChanged = filteredIndex.length !== currentIndex.length;
      if (!deletions.length && !indexChanged) throw new Error('所选文件已不存在，请刷新列表后重试。');

      return request('/git/commits/' + ref.object.sha).then(function (commit) {
        var entries = deletions.map(function (path) { return {path:path, mode:'100644', type:'blob', sha:null}; });
        var createIndexBlob = indexChanged ? request('/git/blobs', {
          method:'POST', body:JSON.stringify({content:JSON.stringify(filteredIndex, null, 2) + '\n', encoding:'utf-8'})
        }) : Promise.resolve(null);
        return createIndexBlob.then(function (blob) {
          if (blob) entries.push({path:INDEX_PATH, mode:'100644', type:'blob', sha:blob.sha});
          return request('/git/trees', {method:'POST', body:JSON.stringify({base_tree:commit.tree.sha, tree:entries})});
        }).then(function (newTree) {
          return request('/git/commits', {
            method:'POST',
            body:JSON.stringify({
              message:'chore: delete ' + paths.length + ' managed file' + (paths.length > 1 ? 's' : ''),
              tree:newTree.sha,
              parents:[ref.object.sha]
            })
          });
        }).then(function (newCommit) {
          return request('/git/refs/heads/' + BRANCH, {
            method:'PATCH', body:JSON.stringify({sha:newCommit.sha, force:false})
          }).then(function () {
            return {commit:newCommit.sha, filteredIndex:filteredIndex, deleted:paths};
          });
        });
      });
    });
  }

  function refreshAfterDelete(result) {
    var qualityPaths = result.deleted.filter(function (path) { return path.indexOf(QUALITY_ROOT) === 0; });
    if (typeof window.removeAdminQualityPaths === 'function') window.removeAdminQualityPaths(qualityPaths, result.filteredIndex);
    if (Q().state) Q().state.index = result.filteredIndex;
    if (A()) A().tree = null;
    if (typeof window.reloadReplyIndex === 'function') window.reloadReplyIndex();
    if (typeof window.refreshSoilReferenceLibrary === 'function') window.refreshSoilReferenceLibrary();
    if (window.SoilRegionalProgress && typeof window.SoilRegionalProgress.refresh === 'function') window.SoilRegionalProgress.refresh();
  }

  function removeSelected() {
    if (state.busy) return;
    var paths = selectedPaths();
    var status = document.getElementById('delete-status');
    var submit = document.getElementById('delete-submit');
    if (!paths.length) { status.textContent = '请至少选择一个文件。'; return; }
    if (document.getElementById('delete-pass').value !== (Q().PASS || '478666')) {
      status.textContent = '管理员密码错误。';
      return;
    }
    if (!confirm('确认删除所选 ' + paths.length + ' 项吗？删除后将直接写入仓库 main 分支。')) return;

    state.busy = true;
    submit.disabled = true;
    status.textContent = '正在校验凭证并生成删除提交……';
    ensureToken().then(function () {
      return commitDeletion(paths);
    }).then(function (result) {
      refreshAfterDelete(result);
      status.textContent = '删除成功，提交：' + result.commit.slice(0, 7) + '。页面统计和文件列表已刷新。';
      if (typeof window.showToast === 'function') window.showToast('已删除 ' + paths.length + ' 项受管文件。');
      state.items = state.items.filter(function (item) { return paths.indexOf(item.path) < 0; });
      renderList();
      document.getElementById('delete-pass').value = '';
      return sleep(1000);
    }).catch(function (error) {
      status.textContent = '删除失败：' + error.message;
    }).finally(function () {
      state.busy = false;
      submit.disabled = false;
    });
  }

  function install() {
    styles();
    createModal();
    window.openSoilAdminDelete = open;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
