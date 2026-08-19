(function () {
  'use strict';

  var A = window.SoilRepoAdmin;
  var Q = window.SoilAdminImport;
  if (!A || !Q) return;

  function isReferenceContext() {
    return !!(Q.state && Q.state.context && Q.state.context.kind === 'reference');
  }

  function relativeDirectory(path) {
    var value = String(path || '').replace(/\\/g, '/');
    var index = value.lastIndexOf('/');
    return index >= 0 ? value.slice(0, index) : '';
  }

  function referenceMeta(item) {
    return {
      kind:'reference',
      confidence:'explicit-reference-context',
      catalogExact:false,
      catalogMatched:false,
      batch:'',
      dataKeys:[],
      targets:[],
      association:null,
      associations:[],
      unresolvedTargets:[],
      expectedSha256:'',
      expectedSize:Number(item && item.file && item.file.size || 0),
      source:'explicit-reference-context'
    };
  }

  function forceReferenceItem(item) {
    if (!item) return item;
    item.batch = '';
    item.city = '';
    item.unit = '';
    item.district = '';
    item.archiveDirectory = relativeDirectory(item.path);
    item.autoMeta = referenceMeta(item);
    return item;
  }

  function clearStructuredMetadata() {
    if (!isReferenceContext() || !Q.state || !Array.isArray(Q.state.files)) return;
    Q.state.files.forEach(forceReferenceItem);
  }

  function ensureReferenceMode(notify) {
    if (!isReferenceContext()) return false;
    var kind = document.getElementById('adm-kind');
    if (!kind) return false;
    var changed = kind.value !== 'reference';
    if (changed) kind.value = 'reference';
    if (changed && notify && typeof kind.onchange === 'function') kind.onchange();
    return true;
  }

  function isReferenceMode() {
    var kind = document.getElementById('adm-kind');
    return isReferenceContext() || (!!kind && kind.value === 'reference');
  }

  function patchClassifier() {
    var classifier = window.SoilAdminAutoClassifier;
    if (!classifier || classifier.__referenceContextPatched) return;
    classifier.__referenceContextPatched = true;

    if (typeof classifier.classifyItem === 'function') {
      var originalClassify = classifier.classifyItem;
      classifier.classifyItem = function (item) {
        if (isReferenceContext()) {
          forceReferenceItem(item);
          return item && item.autoMeta || referenceMeta(item);
        }
        return originalClassify.apply(this, arguments);
      };
    }

    if (typeof classifier.applyItemMetadata === 'function') {
      var originalApply = classifier.applyItemMetadata;
      classifier.applyItemMetadata = function (item) {
        if (isReferenceContext()) {
          forceReferenceItem(item);
          return item && item.autoMeta || referenceMeta(item);
        }
        return originalApply.apply(this, arguments);
      };
    }

    if (typeof classifier.selectionMetadata === 'function') {
      var originalSelection = classifier.selectionMetadata;
      classifier.selectionMetadata = function (files) {
        if (isReferenceContext()) {
          var list = Array.isArray(files) ? files : [];
          var metas = list.map(function (item) {
            forceReferenceItem(item);
            return item.autoMeta;
          });
          return {
            metas:metas,
            kind:'reference',
            batch:'',
            unresolved:0,
            catalogExact:0,
            catalogMatched:0
          };
        }
        return originalSelection.apply(this, arguments);
      };
    }

    if (typeof classifier.refresh === 'function') {
      var originalRefresh = classifier.refresh;
      classifier.refresh = function () {
        if (isReferenceContext()) {
          clearStructuredMetadata();
          scheduleDecorate();
          return typeof classifier.selectionMetadata === 'function' ? classifier.selectionMetadata(Q.state && Q.state.files || []) : null;
        }
        return originalRefresh.apply(this, arguments);
      };
    }
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
      '.reference-import-mode .auto-import-summary{display:none!important}' +
      '.reference-import-summary{margin:0 0 10px;padding:10px 12px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:.74rem;line-height:1.65}' +
      '@media(max-width:760px){.reference-import-mode .v2-row{grid-template-columns:18px minmax(0,1fr)!important}}';
    document.head.appendChild(style);
  }

  function renderReferenceSummary(modal) {
    if (!modal || !isReferenceContext()) return;
    var summary = modal.querySelector('.reference-import-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'reference-import-summary';
      var list = document.getElementById('adm-list');
      var holder = list && list.closest ? list.closest('.adm-field') : null;
      if (holder && holder.parentNode) holder.parentNode.insertBefore(summary, holder);
      else return;
    }
    var text = '参考资料模式：仅按归档根目录和子目录保存，不参与成果类型、批次、市、作业单位或任务单元自动归类。';
    if (summary.textContent !== text) summary.textContent = text;
  }

  function decorateReferencePreview() {
    var modal = document.getElementById('soilAdminImport');
    if (!modal) return;

    if (isReferenceContext()) ensureReferenceMode(false);
    var reference = isReferenceMode();
    modal.classList.toggle('reference-import-mode', reference);
    if (!reference) return;

    clearStructuredMetadata();
    renderReferenceSummary(modal);

    var rows = modal.querySelectorAll('#adm-list .v2-row');
    Array.prototype.forEach.call(rows, function (row, index) {
      var itemIndex = row.dataset && row.dataset.i != null ? Number(row.dataset.i) : index;
      var item = Q.state && Q.state.files ? Q.state.files[itemIndex] : null;
      var status = row.querySelector('.v2-file em');
      if (status && item) {
        var directory = item.archiveDirectory || '归档根目录';
        var text = '参考资料归档目录：' + directory;
        if (status.textContent !== text) status.textContent = text;
        if (status.className !== 'ok') status.className = 'ok';
      }
    });

    var preview = document.getElementById('adm-list');
    if (preview && preview.parentElement) {
      var label = preview.parentElement.querySelector('label');
      var labelText = '上传预览（仅核对文件与归档目录，可拖动排序）';
      if (label && label.textContent !== labelText) label.textContent = labelText;
    }
  }

  function scheduleDecorate() {
    [0, 80, 240, 700].forEach(function (delay) {
      setTimeout(decorateReferencePreview, delay);
    });
  }

  function wrapPreparedFiles() {
    if (Q.__referenceModeWrapped) return;
    Q.__referenceModeWrapped = true;

    if (typeof Q.normalizePreparedFiles === 'function') {
      var originalNormalize = Q.normalizePreparedFiles;
      Q.normalizePreparedFiles = function (files) {
        var result = originalNormalize.apply(this, arguments);
        if (isReferenceContext()) clearStructuredMetadata();
        scheduleDecorate();
        return result;
      };
    }

    if (typeof Q.acceptSplitFiles === 'function') {
      var originalAcceptSplit = Q.acceptSplitFiles;
      Q.acceptSplitFiles = function (files) {
        var result = originalAcceptSplit.apply(this, arguments);
        if (isReferenceContext()) clearStructuredMetadata();
        scheduleDecorate();
        return result;
      };
    }

    if (typeof Q.renderPreview === 'function') {
      var originalRender = Q.renderPreview;
      Q.renderPreview = function () {
        var result = originalRender.apply(this, arguments);
        scheduleDecorate();
        return result;
      };
    }
  }

  function wrapOpen() {
    if (Q.__referenceOpenStabilityWrapped || typeof Q.open !== 'function') return;
    Q.__referenceOpenStabilityWrapped = true;
    var originalOpen = Q.open;
    Q.open = function () {
      var result = originalOpen.apply(this, arguments);
      patchClassifier();
      if (isReferenceContext()) {
        ensureReferenceMode(true);
        clearStructuredMetadata();
        scheduleDecorate();
      }
      return result;
    };
    window.openSoilAdminImport = Q.open;
  }

  function guardReferenceKind(event) {
    var target = event && event.target;
    if (!target || target.id !== 'adm-kind' || !isReferenceContext()) return;
    if (target.value !== 'reference') target.value = 'reference';
    clearStructuredMetadata();
    scheduleDecorate();
  }

  function guardSubmit(event) {
    var button = event && event.target && event.target.closest && event.target.closest('#adm-ok');
    if (!button || !isReferenceContext()) return;
    patchClassifier();
    ensureReferenceMode(false);
    clearStructuredMetadata();
    decorateReferencePreview();
  }

  function guardInputs(event) {
    var target = event && event.target;
    if (!target || !isReferenceContext()) return;
    if (target.id === 'adm-files' || target.id === 'adm-folder' || target.id === 'adm-directory' || target.id === 'adm-new-directory') {
      scheduleDecorate();
    }
  }

  function bindDocumentGuards() {
    if (window.__soilReferenceImportGuardsBound) return;
    window.__soilReferenceImportGuardsBound = true;
    document.addEventListener('click', guardSubmit, true);
    document.addEventListener('change', guardReferenceKind, true);
    document.addEventListener('change', guardInputs, true);
    document.addEventListener('input', guardInputs, true);
  }

  function install() {
    installStyles();
    patchClassifier();
    wrapPreparedFiles();
    wrapOpen();
    bindDocumentGuards();
    scheduleDecorate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  [300, 900, 1800].forEach(function (delay) { setTimeout(install, delay); });
})();
