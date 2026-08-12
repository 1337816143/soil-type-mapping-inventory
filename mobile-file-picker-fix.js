(function () {
  'use strict';

  if (window.__soilMobileFilePickerFixInstalled) return;
  window.__soilMobileFilePickerFixInstalled = true;

  var ZIP_ACCEPT = '.zip,application/zip,application/x-zip-compressed';
  var GENERIC_ACCEPT = '*/*,.zip,application/zip,application/x-zip-compressed';
  var openWrapped = false;

  function Q() { return window.SoilAdminImport; }
  function C() { return window.SoilAdminAutoClassifier; }

  function addStyles() {
    if (document.getElementById('soil-mobile-picker-style')) return;
    var style = document.createElement('style');
    style.id = 'soil-mobile-picker-style';
    style.textContent =
      '.soil-mobile-zip-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 8px}' +
      '.soil-mobile-zip-btn{appearance:none;border:1px solid #2563eb;border-radius:8px;background:#eff6ff;color:#1d4ed8;padding:8px 12px;font-size:.76rem;font-weight:700;cursor:pointer}' +
      '.soil-mobile-zip-btn:hover{background:#dbeafe}' +
      '.soil-mobile-zip-hint{font-size:.68rem;line-height:1.5;color:#64748b}' +
      '#adm-zip-mobile{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important}' +
      '@media(max-width:760px){.soil-mobile-zip-row{display:grid;grid-template-columns:1fr}.soil-mobile-zip-btn{width:100%;min-height:42px;font-size:.8rem}}';
    document.head.appendChild(style);
  }

  function configureGenericPicker() {
    var picker = document.getElementById('adm-files');
    if (!picker) return;
    picker.setAttribute('accept', GENERIC_ACCEPT);
    picker.removeAttribute('capture');
    picker.setAttribute('data-mobile-picker-fixed', '1');
  }

  function loadZip() {
    var q = Q();
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = q && q.ZIP_URL ? q.ZIP_URL : 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.onload = function () { resolve(window.JSZip); };
      script.onerror = function () { reject(new Error('ZIP解压组件加载失败')); };
      document.head.appendChild(script);
    });
  }

  function stripCommonRoot(path) {
    var parts = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length > 1) parts.shift();
    return parts.join('/');
  }

  function progress(message, percent) {
    var q = Q();
    if (q && typeof q.progress === 'function') q.progress(message, percent || 0, true);
  }

  function applyPreparedFiles(files) {
    var q = Q();
    if (!q) return;
    if (typeof q.normalizePreparedFiles === 'function') q.normalizePreparedFiles(files);
    else if (q.state) q.state.files = files;
    var classifier = C();
    if (classifier && typeof classifier.refresh === 'function') classifier.refresh();
    if (typeof q.renderPreview === 'function') q.renderPreview();
  }

  function importZip(file) {
    var q = Q();
    if (!q || !file) return;
    if (!/\.zip$/i.test(file.name)) {
      progress('请选择 ZIP 文件。', 0);
      return;
    }
    progress('正在从手机文件选择器读取ZIP……', 2);
    Promise.all([loadZip(), file.arrayBuffer()])
      .then(function (result) { return result[0].loadAsync(result[1]); })
      .then(function (zip) {
        var entries = [];
        zip.forEach(function (path, entry) {
          if (!entry.dir && !/(^|\/)~\$/.test(path) && /\.(docx?|pdf)$/i.test(path)) {
            entries.push({path:path, entry:entry});
          }
        });
        if (!entries.length) throw new Error('ZIP中未找到可导入的 DOC、DOCX 或 PDF 文件');
        var output = [];
        return entries.reduce(function (chain, current, index) {
          return chain.then(function () {
            progress('正在解压并识别 ' + (index + 1) + ' / ' + entries.length, 3 + Math.round(index / Math.max(1, entries.length) * 11));
            return current.entry.async('blob').then(function (blob) {
              var path = stripCommonRoot(current.path) || current.path;
              output.push({
                file:new File([blob], path.split('/').pop(), {type:blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),
                path:path,
                sourcePath:current.path,
                batch:''
              });
            });
          });
        }, Promise.resolve()).then(function () { return output; });
      })
      .then(function (files) {
        applyPreparedFiles(files);
        progress('ZIP解析完成：共 ' + files.length + ' 份文件，正在使用已确认索引自动匹配。', 14);
      })
      .catch(function (error) {
        progress('ZIP解析失败：' + error.message, 0);
      });
  }

  function installDedicatedZipPicker() {
    var generic = document.getElementById('adm-files');
    if (!generic) return;
    var pick = generic.closest('.adm-pick') || generic.parentNode;
    if (!pick || pick.querySelector('#adm-zip-mobile')) return;

    var row = document.createElement('div');
    row.className = 'soil-mobile-zip-row';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'soil-mobile-zip-btn';
    button.textContent = '选择 ZIP 文件（手机推荐）';

    var hint = document.createElement('span');
    hint.className = 'soil-mobile-zip-hint';
    hint.textContent = '使用专用 ZIP 类型调用系统“文件”选择器，避免 Android/部分浏览器误进入照片或视频选择器。';

    var input = document.createElement('input');
    input.id = 'adm-zip-mobile';
    input.type = 'file';
    input.accept = ZIP_ACCEPT;
    input.setAttribute('aria-label', '选择ZIP文件');
    input.removeAttribute('capture');

    button.addEventListener('click', function () {
      input.value = '';
      input.click();
    });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) importZip(file);
    });

    row.appendChild(button);
    row.appendChild(hint);
    row.appendChild(input);
    pick.insertBefore(row, generic);
  }

  function clearDedicatedPicker() {
    var input = document.getElementById('adm-zip-mobile');
    if (input) input.value = '';
  }

  function refresh() {
    addStyles();
    configureGenericPicker();
    installDedicatedZipPicker();
  }

  function wrapOpen() {
    if (openWrapped) return;
    var q = Q();
    if (!q || typeof q.open !== 'function') return;
    var original = q.open;
    var wrapped = function () {
      var result = original.apply(this, arguments);
      setTimeout(function () { refresh(); clearDedicatedPicker(); }, 0);
      return result;
    };
    wrapped.__soilMobileFilePickerWrapped = true;
    q.open = wrapped;
    window.openSoilAdminImport = wrapped;
    openWrapped = true;
  }

  function install() {
    refresh();
    wrapOpen();
  }

  window.SoilMobileFilePickerFix = {
    refresh:refresh,
    importZip:importZip,
    zipAccept:ZIP_ACCEPT,
    genericAccept:GENERIC_ACCEPT
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  setTimeout(install, 700);
  setTimeout(install, 1600);
})();
