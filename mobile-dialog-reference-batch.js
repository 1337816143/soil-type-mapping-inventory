(function () {
  'use strict';

  if (window.__soilMobileDialogReferenceBatchInstalled) return;
  window.__soilMobileDialogReferenceBatchInstalled = true;

  var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  var referenceState = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function basename(path) {
    var clean = String(path || '').split(/[?#]/)[0].replace(/\\/g, '/');
    try { clean = decodeURIComponent(clean); } catch (error) {}
    return clean.slice(clean.lastIndexOf('/') + 1) || '文件';
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort(function (a, b) {
      return String(a).localeCompare(String(b), 'zh-CN');
    });
  }

  function syncVisualViewport() {
    var viewport = window.visualViewport;
    var height = viewport && viewport.height ? viewport.height : window.innerHeight;
    var top = viewport && typeof viewport.offsetTop === 'number' ? viewport.offsetTop : 0;
    document.documentElement.style.setProperty('--soil-visual-height', Math.max(320, Math.round(height || 0)) + 'px');
    document.documentElement.style.setProperty('--soil-visual-top', Math.max(0, Math.round(top || 0)) + 'px');
  }

  function addResponsiveStyles() {
    if (document.getElementById('soil-mobile-dialog-reference-style')) return;
    var style = document.createElement('style');
    style.id = 'soil-mobile-dialog-reference-style';
    style.textContent =
      'body:has(.soil-file-modal){overflow:hidden!important}' +
      '.soil-reference-batch-trigger{white-space:nowrap}' +
      '.soil-reference-batch-note{margin-top:10px;font-size:.69rem;line-height:1.65;color:#64748b}' +
      '.soil-reference-type-list{max-height:300px;overflow:auto}' +
      '.soil-reference-batch-dialog .soil-batch-filters{min-width:0}' +
      '@media(max-width:760px){' +
        '.soil-file-modal{box-sizing:border-box!important;top:var(--soil-visual-top,0px)!important;left:0!important;right:auto!important;bottom:auto!important;width:100vw!important;height:var(--soil-visual-height,100dvh)!important;max-height:var(--soil-visual-height,100dvh)!important;align-items:stretch!important;justify-content:stretch!important;padding:max(4px,env(safe-area-inset-top)) max(4px,env(safe-area-inset-right)) max(4px,env(safe-area-inset-bottom)) max(4px,env(safe-area-inset-left))!important;overflow:hidden!important;overscroll-behavior:contain!important}' +
        '.soil-file-dialog,.soil-batch-dialog,.soil-reference-batch-dialog{box-sizing:border-box!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;min-height:0!important;margin:0!important;border-radius:10px!important;overflow:hidden!important}' +
        '.soil-file-head{position:relative!important;z-index:30!important;flex:0 0 auto!important;min-height:48px!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;gap:6px!important;flex-wrap:wrap!important;padding:8px 66px 8px 10px!important;background:#f8fafc!important}' +
        '.soil-file-title{flex:1 1 100%!important;min-width:0!important;max-width:100%!important;padding-right:0!important;font-size:.78rem!important}' +
        '.soil-file-head-actions{display:flex!important;flex:1 1 auto!important;min-width:0!important;max-width:100%!important;gap:6px!important;overflow-x:auto!important;overscroll-behavior-x:contain!important;scrollbar-width:none}' +
        '.soil-file-head-actions::-webkit-scrollbar{display:none}' +
        '.soil-modal-close{position:absolute!important;z-index:40!important;top:8px!important;right:8px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:50px!important;min-height:36px!important;margin:0!important}' +
        '.soil-file-modal-content{flex:1 1 auto!important;min-height:0!important;max-height:100%!important;overflow:hidden!important}' +
        '.soil-file-body{min-height:0!important;max-height:100%!important}' +
        '.soil-batch-body{grid-template-columns:1fr!important;grid-template-rows:auto minmax(0,1fr)!important;min-height:0!important;height:100%!important;overflow:hidden!important}' +
        '.soil-batch-filters{box-sizing:border-box!important;max-height:min(34dvh,220px)!important;min-height:0!important;overflow:auto!important;border-right:0!important;border-bottom:1px solid #e2e8f0!important;padding:10px!important;overscroll-behavior:contain!important}' +
        '.soil-batch-results{min-height:0!important;overflow:hidden!important}' +
        '.soil-batch-toolbar{flex:0 0 auto!important;padding:7px!important;gap:6px!important}' +
        '.soil-batch-list{flex:1 1 auto!important;min-height:100px!important;overflow:auto!important;overscroll-behavior:contain!important;padding:6px 7px!important}' +
        '.soil-batch-progress{flex:0 0 auto!important;padding:7px 9px max(7px,env(safe-area-inset-bottom))!important}' +
        '.soil-filter-options,.soil-reference-type-list{max-height:150px!important}' +
        '.soil-file-action{min-height:36px!important;box-sizing:border-box!important}' +
      '}' +
      '@media(max-width:360px){' +
        '.soil-file-head{min-height:46px!important;padding-left:7px!important;padding-right:61px!important}' +
        '.soil-modal-close{right:6px!important;top:6px!important;min-width:48px!important;min-height:34px!important}' +
        '.soil-file-action{padding:6px 8px!important;font-size:.68rem!important}' +
        '.soil-batch-filters{max-height:min(30dvh,180px)!important;padding:8px!important}' +
        '.soil-batch-search{padding:8px!important}' +
        '.soil-filter-group summary{padding:8px!important}' +
      '}' +
      '@media(max-width:760px) and (max-height:650px){' +
        '.soil-file-head{min-height:44px!important;padding-top:6px!important;padding-bottom:6px!important}' +
        '.soil-modal-close{top:6px!important}' +
        '.soil-batch-filters{max-height:min(28dvh,165px)!important}' +
        '.soil-filter-options,.soil-reference-type-list{max-height:110px!important}' +
      '}' +
      '@media(orientation:landscape) and (max-height:500px){' +
        '.soil-file-modal{padding:3px max(3px,env(safe-area-inset-right)) 3px max(3px,env(safe-area-inset-left))!important}' +
        '.soil-file-head{min-height:40px!important;padding-top:4px!important;padding-bottom:4px!important}' +
        '.soil-modal-close{top:4px!important;min-height:32px!important}' +
        '.soil-batch-body{grid-template-columns:minmax(230px,34vw) minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)!important}' +
        '.soil-batch-filters{height:100%!important;max-height:none!important;border-right:1px solid #e2e8f0!important;border-bottom:0!important}' +
        '.soil-filter-options,.soil-reference-type-list{max-height:95px!important}' +
      '}';
    document.head.appendChild(style);
  }

  function ensureJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    var existing = document.getElementById('soil-public-jszip') || document.getElementById('soil-reference-jszip');
    if (existing && existing.__soilReferenceZipPromise) return existing.__soilReferenceZipPromise;
    var script = existing || document.createElement('script');
    script.id = script.id || 'soil-reference-jszip';
    script.async = true;
    script.src = script.src || JSZIP_URL;
    script.__soilReferenceZipPromise = new Promise(function (resolve, reject) {
      script.addEventListener('load', function () {
        if (window.JSZip) resolve(window.JSZip);
        else reject(new Error('ZIP组件加载后未初始化'));
      }, {once:true});
      script.addEventListener('error', function () { reject(new Error('ZIP组件加载失败')); }, {once:true});
    });
    if (!existing) document.head.appendChild(script);
    return script.__soilReferenceZipPromise;
  }

  function fetchBlob(url) {
    return fetch(url, {cache:'no-store'}).then(function (response) {
      if (!response.ok) throw new Error('文件读取失败（HTTP ' + response.status + '）');
      return response.blob();
    });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name || '参考资料.zip';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1800);
  }

  function timestampName() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  function normalizeReferenceCategory(path) {
    var compact = String(path || '').replace(/[\s_\-—·｜|/]+/g, '');
    if (compact.indexOf('土壤类型图') >= 0) return '土壤类型图';
    if (compact.indexOf('土壤属性图') >= 0) return '土壤属性图';
    if (compact.indexOf('耕地质量等级评价') >= 0 || compact.indexOf('耕地质量评价') >= 0) return '耕地质量等级评价';
    if (compact.indexOf('土壤退化与障碍分析') >= 0) return '土壤退化与障碍分析';
    if (compact.indexOf('土特产品土壤适宜性评价') >= 0 || compact.indexOf('土特产品适宜性评价') >= 0) return '土特产品土壤适宜性评价';
    if (compact.indexOf('土壤农业利用适宜性评价') >= 0) return '土壤农业利用适宜性评价';
    if (compact.indexOf('土地资源评价与利用报告') >= 0) return '土地资源评价与利用报告';
    return '其他资料';
  }

  function referenceCatalog() {
    var admin = window.SoilRepoAdmin;
    if (!admin || !Array.isArray(admin.tree)) return [];
    var root = String(admin.referenceRoot || 'reference-files/third-soil-survey');
    return admin.tree.filter(function (entry) {
      return entry && entry.type === 'blob' &&
        String(entry.path || '').indexOf(root + '/') === 0 &&
        !/(^|\/)(README\.md|manifest\.json|archive\.json)$/i.test(String(entry.path || '')) &&
        !/(^|\/)~\$/.test(String(entry.path || ''));
    }).map(function (entry) {
      var path = String(entry.path || '');
      var relative = path.slice(root.length + 1);
      return {
        repoPath:path,
        relativePath:relative,
        name:basename(path),
        resultType:normalizeReferenceCategory(relative),
        size:Number(entry.size || 0),
        sourceUrl:admin.raw(path)
      };
    }).sort(function (a, b) { return a.relativePath.localeCompare(b.relativePath, 'zh-CN'); });
  }

  function sizeText(bytes) {
    bytes = Number(bytes || 0);
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(bytes >= 10485760 ? 1 : 2) + ' MB';
  }

  function closeReferenceModal() {
    var modal = document.getElementById('soil-reference-batch-download-modal');
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    referenceState = null;
  }

  function selectedReferenceTypes(modal) {
    return new Set(Array.prototype.map.call(modal.querySelectorAll('input[data-reference-type]:checked'), function (input) {
      return input.value;
    }));
  }

  function matchingReferences(modal) {
    var types = selectedReferenceTypes(modal);
    var query = String(modal.querySelector('#soil-reference-search').value || '').trim().toLowerCase();
    return referenceState.catalog.filter(function (item) {
      if (types.size && !types.has(item.resultType)) return false;
      if (!query) return true;
      var haystack = [item.name, item.relativePath, item.resultType].join(' ').toLowerCase();
      return query.split(/\s+/).filter(Boolean).every(function (token) { return haystack.indexOf(token) >= 0; });
    });
  }

  function renderReferenceResults(modal) {
    var matches = matchingReferences(modal);
    referenceState.matches = matches;
    var list = modal.querySelector('#soil-reference-list');
    if (!matches.length) {
      list.innerHTML = '<div class="soil-batch-empty">没有符合当前成果类型或搜索条件的参考资料。</div>';
    } else {
      list.innerHTML = matches.map(function (item) {
        return '<label class="soil-batch-item">' +
          '<input type="checkbox" data-reference-path="' + esc(item.repoPath) + '" ' + (referenceState.selected.has(item.repoPath) ? 'checked' : '') + '>' +
          '<span><div class="soil-batch-name">' + esc(item.name) + '</div>' +
          '<div class="soil-batch-meta">成果类型：' + esc(item.resultType) + '　|　' + esc(sizeText(item.size)) + '<br>' + esc(item.relativePath) + '</div></span>' +
        '</label>';
      }).join('');
    }
    var count = modal.querySelector('#soil-reference-count');
    count.textContent = '匹配 ' + matches.length + ' 个文件 · 已选 ' + referenceState.selected.size + ' 个';
    var selectedTypes = selectedReferenceTypes(modal).size;
    modal.querySelector('#soil-reference-type-summary').textContent = '按成果类型选择' + (selectedTypes ? '（已选' + selectedTypes + '）' : '（全部）');
    modal.querySelector('#soil-reference-download').disabled = referenceState.selected.size === 0;
  }

  function referenceZipPath(item) {
    return String(item.relativePath || item.name).replace(/^\/+/, '');
  }

  function setReferenceProgress(modal, text) {
    var node = modal.querySelector('#soil-reference-progress');
    if (node) node.textContent = text;
  }

  function downloadReferenceZip(modal) {
    var items = referenceState.catalog.filter(function (item) { return referenceState.selected.has(item.repoPath); });
    if (!items.length) return;
    if (items.length > 80 && !window.confirm('已选择 ' + items.length + ' 个参考文件。浏览器需要读取文件后再生成ZIP，可能占用较多内存和时间。是否继续？')) return;

    var button = modal.querySelector('#soil-reference-download');
    button.disabled = true;
    button.textContent = '正在准备 ZIP…';
    setReferenceProgress(modal, '正在加载 ZIP 组件……');

    ensureJSZip().then(function () {
      var zip = new window.JSZip();
      var queueIndex = 0;
      var completed = 0;
      var failed = [];
      var workerCount = Math.min(4, items.length);

      function worker() {
        if (queueIndex >= items.length) return Promise.resolve();
        var item = items[queueIndex++];
        return fetchBlob(item.sourceUrl).then(function (blob) {
          zip.file(referenceZipPath(item), blob, {binary:true});
        }).catch(function (error) {
          failed.push(item.name + '：' + error.message);
        }).then(function () {
          completed += 1;
          setReferenceProgress(modal, '正在读取参考文件 ' + completed + ' / ' + items.length + (failed.length ? ' · 失败 ' + failed.length + ' 个' : ''));
          return worker();
        });
      }

      var workers = [];
      for (var i = 0; i < workerCount; i++) workers.push(worker());
      return Promise.all(workers).then(function () {
        if (failed.length === items.length) throw new Error('所有文件都读取失败，无法生成ZIP。');
        setReferenceProgress(modal, '文件读取完成，正在压缩……');
        return zip.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:4}}, function (meta) {
          setReferenceProgress(modal, '正在生成 ZIP：' + Math.round(meta.percent || 0) + '%');
        }).then(function (blob) {
          downloadBlob(blob, '三普参考资料_' + timestampName() + '.zip');
          if (failed.length) {
            setReferenceProgress(modal, 'ZIP 已生成；其中 ' + failed.length + ' 个文件读取失败。');
            alert('ZIP 已生成，但有 ' + failed.length + ' 个文件读取失败，可缩小筛选范围后重试。');
          } else {
            setReferenceProgress(modal, '批量下载完成：共 ' + items.length + ' 个参考文件。');
          }
        });
      });
    }).catch(function (error) {
      setReferenceProgress(modal, '批量下载失败：' + error.message);
      alert('批量下载失败：' + error.message);
    }).finally(function () {
      if (!document.body.contains(button)) return;
      button.disabled = !referenceState || referenceState.selected.size === 0;
      button.textContent = '下载已选 ZIP';
    });
  }

  function openReferenceBatchDownload() {
    addResponsiveStyles();
    syncVisualViewport();
    var admin = window.SoilRepoAdmin;
    if (!admin) {
      alert('参考资料目录尚未初始化，请稍后重试。');
      return;
    }

    var ready = Array.isArray(admin.tree) && admin.tree.length ? Promise.resolve(admin.tree) : admin.loadTree(false);
    ready.then(function () {
      var catalog = referenceCatalog();
      if (!catalog.length) {
        alert('当前没有可批量下载的参考资料。');
        return;
      }

      closeReferenceModal();
      referenceState = {catalog:catalog, matches:[], selected:new Set()};
      var types = uniqueSorted(catalog.map(function (item) { return item.resultType; }));
      var modal = document.createElement('div');
      modal.id = 'soil-reference-batch-download-modal';
      modal.className = 'soil-file-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', '批量下载参考资料');
      modal.innerHTML =
        '<div class="soil-file-dialog soil-batch-dialog soil-reference-batch-dialog">' +
          '<div class="soil-file-head">' +
            '<div class="soil-file-title">批量下载参考资料</div>' +
            '<div class="soil-file-head-actions"></div>' +
            '<button type="button" class="soil-file-action soil-modal-close" aria-label="关闭批量下载窗口">关闭</button>' +
          '</div>' +
          '<div class="soil-file-modal-content" style="display:flex;flex:1;min-height:0;flex-direction:column">' +
            '<div class="soil-batch-body">' +
              '<aside class="soil-batch-filters">' +
                '<input id="soil-reference-search" class="soil-batch-search" type="search" placeholder="搜索文件名、目录或成果类型">' +
                '<details class="soil-filter-group" open>' +
                  '<summary id="soil-reference-type-summary">按成果类型选择（全部）</summary>' +
                  '<div class="soil-filter-options soil-reference-type-list">' + types.map(function (type) {
                    return '<label class="soil-filter-option"><input type="checkbox" data-reference-type value="' + esc(type) + '"><span>' + esc(type) + '</span></label>';
                  }).join('') + '</div>' +
                '</details>' +
                '<button id="soil-reference-reset" type="button" class="soil-file-action soil-filter-reset">清空筛选条件</button>' +
                '<div class="soil-reference-batch-note">可按成果类型多选，也可叠加搜索。批量下载对所有访问者开放，不需要管理员密码；压缩包保持参考资料原目录层级。</div>' +
              '</aside>' +
              '<section class="soil-batch-results">' +
                '<div class="soil-batch-toolbar">' +
                  '<button id="soil-reference-select-all" type="button" class="soil-file-action">全选当前结果</button>' +
                  '<button id="soil-reference-clear" type="button" class="soil-file-action">取消全部</button>' +
                  '<button id="soil-reference-download" type="button" class="soil-file-action success" disabled>下载已选 ZIP</button>' +
                  '<span id="soil-reference-count" class="soil-batch-count"></span>' +
                '</div>' +
                '<div id="soil-reference-list" class="soil-batch-list"></div>' +
                '<div id="soil-reference-progress" class="soil-batch-progress">请选择需要下载的参考资料。</div>' +
              '</section>' +
            '</div>' +
          '</div>' +
        '</div>';

      modal.addEventListener('click', function (event) {
        if (event.target === modal || (event.target.closest && event.target.closest('.soil-modal-close'))) closeReferenceModal();
      });
      modal.addEventListener('change', function (event) {
        var typeInput = event.target.closest && event.target.closest('input[data-reference-type]');
        if (typeInput) { renderReferenceResults(modal); return; }
        var fileInput = event.target.closest && event.target.closest('input[data-reference-path]');
        if (fileInput) {
          var path = fileInput.getAttribute('data-reference-path');
          if (fileInput.checked) referenceState.selected.add(path);
          else referenceState.selected.delete(path);
          renderReferenceResults(modal);
        }
      });

      document.body.appendChild(modal);
      var timer = null;
      modal.querySelector('#soil-reference-search').addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { renderReferenceResults(modal); }, 80);
      });
      modal.querySelector('#soil-reference-select-all').addEventListener('click', function () {
        referenceState.matches.forEach(function (item) { referenceState.selected.add(item.repoPath); });
        renderReferenceResults(modal);
      });
      modal.querySelector('#soil-reference-clear').addEventListener('click', function () {
        referenceState.selected.clear();
        renderReferenceResults(modal);
      });
      modal.querySelector('#soil-reference-reset').addEventListener('click', function () {
        modal.querySelectorAll('input[data-reference-type]').forEach(function (input) { input.checked = false; });
        modal.querySelector('#soil-reference-search').value = '';
        renderReferenceResults(modal);
      });
      modal.querySelector('#soil-reference-download').addEventListener('click', function () { downloadReferenceZip(modal); });
      renderReferenceResults(modal);
    }).catch(function (error) {
      alert('参考资料目录读取失败：' + error.message);
    });
  }

  function ensureReferenceBatchButton() {
    var tools = document.querySelector('#ref-root .ref-tools');
    if (!tools || document.getElementById('ref-batch-download')) return;
    var button = document.createElement('button');
    button.id = 'ref-batch-download';
    button.type = 'button';
    button.className = 'ref-btn alt soil-reference-batch-trigger';
    button.textContent = '批量下载';
    button.title = '按成果类型筛选并批量下载参考资料';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openReferenceBatchDownload();
    });
    var deleteButton = document.getElementById('ref-delete');
    if (deleteButton) deleteButton.insertAdjacentElement('afterend', button);
    else tools.appendChild(button);
  }

  function hookReferenceLibrary() {
    var admin = window.SoilRepoAdmin;
    if (!admin || typeof admin.loadTree !== 'function' || admin.loadTree.__soilReferenceBatchWrapped) return;
    var original = admin.loadTree;
    var wrapped = function () {
      return Promise.resolve(original.apply(this, arguments)).then(function (tree) {
        setTimeout(ensureReferenceBatchButton, 0);
        return tree;
      });
    };
    wrapped.__soilReferenceBatchWrapped = true;
    admin.loadTree = wrapped;
  }

  function bindReferenceTab() {
    var tab = document.querySelector('[data-tab="references"]');
    if (!tab || tab.__soilReferenceBatchBound) return;
    tab.__soilReferenceBatchBound = true;
    tab.addEventListener('click', function () {
      setTimeout(ensureReferenceBatchButton, 60);
      setTimeout(ensureReferenceBatchButton, 350);
    });
  }

  function install() {
    addResponsiveStyles();
    syncVisualViewport();
    hookReferenceLibrary();
    bindReferenceTab();
    ensureReferenceBatchButton();
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisualViewport, {passive:true});
    window.visualViewport.addEventListener('scroll', syncVisualViewport, {passive:true});
  }
  window.addEventListener('resize', syncVisualViewport, {passive:true});
  window.addEventListener('orientationchange', function () { setTimeout(syncVisualViewport, 120); }, {passive:true});
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && document.getElementById('soil-reference-batch-download-modal')) closeReferenceModal();
  });
  window.addEventListener('soil-app-ready', function () {
    setTimeout(function () { hookReferenceLibrary(); bindReferenceTab(); ensureReferenceBatchButton(); }, 0);
  });

  window.SoilReferenceBatchDownload = {
    open:openReferenceBatchDownload,
    buildCatalog:referenceCatalog,
    ensureButton:ensureReferenceBatchButton,
    syncViewport:syncVisualViewport
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  setTimeout(install, 700);
})();
