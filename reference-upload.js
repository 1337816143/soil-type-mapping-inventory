(function () {
  'use strict';

  if (window.__soilReferenceUploadInstalled) return;
  window.__soilReferenceUploadInstalled = true;

  var A = window.SoilRepoAdmin;
  if (!A) return;

  var ROOT = 'reference-files/third-soil-survey';
  var WRAPPER = '三普成果编制及质量控制主要参考资料';
  var API_ROOT = 'https://api.github.com/repos/1337816143/soil-type-mapping-inventory';
  var BRANCH = 'main';
  var ADMIN_PASS = '478666';
  var MAX_FILE = 95 * 1024 * 1024;
  var SINGLE_LIMIT = 39 * 1024 * 1024;
  var CHUNK_SIZE = 39 * 1024 * 1024;
  var STAGE_ROOT = '.reference-upload';
  var ZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  var CATEGORIES = [
    '土壤类型图',
    '土壤属性图',
    '耕地质量等级评价',
    '土壤退化与障碍分析',
    '土特产品土壤适宜性评价',
    '土壤农业利用适宜性评价',
    '土地资源评价与利用报告'
  ];

  var state = {
    files: [],
    dirs: [],
    busy: false,
    renderQueued: false
  };

  function clean(path) { return A.clean(path); }
  function esc(value) { return A.esc(value); }
  function base(path) { return A.base(path); }
  function size(bytes) { return A.size(bytes); }
  function token() { return String(window.SOIL_GITHUB_UPLOAD_TOKEN || '').trim(); }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function normalize(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .replace(/[\s\u3000_\-—–·｜|（）()【】\[\]《》<>“”"'，,。:：;；]+/g, '')
      .toLowerCase();
  }

  function inferCategory(path) {
    var text = normalize(path);
    if (/土地资源评价与利用报告|土地资源评价与利用|土地资源评价/.test(text)) return '土地资源评价与利用报告';
    if (/土特产品土壤适宜性评价|土特产品适宜性评价|特色农产品.*适宜性|特色产品.*适宜性/.test(text)) return '土特产品土壤适宜性评价';
    if (/土壤农业利用适宜性评价|农业利用适宜性评价|农业适宜性评价/.test(text)) return '土壤农业利用适宜性评价';
    if (/土壤退化与障碍分析|土壤退化|退化与障碍|障碍分析|障碍因素/.test(text)) return '土壤退化与障碍分析';
    if (/耕地质量等级评价|耕地质量评价|耕地质量等级|耕评/.test(text)) return '耕地质量等级评价';
    if (/土壤属性图|属性图|土壤属性成果/.test(text)) return '土壤属性图';
    if (/土壤类型图|类型图|土类图|土壤类型成果/.test(text)) return '土壤类型图';
    return '其他资料';
  }

  function fallbackDirectory(category) {
    if (!category || category === '其他资料') return ROOT;
    return clean(ROOT + '/' + WRAPPER + '/三普成果编制及质控参考资料-' + category);
  }

  function currentDirectories() {
    var seen = {};
    var dirs = [];
    function add(path) {
      path = clean(path);
      if (!path || (path !== ROOT && path.indexOf(ROOT + '/') !== 0) || seen[path]) return;
      seen[path] = true;
      dirs.push(path);
    }
    add(ROOT);
    (state.dirs || []).forEach(add);
    (A.dirs || []).forEach(add);
    CATEGORIES.forEach(function (category) { add(fallbackDirectory(category)); });
    dirs.sort(function (a, b) {
      if (a === ROOT) return -1;
      if (b === ROOT) return 1;
      return a.localeCompare(b, 'zh-CN');
    });
    return dirs;
  }

  function directoryForCategory(category) {
    if (!category || category === '其他资料') return ROOT;
    var key = normalize(category);
    var candidates = currentDirectories().filter(function (path) {
      return normalize(path).indexOf(key) >= 0;
    });
    candidates.sort(function (a, b) {
      var aLast = normalize(a.slice(a.lastIndexOf('/') + 1)).indexOf(key) >= 0 ? 1 : 0;
      var bLast = normalize(b.slice(b.lastIndexOf('/') + 1)).indexOf(key) >= 0 ? 1 : 0;
      if (aLast !== bLast) return bLast - aLast;
      return b.split('/').length - a.split('/').length;
    });
    return candidates[0] || fallbackDirectory(category);
  }

  function makeItem(file, sourcePath) {
    var source = String(sourcePath || file.name || '');
    var category = inferCategory(source + ' ' + (file.name || ''));
    return {
      file: file,
      sourcePath: source,
      category: category,
      directory: directoryForCategory(category),
      manualDirectory: false
    };
  }

  function reclassifyItem(item) {
    if (!item || item.manualDirectory) return item;
    item.category = inferCategory(item.sourcePath + ' ' + (item.file && item.file.name || ''));
    item.directory = directoryForCategory(item.category);
    return item;
  }

  function setFiles(items) {
    state.files = (items || []).map(function (item) {
      return makeItem(item.file, item.sourcePath || item.path || item.file.name);
    });
    render();
  }

  function installStyles() {
    if (document.getElementById('reference-upload-style')) return;
    var style = document.createElement('style');
    style.id = 'reference-upload-style';
    style.textContent =
      '.ref-upload-mask{display:none;position:fixed;inset:0;z-index:18000;align-items:center;justify-content:center;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));background:rgba(15,23,42,.54)}' +
      '.ref-upload-mask.show{display:flex}' +
      '.ref-upload-card{width:min(980px,100%);max-height:calc(var(--ref-upload-vh,100dvh) - 20px);display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:14px;box-shadow:0 24px 80px rgba(15,23,42,.3);color:#172033}' +
      '.ref-upload-head{display:flex;align-items:center;gap:10px;flex:0 0 auto;padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#fff}' +
      '.ref-upload-head h3{margin:0;font-size:1rem;line-height:1.35}' +
      '.ref-upload-close{margin-left:auto;flex:0 0 auto;width:38px;height:38px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;font-size:1.25rem;cursor:pointer}' +
      '.ref-upload-body{min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 16px}' +
      '.ref-upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '.ref-upload-field{display:flex;flex-direction:column;gap:6px;min-width:0}' +
      '.ref-upload-field.full{grid-column:1/-1}' +
      '.ref-upload-field>label{font-size:.78rem;font-weight:700}' +
      '.ref-upload-field input,.ref-upload-field select{box-sizing:border-box;width:100%;min-width:0;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font:inherit;font-size:.8rem}' +
      '.ref-upload-help{font-size:.71rem;line-height:1.55;color:#64748b}' +
      '.ref-upload-picks{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px}' +
      '.ref-upload-pick{min-width:0;padding:10px;border:1px dashed #93c5fd;border-radius:9px;background:#f8fbff}' +
      '.ref-upload-pick strong{display:block;margin-bottom:4px;font-size:.76rem;color:#1e40af}' +
      '.ref-upload-pick input{border:0;padding:3px 0 0;background:transparent;font-size:.72rem}' +
      '.ref-upload-bulk{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}' +
      '.ref-upload-bulk button,.ref-upload-auto,.ref-upload-submit,.ref-upload-cancel{border:0;border-radius:8px;padding:9px 13px;font-size:.78rem;font-weight:700;cursor:pointer}' +
      '.ref-upload-bulk button,.ref-upload-auto{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8}' +
      '.ref-upload-list{display:flex;flex-direction:column;gap:9px}' +
      '.ref-upload-empty{padding:20px;border:1px dashed #cbd5e1;border-radius:9px;text-align:center;color:#64748b;font-size:.78rem}' +
      '.ref-upload-row{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(280px,1.35fr);gap:10px;padding:11px;border:1px solid #dbe3ef;border-radius:9px;background:#fff}' +
      '.ref-upload-file{min-width:0}' +
      '.ref-upload-file b{display:block;font-size:.8rem;overflow-wrap:anywhere}' +
      '.ref-upload-meta{margin-top:4px;font-size:.69rem;line-height:1.55;color:#64748b;overflow-wrap:anywhere}' +
      '.ref-upload-category{display:inline-flex;margin-top:6px;padding:2px 7px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:.68rem;font-weight:700}' +
      '.ref-upload-dir{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:end}' +
      '.ref-upload-dir label{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:.7rem;color:#475569}' +
      '.ref-upload-dir select{width:100%;min-width:0;padding:8px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;font-size:.72rem}' +
      '.ref-upload-auto{padding:8px 10px;white-space:nowrap}' +
      '.ref-upload-progress{display:none;margin-top:12px;padding:10px 11px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e40af;font-size:.76rem;line-height:1.55;white-space:pre-wrap}' +
      '.ref-upload-progress.show{display:block}' +
      '.ref-upload-bar{height:8px;margin-top:7px;overflow:hidden;border-radius:999px;background:#dbeafe}' +
      '.ref-upload-bar span{display:block;width:0;height:100%;background:linear-gradient(90deg,#2563eb,#0ea5e9);transition:width .18s linear}' +
      '.ref-upload-actions{display:flex;justify-content:flex-end;gap:9px;flex:0 0 auto;padding:12px 16px;border-top:1px solid #e2e8f0;background:#fff}' +
      '.ref-upload-cancel{background:#f1f5f9;color:#0f172a}' +
      '.ref-upload-submit{background:#2563eb;color:#fff}' +
      '.ref-upload-submit:disabled,.ref-upload-cancel:disabled{opacity:.55;cursor:not-allowed}' +
      '@media(max-width:760px){.ref-upload-mask{align-items:flex-start;padding-top:max(6px,env(safe-area-inset-top));padding-bottom:max(6px,env(safe-area-inset-bottom))}.ref-upload-card{width:100%;height:calc(var(--ref-upload-vh,100dvh) - max(12px,env(safe-area-inset-top)) - max(12px,env(safe-area-inset-bottom)));max-height:none;border-radius:12px}.ref-upload-head{padding:10px 12px;position:relative;z-index:2}.ref-upload-body{padding:11px 12px}.ref-upload-grid,.ref-upload-picks{grid-template-columns:1fr}.ref-upload-field.full{grid-column:auto}.ref-upload-row{grid-template-columns:1fr}.ref-upload-dir{grid-template-columns:1fr}.ref-upload-auto{width:100%}.ref-upload-actions{position:relative;z-index:2;padding:9px 12px calc(9px + env(safe-area-inset-bottom));}.ref-upload-actions button{flex:1 1 0}.ref-upload-bulk{grid-template-columns:1fr}.ref-upload-bulk button{width:100%}}' +
      '@media(max-width:380px){.ref-upload-head h3{font-size:.92rem}.ref-upload-close{width:36px;height:36px}.ref-upload-body{padding:9px}.ref-upload-row{padding:9px}.ref-upload-actions{gap:7px}}' +
      '@media(max-height:560px) and (orientation:landscape){.ref-upload-mask{padding:4px}.ref-upload-card{height:calc(var(--ref-upload-vh,100dvh) - 8px);border-radius:10px}.ref-upload-head{padding:7px 10px}.ref-upload-close{width:34px;height:34px}.ref-upload-body{padding:8px 10px}.ref-upload-actions{padding:7px 10px}.ref-upload-picks{grid-template-columns:1fr 1fr 1fr}}';
    document.head.appendChild(style);
  }

  function updateViewportHeight() {
    var height = window.visualViewport && window.visualViewport.height ? window.visualViewport.height : window.innerHeight;
    if (height) document.documentElement.style.setProperty('--ref-upload-vh', Math.round(height) + 'px');
  }

  function createModal() {
    var modal = document.getElementById('soilReferenceUpload');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'soilReferenceUpload';
    modal.className = 'ref-upload-mask';
    modal.innerHTML =
      '<div class="ref-upload-card" role="dialog" aria-modal="true" aria-labelledby="ref-upload-title">' +
        '<div class="ref-upload-head"><h3 id="ref-upload-title">管理员上传参考文件</h3><button type="button" class="ref-upload-close" aria-label="关闭">×</button></div>' +
        '<div class="ref-upload-body"><div class="ref-upload-grid">' +
          '<div class="ref-upload-field"><label>管理员密码</label><input id="ref-upload-pass" type="password" autocomplete="off"></div>' +
          '<div class="ref-upload-field"><label>上传模式</label><input value="参考资料（独立上传通道）" disabled></div>' +
          '<div class="ref-upload-field full"><div class="ref-upload-help">本入口与质控意见上传完全分离：不会调用成果类型、批次、市、作业单位或任务单元识别。系统只根据参考文件名/ZIP内部路径判断参考资料目录，并允许逐文件手动调整。</div></div>' +
          '<div class="ref-upload-field full"><label>选择参考文件</label><div class="ref-upload-picks">' +
            '<div class="ref-upload-pick"><strong>ZIP（手机推荐）</strong><div class="ref-upload-help">使用系统“文件”选择器，ZIP解压后逐文件识别目录。</div><input id="ref-upload-zip" type="file" accept=".zip,application/zip,application/x-zip-compressed"></div>' +
            '<div class="ref-upload-pick"><strong>多个文件</strong><div class="ref-upload-help">PDF、Word、表格、PPT等参考资料均可。</div><input id="ref-upload-files" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf,application/zip"></div>' +
            '<div class="ref-upload-pick"><strong>整个文件夹</strong><div class="ref-upload-help">电脑端可选择文件夹；识别时同时参考相对路径。</div><input id="ref-upload-folder" type="file" webkitdirectory directory multiple></div>' +
          '</div></div>' +
          '<div class="ref-upload-field full"><label>批量手动调整目录</label><div class="ref-upload-bulk"><select id="ref-upload-bulk-dir"></select><button id="ref-upload-apply-dir" type="button">应用到全部文件</button></div></div>' +
          '<div class="ref-upload-field full"><label>上传预览与目录匹配</label><div id="ref-upload-list" class="ref-upload-list"></div></div>' +
        '</div><div id="ref-upload-progress" class="ref-upload-progress"><span id="ref-upload-text"></span><div class="ref-upload-bar"><span id="ref-upload-bar"></span></div></div></div>' +
        '<div class="ref-upload-actions"><button type="button" class="ref-upload-cancel">取消</button><button type="button" id="ref-upload-submit" class="ref-upload-submit">开始上传</button></div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('.ref-upload-close').onclick = close;
    modal.querySelector('.ref-upload-cancel').onclick = close;
    modal.onclick = function (event) { if (event.target === modal) close(); };
    document.getElementById('ref-upload-zip').onchange = handleZipInput;
    document.getElementById('ref-upload-files').onchange = handleFilesInput;
    document.getElementById('ref-upload-folder').onchange = handleFolderInput;
    document.getElementById('ref-upload-apply-dir').onclick = applyBulkDirectory;
    document.getElementById('ref-upload-submit').onclick = startUpload;
    return modal;
  }

  function optionHtml(value, selected) {
    var label = value === ROOT ? '参考资料根目录（仅无法识别时使用）' : value.slice(ROOT.length + 1);
    return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  function render() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(function () {
      state.renderQueued = false;
      var list = document.getElementById('ref-upload-list');
      var bulk = document.getElementById('ref-upload-bulk-dir');
      if (!list || !bulk) return;
      var dirs = currentDirectories();
      var bulkValue = bulk.value;
      bulk.innerHTML = dirs.map(function (dir) { return optionHtml(dir, bulkValue); }).join('');
      if (bulkValue && dirs.indexOf(bulkValue) >= 0) bulk.value = bulkValue;
      else if (dirs.length) bulk.value = dirs[0];

      if (!state.files.length) {
        list.innerHTML = '<div class="ref-upload-empty">尚未选择参考文件。</div>';
        return;
      }

      list.innerHTML = state.files.map(function (item, index) {
        var itemDirs = dirs.slice();
        if (item.directory && itemDirs.indexOf(item.directory) < 0) itemDirs.push(item.directory);
        var modeText = item.manualDirectory ? '人工指定目录' : '根据文件名自动识别';
        return '<div class="ref-upload-row" data-index="' + index + '">' +
          '<div class="ref-upload-file"><b>' + esc(item.file.name) + '</b><div class="ref-upload-meta">' + esc(item.sourcePath) + ' · ' + size(item.file.size) + '<br>' + modeText + '</div><span class="ref-upload-category">' + esc(item.category) + '</span></div>' +
          '<div class="ref-upload-dir"><label>归档目录<select class="ref-upload-dir-select">' + itemDirs.map(function (dir) { return optionHtml(dir, item.directory); }).join('') + '</select></label><button type="button" class="ref-upload-auto">重新自动识别</button></div>' +
        '</div>';
      }).join('');

      Array.prototype.forEach.call(list.querySelectorAll('.ref-upload-row'), function (row) {
        var index = Number(row.dataset.index);
        var select = row.querySelector('.ref-upload-dir-select');
        var autoButton = row.querySelector('.ref-upload-auto');
        select.onchange = function () {
          var item = state.files[index];
          if (!item) return;
          item.directory = clean(this.value);
          item.manualDirectory = true;
          render();
        };
        autoButton.onclick = function () {
          var item = state.files[index];
          if (!item) return;
          item.manualDirectory = false;
          reclassifyItem(item);
          render();
        };
      });
    });
  }

  function applyBulkDirectory() {
    var select = document.getElementById('ref-upload-bulk-dir');
    if (!select || !select.value) return;
    var directory = clean(select.value);
    state.files.forEach(function (item) {
      item.directory = directory;
      item.manualDirectory = true;
    });
    render();
  }

  function resetPickers(exceptId) {
    ['ref-upload-zip','ref-upload-files','ref-upload-folder'].forEach(function (id) {
      if (id === exceptId) return;
      var input = document.getElementById(id);
      if (input) input.value = '';
    });
  }

  function handleFilesInput(event) {
    resetPickers(event.target.id);
    var files = Array.prototype.slice.call(event.target.files || []);
    if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
      parseZip(files[0]);
      return;
    }
    setFiles(files.map(function (file) { return {file:file,sourcePath:file.name}; }));
  }

  function handleFolderInput(event) {
    resetPickers(event.target.id);
    var files = Array.prototype.slice.call(event.target.files || []);
    setFiles(files.map(function (file) { return {file:file,sourcePath:file.webkitRelativePath || file.name}; }));
  }

  function handleZipInput(event) {
    resetPickers(event.target.id);
    var file = event.target.files && event.target.files[0];
    if (file) parseZip(file);
  }

  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = ZIP_URL;
      script.onload = function () { resolve(window.JSZip); };
      script.onerror = function () { reject(new Error('ZIP解压组件加载失败')); };
      document.head.appendChild(script);
    });
  }

  function parseZip(file) {
    progress('正在解析 ZIP 文件……', 2, true);
    Promise.all([loadZip(), file.arrayBuffer()]).then(function (values) {
      return values[0].loadAsync(values[1]);
    }).then(function (zip) {
      var entries = [];
      zip.forEach(function (path, entry) {
        if (!entry.dir && !/(^|\/)~\$/.test(path) && !/(^|\/)__MACOSX\//.test(path)) entries.push({path:path,entry:entry});
      });
      var output = [];
      return entries.reduce(function (chain, pair, index) {
        return chain.then(function () {
          progress('正在读取 ZIP 文件 ' + (index + 1) + ' / ' + entries.length + '……', 3 + Math.round((index + 1) / Math.max(1, entries.length) * 12), true);
          return pair.entry.async('blob').then(function (blob) {
            output.push({file:new File([blob], base(pair.path), {type:blob.type || 'application/octet-stream'}),sourcePath:pair.path});
          });
        });
      }, Promise.resolve()).then(function () {
        setFiles(output);
        progress('ZIP 解析完成；已按参考文件名/路径自动匹配目录，可逐项调整。', 15, true);
      });
    }).catch(function (error) {
      progress('ZIP解析失败：' + error.message, 0, true);
    });
  }

  function progress(text, percent, visible) {
    var box = document.getElementById('ref-upload-progress');
    var label = document.getElementById('ref-upload-text');
    var bar = document.getElementById('ref-upload-bar');
    if (!box || !label || !bar) return;
    percent = Math.max(0, Math.min(100, Number(percent || 0)));
    if (label.textContent !== String(text || '')) label.textContent = String(text || '');
    var width = percent + '%';
    if (bar.style.width !== width) bar.style.width = width;
    box.classList.toggle('show', visible !== false && !!text);
  }

  function pulse(text, start, end) {
    var value = start;
    progress(text, value, true);
    var timer = setInterval(function () {
      if (value < end - 1) value += Math.max(0.35, (end - value) * 0.045);
      progress(text, Math.min(end - 0.5, value), true);
    }, 650);
    return function (finalText) {
      clearInterval(timer);
      progress(finalText || text, end, true);
    };
  }

  function api(path, options) {
    options = options || {};
    var headers = Object.assign({
      'Authorization':'Bearer ' + token(),
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28'
    }, options.headers || {});
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(API_ROOT + path, Object.assign({}, options, {cache:'no-store',headers:headers})).then(function (response) {
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

  function bytesToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var output = '';
    var block = 0x8000;
    for (var i = 0; i < bytes.length; i += block) {
      output += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + block, bytes.length)));
    }
    return btoa(output);
  }

  function createBlob(content, encoding) {
    return api('/git/blobs', {method:'POST',body:JSON.stringify({content:content,encoding:encoding || 'utf-8'})});
  }

  function makeId() {
    var date = new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds()) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function targetPath(item) {
    return clean(item.directory + '/' + item.file.name);
  }

  function buildManifest(baseCommit, uploadId) {
    return {
      schemaVersion:3,
      uploadId:uploadId,
      sourceBranch:'reference-upload-' + uploadId,
      targetBranch:BRANCH,
      kind:'reference',
      createdAt:new Date().toISOString(),
      baseCommit:baseCommit,
      referenceRoot:ROOT,
      singleBlobLimit:SINGLE_LIMIT,
      chunkSize:CHUNK_SIZE,
      files:state.files.map(function (item, index) {
        return {
          targetPath:targetPath(item),
          sourcePath:item.sourcePath,
          originalName:item.file.name,
          size:item.file.size,
          mimeType:item.file.type || 'application/octet-stream',
          order:index + 1,
          category:item.category,
          storage:item.file.size <= SINGLE_LIMIT ? 'whole' : 'chunked'
        };
      })
    };
  }

  function stageWhole(item, record, index, manifest, entries, startPercent, endPercent) {
    var path = STAGE_ROOT + '/' + manifest.uploadId + '/whole/' + String(index + 1).padStart(4, '0') + '.bin';
    var stopRead = pulse('正在读取参考文件 ' + (index + 1) + ' / ' + state.files.length + '：' + item.file.name, startPercent, startPercent + (endPercent - startPercent) * 0.22);
    return item.file.arrayBuffer().then(function (buffer) {
      stopRead('文件读取完成，正在上传到 GitHub：' + item.file.name);
      var stopUpload = pulse('正在上传参考文件 ' + (index + 1) + ' / ' + state.files.length + '：' + item.file.name, startPercent + (endPercent - startPercent) * 0.22, endPercent);
      return createBlob(bytesToBase64(buffer), 'base64').then(function (blob) {
        stopUpload('参考文件 ' + (index + 1) + ' / ' + state.files.length + ' 已上传。');
        entries.push({path:path,mode:'100644',type:'blob',sha:blob.sha});
        record.whole = {path:path,size:item.file.size};
      }, function (error) {
        stopUpload();
        throw error;
      });
    }, function (error) {
      stopRead();
      throw error;
    });
  }

  function stageChunked(item, record, index, manifest, entries, startPercent, endPercent) {
    var count = Math.ceil(item.file.size / CHUNK_SIZE);
    record.chunks = [];
    var chunks = Array.from({length:count}, function (_, i) { return i; });
    return chunks.reduce(function (chain, chunkIndex) {
      return chain.then(function () {
        var localStart = startPercent + (endPercent - startPercent) * chunkIndex / count;
        var localEnd = startPercent + (endPercent - startPercent) * (chunkIndex + 1) / count;
        var from = chunkIndex * CHUNK_SIZE;
        var to = Math.min(item.file.size, from + CHUNK_SIZE);
        var chunk = item.file.slice(from, to);
        var path = STAGE_ROOT + '/' + manifest.uploadId + '/chunks/' + String(index + 1).padStart(4, '0') + '/' + String(chunkIndex + 1).padStart(3, '0') + '.part';
        var stop = pulse('正在上传大文件 ' + (index + 1) + ' / ' + state.files.length + '：' + item.file.name + '\n39 MiB 分块 ' + (chunkIndex + 1) + ' / ' + count, localStart, localEnd);
        return chunk.arrayBuffer().then(bytesToBase64).then(function (content) {
          return createBlob(content, 'base64');
        }).then(function (blob) {
          stop('大文件分块 ' + (chunkIndex + 1) + ' / ' + count + ' 已上传。');
          entries.push({path:path,mode:'100644',type:'blob',sha:blob.sha});
          record.chunks.push({path:path,size:chunk.size});
          return sleep(120);
        }, function (error) {
          stop();
          throw error;
        });
      });
    }, Promise.resolve());
  }

  function stageFiles(manifest, entries) {
    var totalBytes = state.files.reduce(function (sum, item) { return sum + item.file.size; }, 0) || 1;
    var completed = 0;
    return state.files.reduce(function (chain, item, index) {
      return chain.then(function () {
        var span = 70 * item.file.size / totalBytes;
        var start = 6 + 70 * completed / totalBytes;
        var end = Math.min(76, start + span);
        completed += item.file.size;
        return manifest.files[index].storage === 'whole' ?
          stageWhole(item, manifest.files[index], index, manifest, entries, start, end) :
          stageChunked(item, manifest.files[index], index, manifest, entries, start, end);
      });
    }, Promise.resolve());
  }

  function pollCompletion(uploadId, deadline) {
    return new Promise(function (resolve, reject) {
      function check() {
        api('/commits?sha=' + encodeURIComponent(BRANCH) + '&per_page=20').then(function (commits) {
          var found = (Array.isArray(commits) ? commits : []).find(function (entry) {
            return String(entry && entry.commit && entry.commit.message || '').indexOf(uploadId) >= 0;
          });
          if (found) return resolve(found.sha);
          if (Date.now() >= deadline) return reject(new Error('文件已经进入参考资料临时分支，但后台归档超过等待时间。上传编号：' + uploadId));
          setTimeout(check, 4000);
        }).catch(function (error) {
          if (Date.now() >= deadline) reject(error);
          else setTimeout(check, 4000);
        });
      }
      check();
    });
  }

  function startUpload() {
    if (state.busy) return;
    var password = document.getElementById('ref-upload-pass');
    if (!password || password.value !== ADMIN_PASS) {
      progress('管理员密码错误。', 0, true);
      return;
    }
    if (!token()) {
      progress('页面未配置 GitHub 上传凭证。', 0, true);
      return;
    }
    if (!state.files.length) {
      progress('请先选择参考文件。', 0, true);
      return;
    }
    var oversize = state.files.find(function (item) { return item.file.size > MAX_FILE; });
    if (oversize) {
      progress('文件超过 95 MB：' + oversize.file.name + '。请先拆分后再上传。', 0, true);
      return;
    }
    var invalid = state.files.find(function (item) {
      return !item.directory || (item.directory !== ROOT && item.directory.indexOf(ROOT + '/') !== 0);
    });
    if (invalid) {
      progress('归档目录无效：' + invalid.file.name, 0, true);
      return;
    }

    var submit = document.getElementById('ref-upload-submit');
    var cancel = document.querySelector('#soilReferenceUpload .ref-upload-cancel');
    var uploadId = makeId();
    var branch = 'reference-upload-' + uploadId;
    var baseCommit = '';
    var baseTree = '';
    var manifest = null;
    var entries = [];

    state.busy = true;
    submit.disabled = true;
    if (cancel) cancel.disabled = true;
    progress('正在验证 GitHub 上传凭证并读取 main 分支……', 1, true);

    api('/git/ref/heads/' + BRANCH).then(function (ref) {
      baseCommit = ref.object.sha;
      progress('凭证有效，正在读取仓库状态……', 3, true);
      return api('/git/commits/' + baseCommit);
    }).then(function (commit) {
      baseTree = commit.tree.sha;
      manifest = buildManifest(baseCommit, uploadId);
      return stageFiles(manifest, entries);
    }).then(function () {
      progress('文件上传完成，正在生成参考资料归档清单……', 80, true);
      return createBlob(JSON.stringify(manifest, null, 2), 'utf-8');
    }).then(function (blob) {
      entries.push({path:STAGE_ROOT + '/' + uploadId + '/manifest.json',mode:'100644',type:'blob',sha:blob.sha});
      return createBlob(JSON.stringify({schemaVersion:3,uploadId:uploadId,manifestPath:STAGE_ROOT + '/' + uploadId + '/manifest.json'}, null, 2), 'utf-8');
    }).then(function (blob) {
      entries.push({path:STAGE_ROOT + '/ready.json',mode:'100644',type:'blob',sha:blob.sha});
      progress('正在创建参考资料专用临时分支……', 86, true);
      return api('/git/trees', {method:'POST',body:JSON.stringify({base_tree:baseTree,tree:entries})});
    }).then(function (tree) {
      return api('/git/commits', {method:'POST',body:JSON.stringify({message:'stage: reference upload ' + uploadId,tree:tree.sha,parents:[baseCommit]})});
    }).then(function (commit) {
      return api('/git/refs', {method:'POST',body:JSON.stringify({ref:'refs/heads/' + branch,sha:commit.sha})});
    }).then(function () {
      progress('文件已上传；参考资料专用 Actions 正在归档到 main……', 92, true);
      return pollCompletion(uploadId, Date.now() + 15 * 60 * 1000);
    }).then(function () {
      A.tree = null;
      progress('归档完成。GitHub Pages 正在自动更新。', 100, true);
      setTimeout(function () {
        alert('上传成功！稍等3~5分钟刷新网站即可查看新上传的文件。');
        state.busy = false;
        submit.disabled = false;
        if (cancel) cancel.disabled = false;
        close();
        if (typeof window.refreshSoilReferenceLibrary === 'function') window.refreshSoilReferenceLibrary();
      }, 350);
    }).catch(function (error) {
      state.busy = false;
      submit.disabled = false;
      if (cancel) cancel.disabled = false;
      var message = error && error.status === 401 ? 'GitHub 上传凭证无效：Bad credentials。项目内置 Token 未被修改，请检查该 Token 当前仓库权限。' : ('上传失败：' + (error && error.message || error));
      progress(message, 0, true);
    });
  }

  function open() {
    installStyles();
    updateViewportHeight();
    var modal = createModal();
    state.files = [];
    state.busy = false;
    document.getElementById('ref-upload-pass').value = '';
    ['ref-upload-zip','ref-upload-files','ref-upload-folder'].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.value = '';
    });
    progress('', 0, false);
    render();
    modal.classList.add('show');

    A.loadTree(false).then(function () {
      state.dirs = (A.dirs || []).filter(function (path) { return path === ROOT || path.indexOf(ROOT + '/') === 0; });
      state.files.forEach(reclassifyItem);
      render();
    }).catch(function () {
      state.dirs = [];
      render();
    });
  }

  function close() {
    if (state.busy) return;
    var modal = document.getElementById('soilReferenceUpload');
    if (modal) modal.classList.remove('show');
  }

  window.openSoilReferenceUpload = open;
  window.SoilReferenceUpload = {
    open:open,
    close:close,
    inferCategory:inferCategory,
    directoryForCategory:directoryForCategory,
    getState:function () { return state; }
  };

  updateViewportHeight();
  window.addEventListener('resize', updateViewportHeight, {passive:true});
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateViewportHeight, {passive:true});
})();
