(function () {
  'use strict';

  if (window.__soilDocumentPreviewControlsInstalled) return;
  window.__soilDocumentPreviewControlsInstalled = true;

  var PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  var PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  var DOCX_PREVIEW_URL = 'https://cdn.jsdelivr.net/npm/docx-preview@0.4.0/dist/docx-preview.min.js';
  var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  var state = null;
  var originalOpenPreview = window.SoilFileAccess && window.SoilFileAccess.openPreview;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function extension(name) {
    var clean = String(name || '').split(/[?#]/)[0];
    var match = clean.match(/\.([^.\/]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  function basename(path) {
    var clean = String(path || '').split(/[?#]/)[0].replace(/\\/g, '/');
    try { clean = decodeURIComponent(clean); } catch (error) {}
    return clean.slice(clean.lastIndexOf('/') + 1) || '文件';
  }

  function absoluteUrl(href) {
    try { return new URL(String(href || ''), window.location.href).toString(); }
    catch (error) { return String(href || ''); }
  }

  function loadScriptOnce(id, src, ready) {
    if (ready()) return Promise.resolve();
    var existing = document.getElementById(id);
    if (existing && existing.__soilPreviewPromise) return existing.__soilPreviewPromise;
    var script = existing || document.createElement('script');
    script.id = id;
    script.async = true;
    script.src = src;
    script.__soilPreviewPromise = new Promise(function (resolve, reject) {
      script.addEventListener('load', function () {
        if (ready()) resolve();
        else reject(new Error('组件加载后未初始化：' + id));
      }, {once:true});
      script.addEventListener('error', function () { reject(new Error('组件加载失败：' + id)); }, {once:true});
    });
    if (!existing) document.head.appendChild(script);
    return script.__soilPreviewPromise;
  }

  function ensureJSZip() {
    return loadScriptOnce('soil-public-jszip', JSZIP_URL, function () { return !!window.JSZip; });
  }

  function ensureDocxPreview() {
    return ensureJSZip().then(function () {
      return loadScriptOnce('soil-docx-preview', DOCX_PREVIEW_URL, function () {
        return !!(window.docx && typeof window.docx.renderAsync === 'function');
      });
    });
  }

  function ensurePdfJs() {
    return loadScriptOnce('soil-pdfjs', PDFJS_URL, function () {
      return !!(window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function');
    }).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return window.pdfjsLib;
    });
  }

  function addStyles() {
    if (document.getElementById('soil-document-preview-controls-style')) return;
    var style = document.createElement('style');
    style.id = 'soil-document-preview-controls-style';
    style.textContent =
      '.soil-rich-preview-dialog{width:min(1180px,96vw);height:min(900px,94vh)}' +
      '.soil-preview-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;flex:0 0 auto;padding:8px 10px;border-bottom:1px solid #e2e8f0;background:#fff}' +
      '.soil-preview-toolbar .soil-preview-download{margin-left:auto}' +
      '.soil-preview-zoom-label{min-width:52px;text-align:center;font-size:.72rem;font-weight:750;color:#334155}' +
      '.soil-preview-stage{position:relative;flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;background:#d9dee5}' +
      '.soil-preview-pages{display:flex;min-width:100%;box-sizing:border-box;flex-direction:column;align-items:center;gap:12px;padding:12px}' +
      '.soil-preview-page{flex:0 0 auto;background:#fff;box-shadow:0 2px 14px rgba(15,23,42,.2)}' +
      '.soil-preview-page canvas{display:block;max-width:none}' +
      '.soil-preview-docx-host{box-sizing:border-box;min-width:100%;min-height:100%;padding:12px;background:#d9dee5;transform-origin:top center}' +
      '.soil-preview-docx-host .docx-wrapper{background:#d9dee5!important;padding:0!important}' +
      '.soil-preview-docx-host .docx{margin:0 auto 14px!important;box-shadow:0 2px 14px rgba(15,23,42,.2)!important}' +
      '.soil-preview-error{max-width:720px;margin:auto;padding:24px;line-height:1.75;text-align:center;color:#475569}' +
      '@media(max-width:760px){' +
        '.soil-rich-preview-dialog{width:100%!important;height:100%!important;max-height:100%!important}' +
        '.soil-preview-toolbar{position:relative;z-index:20;gap:5px;padding:6px 7px}' +
        '.soil-preview-toolbar .soil-file-action{min-width:38px;padding-left:7px!important;padding-right:7px!important}' +
        '.soil-preview-toolbar .soil-preview-download{margin-left:0}' +
        '.soil-preview-pages{gap:8px;padding:7px}' +
        '.soil-preview-docx-host{padding:7px}' +
      '}' +
      '@media(max-width:360px){' +
        '.soil-preview-toolbar{gap:4px;padding:5px}' +
        '.soil-preview-toolbar .soil-file-action{min-width:34px;padding-left:6px!important;padding-right:6px!important}' +
        '.soil-preview-zoom-label{min-width:44px;font-size:.68rem}' +
      '}';
    document.head.appendChild(style);
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
    anchor.download = name || '文件';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1600);
  }

  function downloadFile(url, name, button) {
    var old = button.textContent;
    button.disabled = true;
    button.textContent = '准备中…';
    fetchBlob(url).then(function (blob) {
      downloadBlob(blob, name);
    }).catch(function (error) {
      alert('下载失败：' + error.message);
    }).finally(function () {
      button.disabled = false;
      button.textContent = old;
    });
  }

  function closePreview() {
    if (!state) {
      var orphan = document.getElementById('soil-file-preview-modal');
      if (orphan && orphan.parentNode) orphan.parentNode.removeChild(orphan);
      return;
    }
    state.renderSerial += 1;
    if (state.zoomTimer) clearTimeout(state.zoomTimer);
    var modal = state.modal;
    state = null;
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  function isCurrent(localState) {
    return !!state && state === localState && document.body.contains(localState.modal);
  }

  function setStatus(localState, html) {
    if (!isCurrent(localState)) return;
    localState.stage.innerHTML = '<div class="soil-file-status"><div>' + html + '</div></div>';
  }

  function updateZoomLabel(localState) {
    if (!localState || !localState.zoomLabel) return;
    localState.zoomLabel.textContent = Math.round(localState.zoom * 100) + '%';
    localState.zoomOut.disabled = localState.zoom <= 0.5;
    localState.zoomIn.disabled = localState.zoom >= 4;
  }

  function viewportWidth(localState) {
    return Math.max(220, (localState.stage.clientWidth || window.innerWidth || 360) - 24);
  }

  function fitPdfScale(localState, baseViewport) {
    return Math.max(0.2, Math.min(2.2, viewportWidth(localState) / Math.max(1, baseViewport.width)));
  }

  function fitDocxScale(localState, naturalWidth) {
    return Math.max(0.2, Math.min(1, viewportWidth(localState) / Math.max(1, naturalWidth)));
  }

  function renderPdf(localState, recomputeFit) {
    if (!isCurrent(localState) || !localState.pdfDoc) return Promise.resolve();
    var serial = ++localState.renderSerial;
    localState.pages.innerHTML = '<div class="soil-file-status">正在渲染 PDF……</div>';
    return localState.pdfDoc.getPage(1).then(function (firstPage) {
      if (!isCurrent(localState) || serial !== localState.renderSerial) return;
      var base = firstPage.getViewport({scale:1});
      if (recomputeFit || !localState.fitScale) localState.fitScale = fitPdfScale(localState, base);
      var renderScale = localState.fitScale * localState.zoom;
      localState.pages.innerHTML = '';

      function renderPage(pageNumber) {
        if (!isCurrent(localState) || serial !== localState.renderSerial) return Promise.resolve();
        if (pageNumber > localState.pdfDoc.numPages) return Promise.resolve();
        return localState.pdfDoc.getPage(pageNumber).then(function (page) {
          if (!isCurrent(localState) || serial !== localState.renderSerial) return;
          var cssViewport = page.getViewport({scale:renderScale});
          var requestedDpr = Math.min(window.devicePixelRatio || 1, 2);
          var maxPixels = 12000000;
          var pixelCount = Math.max(1, cssViewport.width * cssViewport.height);
          var safeDpr = Math.max(1, Math.min(requestedDpr, Math.sqrt(maxPixels / pixelCount)));
          var renderViewport = page.getViewport({scale:renderScale * safeDpr});
          var holder = document.createElement('div');
          holder.className = 'soil-preview-page';
          holder.setAttribute('data-page', String(pageNumber));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(renderViewport.width));
          canvas.height = Math.max(1, Math.floor(renderViewport.height));
          canvas.style.width = Math.max(1, Math.floor(cssViewport.width)) + 'px';
          canvas.style.height = Math.max(1, Math.floor(cssViewport.height)) + 'px';
          holder.appendChild(canvas);
          localState.pages.appendChild(holder);
          var context = canvas.getContext('2d', {alpha:false});
          return page.render({canvasContext:context, viewport:renderViewport}).promise.then(function () {
            return renderPage(pageNumber + 1);
          });
        });
      }

      return renderPage(1);
    }).catch(function (error) {
      if (!isCurrent(localState) || serial !== localState.renderSerial) return;
      localState.stage.innerHTML = '<div class="soil-preview-error"><strong>PDF 站内预览失败。</strong><br>' + esc(error.message || error) + '<br>可使用上方“下载文件”保存原文件。</div>';
    });
  }

  function applyDocxZoom(localState, recomputeFit) {
    if (!isCurrent(localState) || !localState.docxHost) return;
    localState.docxHost.style.zoom = '1';
    var page = localState.docxHost.querySelector('.docx');
    var naturalWidth = page ? page.getBoundingClientRect().width : 816;
    if (recomputeFit || !localState.fitScale) localState.fitScale = fitDocxScale(localState, naturalWidth);
    localState.docxHost.style.zoom = String(localState.fitScale * localState.zoom);
  }

  function rerender(localState, recomputeFit) {
    if (!isCurrent(localState)) return;
    updateZoomLabel(localState);
    if (localState.kind === 'pdf') {
      clearTimeout(localState.zoomTimer);
      localState.zoomTimer = setTimeout(function () { renderPdf(localState, !!recomputeFit); }, 90);
    } else if (localState.kind === 'docx') {
      applyDocxZoom(localState, !!recomputeFit);
    }
  }

  function bindToolbar(localState) {
    localState.zoomOut.addEventListener('click', function () {
      localState.zoom = Math.max(0.5, Math.round((localState.zoom - 0.25) * 100) / 100);
      rerender(localState, false);
    });
    localState.zoomIn.addEventListener('click', function () {
      localState.zoom = Math.min(4, Math.round((localState.zoom + 0.25) * 100) / 100);
      rerender(localState, false);
    });
    localState.fitButton.addEventListener('click', function () {
      localState.zoom = 1;
      rerender(localState, true);
    });
    localState.download.addEventListener('click', function () {
      downloadFile(localState.url, localState.name, localState.download);
    });
  }

  function renderDocx(localState) {
    setStatus(localState, '正在读取 Word 并生成预览……');
    return Promise.all([ensureDocxPreview(), fetchBlob(localState.url)]).then(function (result) {
      if (!isCurrent(localState)) return;
      localState.stage.innerHTML = '<div class="soil-preview-docx-host"></div>';
      localState.docxHost = localState.stage.querySelector('.soil-preview-docx-host');
      return window.docx.renderAsync(result[1], localState.docxHost, localState.docxHost, {
        inWrapper:true,
        breakPages:true,
        ignoreLastRenderedPageBreak:false,
        renderHeaders:true,
        renderFooters:true,
        renderFootnotes:true,
        renderEndnotes:true,
        useBase64URL:false
      }).then(function () {
        if (!isCurrent(localState)) return;
        applyDocxZoom(localState, true);
      });
    }).catch(function (error) {
      if (!isCurrent(localState)) return;
      localState.stage.innerHTML = '<div class="soil-preview-error"><strong>Word 在线预览加载失败。</strong><br>' + esc(error.message || error) + '<br>可使用上方“下载文件”保存原文件。</div>';
    });
  }

  function renderPdfDocument(localState) {
    setStatus(localState, '正在读取 PDF 并生成站内预览……');
    return Promise.all([ensurePdfJs(), fetchBlob(localState.url)]).then(function (result) {
      if (!isCurrent(localState)) return;
      return result[1].arrayBuffer().then(function (buffer) {
        if (!isCurrent(localState)) return;
        return result[0].getDocument({data:new Uint8Array(buffer)}).promise;
      });
    }).then(function (pdfDoc) {
      if (!isCurrent(localState) || !pdfDoc) return;
      localState.pdfDoc = pdfDoc;
      localState.stage.innerHTML = '<div class="soil-preview-pages"></div>';
      localState.pages = localState.stage.querySelector('.soil-preview-pages');
      return renderPdf(localState, true);
    }).catch(function (error) {
      if (!isCurrent(localState)) return;
      localState.stage.innerHTML = '<div class="soil-preview-error"><strong>PDF 站内预览加载失败。</strong><br>' + esc(error.message || error) + '<br>可使用上方“下载文件”保存原文件。</div>';
    });
  }

  function buildModal(url, name, kind) {
    addStyles();
    closePreview();
    var modal = document.createElement('div');
    modal.id = 'soil-file-preview-modal';
    modal.className = 'soil-file-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="soil-file-dialog soil-rich-preview-dialog">' +
        '<div class="soil-file-head">' +
          '<div class="soil-file-title" title="' + esc(name) + '">' + esc(name) + '</div>' +
          '<div class="soil-file-head-actions"></div>' +
          '<button type="button" class="soil-file-action soil-modal-close" aria-label="关闭">关闭</button>' +
        '</div>' +
        '<div class="soil-file-modal-content" style="display:flex;flex:1;min-height:0;flex-direction:column">' +
          '<div class="soil-preview-toolbar">' +
            '<button type="button" class="soil-file-action" data-preview-zoom-out aria-label="缩小">－</button>' +
            '<span class="soil-preview-zoom-label">100%</span>' +
            '<button type="button" class="soil-file-action" data-preview-zoom-in aria-label="放大">＋</button>' +
            '<button type="button" class="soil-file-action" data-preview-fit>适应宽度</button>' +
            '<button type="button" class="soil-file-action primary soil-preview-download">下载文件</button>' +
          '</div>' +
          '<div class="soil-preview-stage"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    var localState = {
      modal:modal,
      url:absoluteUrl(url),
      name:name,
      kind:kind,
      zoom:1,
      fitScale:0,
      renderSerial:0,
      zoomTimer:null,
      stage:modal.querySelector('.soil-preview-stage'),
      zoomOut:modal.querySelector('[data-preview-zoom-out]'),
      zoomIn:modal.querySelector('[data-preview-zoom-in]'),
      fitButton:modal.querySelector('[data-preview-fit]'),
      zoomLabel:modal.querySelector('.soil-preview-zoom-label'),
      download:modal.querySelector('.soil-preview-download'),
      pdfDoc:null,
      pages:null,
      docxHost:null
    };
    state = localState;
    bindToolbar(localState);
    updateZoomLabel(localState);

    modal.addEventListener('click', function (event) {
      if (event.target === modal || (event.target.closest && event.target.closest('.soil-modal-close'))) closePreview();
    });

    if (kind === 'pdf') renderPdfDocument(localState);
    else renderDocx(localState);
    return modal;
  }

  function openDocumentPreview(url, name) {
    url = absoluteUrl(url);
    name = name || basename(url);
    var kind = extension(name || url);
    if (kind !== 'pdf' && kind !== 'docx') {
      if (typeof originalOpenPreview === 'function') return originalOpenPreview(url, name);
      return;
    }
    return buildModal(url, name, kind);
  }

  function resultAnchor(anchor) {
    return !!(anchor && anchor.closest('.tab-content') &&
      (anchor.classList.contains('district-link') || anchor.classList.contains('doc-btn')));
  }

  window.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!resultAnchor(anchor)) return;
    var kind = extension(anchor.getAttribute('href') || anchor.href);
    if (kind !== 'pdf' && kind !== 'docx') return;
    if (event.defaultPrevented && event.eventPhase === 0) return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    openDocumentPreview(anchor.href, basename(anchor.getAttribute('href') || anchor.href));
  }, true);

  window.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !state) return;
    event.preventDefault();
    event.stopPropagation();
    closePreview();
  }, true);

  var resizeTimer = null;
  function refitOnResize() {
    if (!state) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!state) return;
      state.zoom = 1;
      rerender(state, true);
    }, 160);
  }
  window.addEventListener('resize', refitOnResize, {passive:true});
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refitOnResize, {passive:true});

  if (window.SoilFileAccess) window.SoilFileAccess.openPreview = openDocumentPreview;
  window.SoilDocumentPreview = {open:openDocumentPreview, close:closePreview};
})();
