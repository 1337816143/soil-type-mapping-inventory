(function () {
  'use strict';

  var A = window.SoilRepoAdmin;
  var Q = window.SoilAdminImport;
  if (!A || !Q) return;

  function isReferenceMode() {
    var kind = document.getElementById('adm-kind');
    return !!kind && kind.value === 'reference';
  }

  function relativeDirectory(path) {
    var value = String(path || '').replace(/\\/g, '/');
    var index = value.lastIndexOf('/');
    return index >= 0 ? value.slice(0, index) : '';
  }

  function clearStructuredMetadata() {
    if (!isReferenceMode() || !Q.state || !Array.isArray(Q.state.files)) return;
    Q.state.files.forEach(function (item) {
      item.batch = '';
      item.city = '';
      item.unit = '';
      item.district = '';
      item.archiveDirectory = relativeDirectory(item.path);
    });
  }

  function decorateReferencePreview() {
    var modal = document.getElementById('soilAdminImport');
    if (!modal) return;

    var reference = isReferenceMode();
    modal.classList.toggle('reference-import-mode', reference);
    if (!reference) return;

    clearStructuredMetadata();

    var rows = modal.querySelectorAll('#adm-list .v2-row');
    rows.forEach(function (row, index) {
      var item = Q.state && Q.state.files ? Q.state.files[index] : null;
      var status = row.querySelector('.v2-file em');
      if (status && item) {
        var directory = item.archiveDirectory || '归档根目录';
        var text = '识别归档目录：' + directory;
        status.className = 'ok';
        if (status.textContent !== text) status.textContent = text;
      }
    });

    var preview = modal.querySelector('#adm-list');
    if (preview && preview.parentElement) {
      var label = preview.parentElement.querySelector('label');
      var labelText = '上传预览（仅核对文件与归档目录，可拖动排序）';
      if (label && label.textContent !== labelText) label.textContent = labelText;
    }
  }

  function scheduleDecorate() {
    setTimeout(decorateReferencePreview, 0);
    setTimeout(decorateReferencePreview, 120);
    setTimeout(decorateReferencePreview, 700);
  }

  function installStyles() {
    if (document.getElementById('reference-import-mode-style')) return;
    var style = document.createElement('style');
    style.id = 'reference-import-mode-style';
    style.textContent =
      '.reference-import-mode .v2-fields{display:none!important}' +
      '.reference-import-mode .v2-row{grid-template-columns:24px minmax(0,1fr)!important}' +
      '.reference-import-mode .v2-file em.ok{color:#15803d}' +
      '.reference-import-mode #adm-quality-fields{display:none!important}' +
      '@media(max-width:760px){.reference-import-mode .v2-row{grid-template-columns:18px minmax(0,1fr)!important}}';
    document.head.appendChild(style);
  }

  function wrapPreparedFiles() {
    if (Q.__referenceModeWrapped) return;
    Q.__referenceModeWrapped = true;

    if (typeof Q.normalizePreparedFiles === 'function') {
      var originalNormalize = Q.normalizePreparedFiles;
      Q.normalizePreparedFiles = function (files) {
        var result = originalNormalize(files);
        clearStructuredMetadata();
        scheduleDecorate();
        return result;
      };
    }

    if (typeof Q.acceptSplitFiles === 'function') {
      var originalAcceptSplit = Q.acceptSplitFiles;
      Q.acceptSplitFiles = function (files) {
        var result = originalAcceptSplit(files);
        clearStructuredMetadata();
        scheduleDecorate();
        return result;
      };
    }
  }

  function bind() {
    installStyles();
    wrapPreparedFiles();

    var modal = document.getElementById('soilAdminImport');
    if (!modal || modal.dataset.referenceModeBound === '1') {
      scheduleDecorate();
      return;
    }
    modal.dataset.referenceModeBound = '1';

    modal.addEventListener('change', function (event) {
      if (event.target && (event.target.id === 'adm-kind' || event.target.id === 'adm-files' || event.target.id === 'adm-folder')) {
        scheduleDecorate();
      }
    });

    var observer = new MutationObserver(function () {
      if (isReferenceMode()) decorateReferencePreview();
    });
    observer.observe(modal, {childList: true, subtree: true});
    scheduleDecorate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
  setTimeout(bind, 900);
  setTimeout(bind, 1800);
})();
