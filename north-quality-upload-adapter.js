(function () {
  'use strict';

  if (window.__soilNorthQualityUploadAdapterInstalled) return;
  window.__soilNorthQualityUploadAdapterInstalled = true;

  function Q() { return window.SoilAdminImport; }
  function R() { return window.SoilQualityFileRouting; }

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
      var inspection = router.inspectFile(file.name, router.coveredKeys);
      var status = row.querySelector('.v2-file em');
      var destination = row.querySelector('.v2-file small');
      if (inspection.unresolved.length) {
        if (status) {
          status.className = 'warn';
          status.textContent = '北部共享质控：有 ' + inspection.unresolved.length + ' 个自动匹配项需要检查，暂不允许上传。';
        }
        return;
      }
      if (destination) {
        destination.textContent = router.sharedStoragePath(file.name, item.batch || '管理员导入');
      }
      if (status) {
        status.className = 'ok';
        status.textContent = '北部共享质控：1份原文件 → ' + targetCount(inspection) +
          ' 个任务单元 × 6类成果；仓库仅保存1份，统计自动关联。';
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
    note.innerHTML = '<strong>北部片区共享质控：</strong>文件名在“第三次全国土壤普查成果质控报告”前列出的多个地区，会自动关联到同一份质控报告；原文件只上传1份。当前此类综合报告自动覆盖土壤类型图、土壤属性图、耕地质量等级评价、土壤退化与障碍分析、土特产品土壤适宜性评价、土壤农业利用适宜性评价6类成果。可直接选择包含多份报告的ZIP，系统会先解压再逐文件自动识别。';
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
    if (typeof q.progress === 'function') q.progress('正在解析北部质控ZIP……', 2, true);
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
              q.progress('正在解压北部质控ZIP ' + (index + 1) + ' / ' + entries.length, 3 + Math.round(index / Math.max(1, entries.length) * 10), true);
            }
            return current.entry.async('blob').then(function (blob) {
              var path = stripCommonRoot(current.path) || current.path;
              output.push({
                file:new File([blob], path.split('/').pop(), {type:blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),
                path:path,
                sourcePath:current.path,
                batch:'第一轮'
              });
            });
          });
        }, Promise.resolve()).then(function () { return output; });
      })
      .then(function (files) {
        if (!files.length) throw new Error('ZIP中未找到可导入的 DOC/DOCX/PDF 文件。');
        if (typeof q.normalizePreparedFiles === 'function') q.normalizePreparedFiles(files);
        else q.state.files = files;
        q.state.files.forEach(function (item) { item.batch = item.batch || '第一轮'; });
        if (typeof q.renderPreview === 'function') q.renderPreview();
        var batch = document.getElementById('adm-batch');
        if (batch) batch.value = '第一轮';
        if (typeof q.progress === 'function') q.progress('ZIP解析完成：共 ' + files.length + ' 份质控报告，正在按文件名自动关联。', 14, true);
        setTimeout(annotateRows, 0);
      })
      .catch(function (error) {
        selected.__northZipExpanded = false;
        if (typeof q.progress === 'function') q.progress('ZIP解析失败：' + error.message, 0, true);
      });
  }

  function bindZipPicker() {
    var picker = document.getElementById('adm-files');
    if (!picker || picker.__northQualityZipBound) return;
    picker.addEventListener('change', function () {
      setTimeout(expandSelectedZip, 0);
    });
    picker.__northQualityZipBound = true;
  }

  function refresh() {
    ensureFirstRoundOption();
    addGuide();
    bindZipPicker();
    annotateRows();
  }

  function install() {
    refresh();
    var list = document.getElementById('adm-list');
    if (list && !list.__northQualityObserver) {
      var observer = new MutationObserver(function () { setTimeout(refresh, 0); });
      observer.observe(list, {childList:true, subtree:true});
      list.__northQualityObserver = observer;
    }
    var batch = document.getElementById('adm-batch');
    if (batch && !batch.__northQualityBound) {
      batch.addEventListener('change', function () { setTimeout(annotateRows, 0); });
      batch.__northQualityBound = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(install, 700);
  setTimeout(install, 1600);
})();
