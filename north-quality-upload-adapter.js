(function () {
  'use strict';

  if (window.__soilNorthQualityUploadAdapterInstalled) return;
  window.__soilNorthQualityUploadAdapterInstalled = true;

  function Q() { return window.SoilAdminImport; }
  function R() { return window.SoilQualityFileRouting; }
  function C() { return window.SoilAdminAutoClassifier; }

  function ensureFirstRoundOption() {
    var select = document.getElementById('adm-batch');
    if (!select || Array.prototype.some.call(select.options, function (option) { return option.value === '第一轮'; })) return;
    var option = document.createElement('option');
    option.value = '第一轮';
    option.textContent = '第一轮';
    var insertBefore = Array.prototype.find.call(select.options, function (item) {
      return item.value === '第一批' || item.value === '__new__';
    });
    select.insertBefore(option, insertBefore || null);
  }

  function targetCount(inspection) {
    var seen = {};
    Object.keys(inspection.byKey || {}).forEach(function (dataKey) {
      (inspection.byKey[dataKey] || []).forEach(function (item) {
        seen[[item.city,item.unit,item.district].join('|')] = true;
      });
    });
    return Object.keys(seen).length;
  }

  function annotateRows() {
    var q = Q();
    var router = R();
    var list = document.getElementById('adm-list');
    if (!q || !router || !list || !q.state || !Array.isArray(q.state.files)) return;

    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var index = Number(row.dataset.i);
      var item = q.state.files[index];
      var file = item && item.file;
      if (!file || !router.isSharedReport(file.name)) return;

      var classifier = C();
      var authority = typeof router.findAuthority === 'function' ? router.findAuthority(file.name, file.size) : null;
      // 手机ZIP可能先生成过一次空元数据；命中权威登记时必须重新识别。
      var meta = authority && classifier && typeof classifier.applyItemMetadata === 'function' ?
        classifier.applyItemMetadata(item) : (item.autoMeta || (classifier && typeof classifier.applyItemMetadata === 'function' ? classifier.applyItemMetadata(item) : null));
      var keys = authority && Array.isArray(authority.dataKeys) && authority.dataKeys.length ? authority.dataKeys :
        (meta && Array.isArray(meta.dataKeys) && meta.dataKeys.length ? meta.dataKeys : router.coveredKeys);
      var inspection = router.inspectFile(file.name, keys, file.size);
      var status = row.querySelector('.v2-file em');
      var destination = row.querySelector('.v2-file small');

      if (inspection.unresolved.length) {
        if (status) {
          if (status.className !== 'warn') status.className = 'warn';
          var warning = '北部共享质控：有 ' + inspection.unresolved.length + ' 个自动匹配项需要检查，暂不允许上传。';
          if (status.textContent !== warning) status.textContent = warning;
        }
        return;
      }

      if (meta) {
        meta.dataKeys = inspection.dataKeys.slice();
        meta.targets = inspection.targets.slice();
        meta.unresolvedTargets = [];
        item.autoMeta = meta;
      }
      var batch = item.batch || (meta && meta.batch) || (authority && authority.batch) || '第一轮';
      item.batch = batch;
      var path = router.sharedStoragePath(file.name, batch);
      if (destination && destination.textContent !== path) destination.textContent = path;
      row.classList.add('north-shared-authoritative');
      row.classList.add('auto-import-resolved');
      row.classList.remove('auto-import-needs-review');
      if (status) {
        var exact = !!authority || meta && meta.catalogExact;
        var text = (exact ? '北部登记材料已完整匹配：' : '北部共享质控已识别：') +
          '1份原文件 → ' + targetCount(inspection) + ' 个实际任务单元 × ' + inspection.dataKeys.length +
          '类成果；归档信息完整，仓库仅保存1份，统计自动关联。';
        if (status.className !== 'ok') status.className = 'ok';
        if (status.textContent !== text) status.textContent = text;
      }
    });
  }

  function addGuide() {
    var modal = document.getElementById('soilAdminImport');
    if (!modal || modal.querySelector('.north-quality-guide')) return;
    var guide = modal.querySelector('.adm-name-guide');
    if (!guide) return;
    var note = document.createElement('div');
    note.className = 'north-quality-guide';
    note.style.marginTop = '6px';
    note.style.color = '#1d4ed8';
    note.innerHTML = '<strong>北部片区共享质控：</strong>已登记的28份材料会按文件名、大小和SHA-256校验；文件名中的多个地区共用同一份原文件。当前确认对应土壤类型图、土壤属性图、耕地质量等级评价3类成果，批次和全部任务关联自动识别，不需要逐项指定。可直接选择原ZIP。';
    guide.appendChild(note);
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

  function expandSelectedZip() {
    var q = Q();
    if (!q || !q.state || !Array.isArray(q.state.files) || q.state.files.length !== 1) return;
    var selected = q.state.files[0];
    if (!selected.file || !/\.zip$/i.test(selected.file.name) || selected.__northZipExpanded) return;
    selected.__northZipExpanded = true;
    if (typeof q.progress === 'function') q.progress('正在解析质控ZIP并自动识别元数据……', 2, true);

    Promise.all([loadZip(), selected.file.arrayBuffer()])
      .then(function (result) { return result[0].loadAsync(result[1]); })
      .then(function (zip) {
        var entries = [];
        zip.forEach(function (path, entry) {
          if (!entry.dir && !/(^|\/)~\$/.test(path) && /\.(docx?|pdf)$/i.test(path)) {
            entries.push({path:path, entry:entry});
          }
        });
        var output = [];
        return entries.reduce(function (chain, current, index) {
          return chain.then(function () {
            if (typeof q.progress === 'function') {
              q.progress('正在解压并识别 ' + (index + 1) + ' / ' + entries.length, 3 + Math.round(index / Math.max(1, entries.length) * 10), true);
            }
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
        if (!files.length) throw new Error('ZIP中未找到可导入的 DOC/DOCX/PDF 文件。');
        var bridge = window.SoilNorthQualityAuthorityBridge;
        var ready = bridge && typeof bridge.ensureReady === 'function' ? bridge.ensureReady() : Promise.resolve();
        return ready.catch(function () {}).then(function () {
          if (typeof q.normalizePreparedFiles === 'function') q.normalizePreparedFiles(files);
          else q.state.files = files;
          if (C() && typeof C().applyItemMetadata === 'function') {
            (q.state.files || []).forEach(function (item) { C().applyItemMetadata(item); });
          }
          if (C() && typeof C().refresh === 'function') C().refresh();
          if (typeof q.renderPreview === 'function') q.renderPreview();
          if (typeof q.progress === 'function') q.progress('ZIP解析完成：共 ' + files.length + ' 份文件，3类成果及任务关联已自动匹配。', 14, true);
          setTimeout(annotateRows, 0);
        });
      })
      .catch(function (error) {
        selected.__northZipExpanded = false;
        if (typeof q.progress === 'function') q.progress('ZIP解析失败：' + error.message, 0, true);
      });
  }

  function bindZipPicker() {
    var picker = document.getElementById('adm-files');
    if (!picker || picker.__northQualityZipBound) return;
    picker.addEventListener('change', function () { setTimeout(expandSelectedZip, 0); });
    picker.__northQualityZipBound = true;
  }

  function wrapRender() {
    var q = Q();
    if (!q || typeof q.renderPreview !== 'function' || q.renderPreview.__northQualityWrapped) return;
    var original = q.renderPreview;
    var wrapped = function () {
      var result = original.apply(this, arguments);
      setTimeout(annotateRows, 0);
      return result;
    };
    wrapped.__northQualityWrapped = true;
    q.renderPreview = wrapped;
  }

  function wrapOpen() {
    var q = Q();
    if (!q || typeof q.open !== 'function' || q.open.__northQualityWrapped) return;
    var original = q.open;
    var wrapped = function () {
      var result = original.apply(this, arguments);
      setTimeout(refresh, 0);
      return result;
    };
    wrapped.__northQualityWrapped = true;
    q.open = wrapped;
    window.openSoilAdminImport = q.open;
  }

  function refresh() {
    ensureFirstRoundOption();
    addGuide();
    bindZipPicker();
    wrapRender();
    wrapOpen();
    annotateRows();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, {once:true});
  else refresh();
  setTimeout(refresh, 700);
  setTimeout(refresh, 1600);
})();
