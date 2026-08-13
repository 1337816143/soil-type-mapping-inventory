(function () {
  'use strict';

  if (window.__soilFilePreviewBatchDownloadInstalled) return;
  window.__soilFilePreviewBatchDownloadInstalled = true;

  var TYPE_LABELS = Object.assign({
    soilType: '土壤类型图',
    soilAttr: '土壤属性图',
    farmland: '耕地质量等级评价',
    degradation: '土壤退化与障碍分析',
    specialty: '土特产品土壤适宜性评价',
    agriSuitability: '土壤农业利用适宜性评价',
    landUse: '土地资源评价与利用报告'
  }, window.SoilDashboardTypes || {});

  var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  var DOCX_PREVIEW_URL = 'https://cdn.jsdelivr.net/npm/docx-preview@0.4.0/dist/docx-preview.min.js';
  var currentPreviewObjectUrl = '';
  var batchState = null;

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

  function rawRepoUrl(repoPath) {
    var admin = window.SoilRepoAdmin;
    if (admin && typeof admin.raw === 'function') return admin.raw(repoPath);
    return 'https://raw.githubusercontent.com/1337816143/soil-type-mapping-inventory/main/' +
      String(repoPath || '').split('/').map(encodeURIComponent).join('/');
  }

  function sourceUrlForRepoPath(repoPath) {
    repoPath = String(repoPath || '').replace(/^\.\//, '');
    if (repoPath.indexOf('data/质控意见反馈_管理员导入/') === 0) return rawRepoUrl(repoPath);
    return absoluteUrl('./' + repoPath);
  }

  function loadScriptOnce(id, src, ready) {
    if (ready()) return Promise.resolve();
    var existing = document.getElementById(id);
    if (existing && existing.__soilLoadPromise) return existing.__soilLoadPromise;
    var script = existing || document.createElement('script');
    script.id = id;
    script.async = true;
    script.src = src;
    script.__soilLoadPromise = new Promise(function (resolve, reject) {
      script.addEventListener('load', function () {
        if (ready()) resolve();
        else reject(new Error('组件加载后未初始化：' + id));
      }, {once:true});
      script.addEventListener('error', function () { reject(new Error('组件加载失败：' + id)); }, {once:true});
    });
    if (!existing) document.head.appendChild(script);
    return script.__soilLoadPromise;
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

  function addStyles() {
    if (document.getElementById('soil-file-access-style')) return;
    var style = document.createElement('style');
    style.id = 'soil-file-access-style';
    style.textContent =
      '.soil-batch-download-trigger{margin-left:10px;display:inline-flex;align-items:center;padding:4px 10px;border:1px solid #0f766e;border-radius:6px;background:#f0fdfa;color:#0f766e;font-size:.75rem;font-weight:700;cursor:pointer;white-space:nowrap}' +
      '.soil-batch-download-trigger:hover{background:#ccfbf1}' +
      '.soil-file-modal{position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.58);backdrop-filter:blur(2px)}' +
      '.soil-file-dialog{display:flex;flex-direction:column;width:min(1180px,96vw);height:min(900px,94vh);overflow:hidden;border:1px solid #dbe3ef;border-radius:14px;background:#fff;box-shadow:0 28px 80px rgba(15,23,42,.28);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}' +
      '.soil-file-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc}' +
      '.soil-file-title{min-width:0;flex:1;font-size:.9rem;font-weight:800;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.soil-file-action{appearance:none;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#334155;padding:7px 11px;font-size:.75rem;font-weight:700;cursor:pointer;text-decoration:none;white-space:nowrap}' +
      '.soil-file-action.primary{border-color:#2563eb;background:#2563eb;color:#fff}' +
      '.soil-file-action.success{border-color:#0f766e;background:#0f766e;color:#fff}' +
      '.soil-file-action:disabled{opacity:.5;cursor:not-allowed}' +
      '.soil-file-body{position:relative;flex:1;min-height:0;overflow:auto;background:#e5e7eb}' +
      '.soil-file-status{display:flex;min-height:100%;align-items:center;justify-content:center;padding:28px;color:#475569;font-size:.85rem;line-height:1.7;text-align:center}' +
      '.soil-file-pdf{display:block;width:100%;height:100%;min-height:70vh;border:0;background:#fff}' +
      '.soil-docx-host{min-height:100%;padding:20px;overflow:auto;background:#dbe1e8}' +
      '.soil-docx-host .docx-wrapper{background:#dbe1e8!important;padding:0!important}' +
      '.soil-docx-host .docx{margin:0 auto 18px!important;box-shadow:0 2px 14px rgba(15,23,42,.18)!important}' +
      '.soil-batch-dialog{width:min(1120px,97vw);height:min(850px,94vh)}' +
      '.soil-batch-body{display:grid;grid-template-columns:310px minmax(0,1fr);flex:1;min-height:0;background:#fff}' +
      '.soil-batch-filters{overflow:auto;padding:13px;border-right:1px solid #e2e8f0;background:#f8fafc}' +
      '.soil-batch-search{width:100%;box-sizing:border-box;margin-bottom:10px;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-size:.78rem}' +
      '.soil-filter-group{margin-bottom:8px;border:1px solid #dbe3ef;border-radius:8px;background:#fff}' +
      '.soil-filter-group summary{padding:9px 10px;font-size:.76rem;font-weight:750;color:#334155;cursor:pointer}' +
      '.soil-filter-options{max-height:190px;overflow:auto;padding:0 9px 8px}' +
      '.soil-filter-option{display:flex;align-items:flex-start;gap:7px;padding:4px 1px;font-size:.73rem;line-height:1.4;color:#475569}' +
      '.soil-filter-option input{margin-top:2px}' +
      '.soil-filter-reset{width:100%;margin-top:3px}' +
      '.soil-batch-results{display:flex;min-width:0;min-height:0;flex-direction:column}' +
      '.soil-batch-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 12px;border-bottom:1px solid #e2e8f0;background:#fff}' +
      '.soil-batch-count{margin-left:auto;font-size:.72rem;color:#64748b}' +
      '.soil-batch-list{flex:1;min-height:0;overflow:auto;padding:8px 10px}' +
      '.soil-batch-item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;padding:9px 8px;border-bottom:1px solid #edf2f7}' +
      '.soil-batch-item:hover{background:#f8fafc}' +
      '.soil-batch-item input{margin-top:3px}' +
      '.soil-batch-name{font-size:.76rem;font-weight:700;color:#1e293b;word-break:break-word}' +
      '.soil-batch-meta{margin-top:3px;font-size:.68rem;line-height:1.55;color:#64748b;word-break:break-word}' +
      '.soil-batch-empty{padding:34px;text-align:center;color:#64748b;font-size:.8rem}' +
      '.soil-batch-progress{padding:8px 12px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:.71rem;color:#475569}' +
      '@media(max-width:760px){.soil-batch-download-trigger{margin-left:0}.soil-file-modal{padding:6px}.soil-file-dialog{width:100%;height:96vh;border-radius:10px}.soil-file-head{gap:6px;padding:9px}.soil-file-action{padding:7px 9px;font-size:.7rem}.soil-file-title{font-size:.78rem}.soil-batch-body{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.soil-batch-filters{max-height:42vh;border-right:0;border-bottom:1px solid #e2e8f0}.soil-batch-toolbar{padding:8px}.soil-batch-count{width:100%;margin-left:0}.soil-docx-host{padding:6px}.soil-docx-host .docx{transform-origin:top left}}';
    document.head.appendChild(style);
  }

  function releasePreviewObjectUrl() {
    if (!currentPreviewObjectUrl) return;
    try { URL.revokeObjectURL(currentPreviewObjectUrl); } catch (error) {}
    currentPreviewObjectUrl = '';
  }

  function closeModal(id) {
    var modal = document.getElementById(id);
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    if (id === 'soil-file-preview-modal') releasePreviewObjectUrl();
  }

  function modalShell(id, title, extraClass) {
    closeModal(id);
    var modal = document.createElement('div');
    modal.id = id;
    modal.className = 'soil-file-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="soil-file-dialog ' + esc(extraClass || '') + '">' +
        '<div class="soil-file-head">' +
          '<div class="soil-file-title" title="' + esc(title) + '">' + esc(title) + '</div>' +
          '<div class="soil-file-head-actions"></div>' +
          '<button type="button" class="soil-file-action soil-modal-close" aria-label="关闭">关闭</button>' +
        '</div>' +
        '<div class="soil-file-modal-content" style="display:flex;flex:1;min-height:0;flex-direction:column"></div>' +
      '</div>';
    modal.addEventListener('click', function (event) {
      if (event.target === modal || event.target.closest('.soil-modal-close')) closeModal(id);
    });
    document.body.appendChild(modal);
    return modal;
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
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function downloadFile(url, name, button) {
    var old = button && button.textContent;
    if (button) { button.disabled = true; button.textContent = '正在准备…'; }
    return fetchBlob(url).then(function (blob) {
      downloadBlob(blob, name);
    }).catch(function (error) {
      alert('下载失败：' + error.message);
    }).finally(function () {
      if (button) { button.disabled = false; button.textContent = old || '下载文件'; }
    });
  }

  function previewUnsupported(body, ext) {
    body.innerHTML = '<div class="soil-file-status"><div><strong>文件已打开到站内查看页。</strong><br>当前浏览器暂不支持直接渲染 .' + esc(ext || '未知') + ' 格式。<br>可以使用右上角“下载文件”保存原文件。</div></div>';
  }

  function renderPreview(url, name, body) {
    var ext = extension(name || url);
    body.innerHTML = '<div class="soil-file-status">正在读取文件并生成预览……</div>';

    if (ext === 'docx') {
      return Promise.all([ensureDocxPreview(), fetchBlob(url)]).then(function (result) {
        body.innerHTML = '<div class="soil-docx-host"></div>';
        var host = body.querySelector('.soil-docx-host');
        return window.docx.renderAsync(result[1], host, host, {
          inWrapper:true,
          breakPages:true,
          ignoreLastRenderedPageBreak:false,
          renderHeaders:true,
          renderFooters:true,
          renderFootnotes:true,
          renderEndnotes:true,
          useBase64URL:false
        });
      }).catch(function (error) {
        body.innerHTML = '<div class="soil-file-status"><div><strong>Word 在线预览加载失败。</strong><br>' + esc(error.message) + '<br>文件本身仍可通过右上角“下载文件”正常获取。</div></div>';
      });
    }

    if (ext === 'pdf') {
      return fetchBlob(url).then(function (blob) {
        releasePreviewObjectUrl();
        currentPreviewObjectUrl = URL.createObjectURL(new Blob([blob], {type:'application/pdf'}));
        body.innerHTML = '<iframe class="soil-file-pdf" title="PDF预览"></iframe>';
        body.querySelector('iframe').src = currentPreviewObjectUrl;
      }).catch(function (error) {
        body.innerHTML = '<div class="soil-file-status">PDF预览失败：' + esc(error.message) + '<br>可以使用右上角“下载文件”。</div>';
      });
    }

    if (/^(png|jpe?g|gif|webp|svg)$/.test(ext)) {
      return fetchBlob(url).then(function (blob) {
        releasePreviewObjectUrl();
        currentPreviewObjectUrl = URL.createObjectURL(blob);
        body.innerHTML = '<div style="display:flex;min-height:100%;align-items:flex-start;justify-content:center;padding:18px;background:#fff"><img alt="文件预览" style="max-width:100%;height:auto" src="' + esc(currentPreviewObjectUrl) + '"></div>';
      });
    }

    if (/^(txt|csv|json|md)$/.test(ext)) {
      return fetch(url, {cache:'no-store'}).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      }).then(function (text) {
        body.innerHTML = '<pre style="box-sizing:border-box;min-height:100%;margin:0;padding:18px;white-space:pre-wrap;word-break:break-word;background:#fff;color:#1e293b;font:13px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace"></pre>';
        body.querySelector('pre').textContent = text;
      }).catch(function () { previewUnsupported(body, ext); });
    }

    previewUnsupported(body, ext);
    return Promise.resolve();
  }

  function openFilePreview(url, name) {
    addStyles();
    url = absoluteUrl(url);
    name = name || basename(url);
    var modal = modalShell('soil-file-preview-modal', name, '');
    var actions = modal.querySelector('.soil-file-head-actions');
    var download = document.createElement('button');
    download.type = 'button';
    download.className = 'soil-file-action primary';
    download.textContent = '下载文件';
    download.addEventListener('click', function () { downloadFile(url, name, download); });
    actions.appendChild(download);
    var content = modal.querySelector('.soil-file-modal-content');
    content.innerHTML = '<div class="soil-file-body"></div>';
    renderPreview(url, name, content.querySelector('.soil-file-body'));
  }

  function isResultFileAnchor(anchor) {
    if (!anchor || !anchor.closest('.tab-content')) return false;
    return anchor.classList.contains('district-link') || anchor.classList.contains('doc-btn');
  }

  function interceptResultFileClicks() {
    if (document.documentElement.__soilResultPreviewBound) return;
    document.documentElement.__soilResultPreviewBound = true;
    document.addEventListener('click', function (event) {
      var anchor = event.target.closest && event.target.closest('a[href]');
      if (!isResultFileAnchor(anchor)) return;
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      openFilePreview(anchor.href, basename(anchor.getAttribute('href') || anchor.href));
    }, true);
  }

  function normalizeRepoPath(file) {
    var path = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (path.indexOf('data/') === 0) return path;
    return 'data/' + path.replace(/^\/+/, '');
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort(function (a, b) { return String(a).localeCompare(String(b), 'zh-CN'); });
  }

  function buildCatalog() {
    var byPath = {};
    Object.keys(window.tabData || {}).forEach(function (dataKey) {
      if (!TYPE_LABELS[dataKey]) return;
      (window.tabData[dataKey] || []).forEach(function (city) {
        (city.units || []).forEach(function (unit) {
          (unit.districts || []).forEach(function (district) {
            (district.docs || []).forEach(function (doc) {
              if (!doc || !doc.file) return;
              var repoPath = normalizeRepoPath(doc.file);
              var item = byPath[repoPath];
              if (!item) {
                item = byPath[repoPath] = {
                  repoPath:repoPath,
                  name:basename(repoPath),
                  sourceUrl:sourceUrlForRepoPath(repoPath),
                  associations:[]
                };
              }
              var association = {
                city:String(city.name || ''),
                unit:String(unit.name || ''),
                district:String(district.label || ''),
                dataKey:dataKey,
                resultType:TYPE_LABELS[dataKey],
                batch:String(doc.batch || '')
              };
              var sig = [association.city, association.unit, association.district, association.dataKey, association.batch].join('|');
              if (!item.associations.some(function (entry) { return entry.__sig === sig; })) {
                association.__sig = sig;
                item.associations.push(association);
              }
            });
          });
        });
      });
    });
    return Object.keys(byPath).map(function (path) { return byPath[path]; }).sort(function (a, b) {
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  function filterValues(catalog, key) {
    var values = [];
    catalog.forEach(function (item) {
      item.associations.forEach(function (assoc) { values.push(String(assoc[key] || '')); });
    });
    return uniqueSorted(values);
  }

  function selectedFilterValues(modal, key) {
    return new Set(Array.prototype.map.call(modal.querySelectorAll('input[data-filter="' + key + '"]:checked'), function (input) {
      return input.value;
    }));
  }

  function filterSummaryText(modal, key, label) {
    var count = modal.querySelectorAll('input[data-filter="' + key + '"]:checked').length;
    return label + (count ? '（已选' + count + '）' : '（全部）');
  }

  function associationMatches(assoc, filters, query, item) {
    if (filters.city.size && !filters.city.has(assoc.city)) return false;
    if (filters.unit.size && !filters.unit.has(assoc.unit)) return false;
    if (filters.resultType.size && !filters.resultType.has(assoc.resultType)) return false;
    if (filters.district.size && !filters.district.has(assoc.district)) return false;
    if (!query) return true;
    var haystack = [item.name, item.repoPath, assoc.city, assoc.unit, assoc.district, assoc.resultType, assoc.batch].join(' ').toLowerCase();
    return query.split(/\s+/).filter(Boolean).every(function (token) { return haystack.indexOf(token) >= 0; });
  }

  function matchingCatalog(modal) {
    var filters = {
      city:selectedFilterValues(modal, 'city'),
      unit:selectedFilterValues(modal, 'unit'),
      resultType:selectedFilterValues(modal, 'resultType'),
      district:selectedFilterValues(modal, 'district')
    };
    var query = String(modal.querySelector('#soil-batch-search').value || '').trim().toLowerCase();
    return batchState.catalog.filter(function (item) {
      return item.associations.some(function (assoc) { return associationMatches(assoc, filters, query, item); });
    });
  }

  function conciseMetadata(item) {
    var cities = uniqueSorted(item.associations.map(function (a) { return a.city; }));
    var units = uniqueSorted(item.associations.map(function (a) { return a.unit; }));
    var districts = uniqueSorted(item.associations.map(function (a) { return a.district; }));
    var types = uniqueSorted(item.associations.map(function (a) { return a.resultType; }));
    function short(values, limit) {
      if (values.length <= limit) return values.join('、');
      return values.slice(0, limit).join('、') + ' 等' + values.length + '项';
    }
    return '成果：' + short(types, 4) + '　|　市：' + short(cities, 4) + '　|　作业单位：' + short(units, 3) + '　|　区县：' + short(districts, 6);
  }

  function renderBatchResults(modal) {
    var matches = matchingCatalog(modal);
    batchState.matches = matches;
    var list = modal.querySelector('#soil-batch-list');
    if (!matches.length) {
      list.innerHTML = '<div class="soil-batch-empty">没有符合当前交叉筛选条件的文件。</div>';
    } else {
      list.innerHTML = matches.map(function (item) {
        return '<label class="soil-batch-item">' +
          '<input type="checkbox" data-batch-path="' + esc(item.repoPath) + '" ' + (batchState.selected.has(item.repoPath) ? 'checked' : '') + '>' +
          '<span><div class="soil-batch-name">' + esc(item.name) + '</div><div class="soil-batch-meta">' + esc(conciseMetadata(item)) + '</div></span>' +
        '</label>';
      }).join('');
    }
    modal.querySelector('#soil-batch-count').textContent = '匹配 ' + matches.length + ' 个文件 · 已选 ' + batchState.selected.size + ' 个（按物理文件去重）';
    ['city','unit','resultType','district'].forEach(function (key) {
      var details = modal.querySelector('[data-filter-group="' + key + '"]');
      var summary = details && details.querySelector('summary');
      if (!summary) return;
      var label = details.getAttribute('data-filter-label');
      summary.textContent = filterSummaryText(modal, key, label);
    });
    modal.querySelector('#soil-batch-download').disabled = batchState.selected.size === 0;
  }

  function optionHtml(key, value, checked) {
    return '<label class="soil-filter-option"><input type="checkbox" data-filter="' + esc(key) + '" value="' + esc(value) + '" ' + (checked ? 'checked' : '') + '><span>' + esc(value) + '</span></label>';
  }

  function buildFilterGroup(key, label, values, initial) {
    return '<details class="soil-filter-group" data-filter-group="' + esc(key) + '" data-filter-label="' + esc(label) + '">' +
      '<summary>' + esc(label) + (initial ? '（已选1）' : '（全部）') + '</summary>' +
      '<div class="soil-filter-options">' + values.map(function (value) { return optionHtml(key, value, initial === value); }).join('') + '</div>' +
    '</details>';
  }

  function resetBatchFilters(modal) {
    modal.querySelectorAll('input[data-filter]').forEach(function (input) { input.checked = false; });
    modal.querySelector('#soil-batch-search').value = '';
    renderBatchResults(modal);
  }

  function zipEntryName(item) {
    var path = item.repoPath.replace(/^data\//, '').replace(/^\/+/, '');
    return path || item.name;
  }

  function timestampName() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  function setBatchProgress(modal, text) {
    var node = modal.querySelector('#soil-batch-progress');
    if (node) node.textContent = text;
  }

  function downloadSelectedZip(modal) {
    var selectedItems = batchState.catalog.filter(function (item) { return batchState.selected.has(item.repoPath); });
    if (!selectedItems.length) return;
    if (selectedItems.length > 80 && !window.confirm('已选择 ' + selectedItems.length + ' 个文件。浏览器需要先读取这些文件再生成ZIP，可能占用较多内存和时间。是否继续？')) return;

    var button = modal.querySelector('#soil-batch-download');
    button.disabled = true;
    button.textContent = '正在准备 ZIP…';
    setBatchProgress(modal, '正在加载 ZIP 组件……');

    ensureJSZip().then(function () {
      var zip = new window.JSZip();
      var queueIndex = 0;
      var completed = 0;
      var failed = [];
      var workerCount = Math.min(4, selectedItems.length);

      function worker() {
        if (queueIndex >= selectedItems.length) return Promise.resolve();
        var item = selectedItems[queueIndex++];
        return fetchBlob(item.sourceUrl).then(function (blob) {
          zip.file(zipEntryName(item), blob, {binary:true});
        }).catch(function (error) {
          failed.push(item.name + '：' + error.message);
        }).then(function () {
          completed += 1;
          setBatchProgress(modal, '正在读取文件 ' + completed + ' / ' + selectedItems.length + (failed.length ? ' · 失败 ' + failed.length + ' 个' : ''));
          return worker();
        });
      }

      var workers = [];
      for (var i = 0; i < workerCount; i++) workers.push(worker());
      return Promise.all(workers).then(function () {
        if (failed.length === selectedItems.length) throw new Error('所有文件都读取失败，无法生成ZIP。');
        setBatchProgress(modal, '文件读取完成，正在压缩……');
        return zip.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:4}}, function (meta) {
          setBatchProgress(modal, '正在生成 ZIP：' + Math.round(meta.percent || 0) + '%');
        }).then(function (blob) {
          downloadBlob(blob, '三普质控资料_' + timestampName() + '.zip');
          if (failed.length) {
            setBatchProgress(modal, 'ZIP 已生成；其中 ' + failed.length + ' 个文件读取失败，未加入压缩包。');
            alert('ZIP 已生成，但有 ' + failed.length + ' 个文件读取失败。可缩小筛选范围后重试这些文件。');
          } else {
            setBatchProgress(modal, '批量下载完成：共 ' + selectedItems.length + ' 个物理文件。');
          }
        });
      });
    }).catch(function (error) {
      setBatchProgress(modal, '批量下载失败：' + error.message);
      alert('批量下载失败：' + error.message);
    }).finally(function () {
      button.disabled = batchState.selected.size === 0;
      button.textContent = '下载已选 ZIP';
    });
  }

  function bindBatchModal(modal) {
    modal.addEventListener('change', function (event) {
      var filter = event.target.closest && event.target.closest('input[data-filter]');
      if (filter) { renderBatchResults(modal); return; }
      var item = event.target.closest && event.target.closest('input[data-batch-path]');
      if (item) {
        if (item.checked) batchState.selected.add(item.getAttribute('data-batch-path'));
        else batchState.selected.delete(item.getAttribute('data-batch-path'));
        renderBatchResults(modal);
      }
    });

    var search = modal.querySelector('#soil-batch-search');
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { renderBatchResults(modal); }, 80);
    });

    modal.querySelector('#soil-batch-select-all').addEventListener('click', function () {
      batchState.matches.forEach(function (item) { batchState.selected.add(item.repoPath); });
      renderBatchResults(modal);
    });
    modal.querySelector('#soil-batch-clear').addEventListener('click', function () {
      batchState.selected.clear();
      renderBatchResults(modal);
    });
    modal.querySelector('#soil-batch-reset').addEventListener('click', function () { resetBatchFilters(modal); });
    modal.querySelector('#soil-batch-download').addEventListener('click', function () { downloadSelectedZip(modal); });
  }

  function openBatchDownload(initialDataKey) {
    addStyles();
    var catalog = buildCatalog();
    if (!catalog.length) {
      alert('当前页面还没有可批量下载的成果质控文件。');
      return;
    }
    batchState = {catalog:catalog, matches:[], selected:new Set()};
    var initialType = TYPE_LABELS[initialDataKey] || '';
    var cities = filterValues(catalog, 'city');
    var units = filterValues(catalog, 'unit');
    var types = filterValues(catalog, 'resultType');
    var districts = filterValues(catalog, 'district');

    var modal = modalShell('soil-batch-download-modal', '批量下载质控文件', 'soil-batch-dialog');
    var content = modal.querySelector('.soil-file-modal-content');
    content.innerHTML =
      '<div class="soil-batch-body">' +
        '<aside class="soil-batch-filters">' +
          '<input id="soil-batch-search" class="soil-batch-search" type="search" placeholder="搜索文件名、市、单位、成果类型、区县……">' +
          buildFilterGroup('city', '按市选择', cities, '') +
          buildFilterGroup('unit', '按作业单位选择', units, '') +
          buildFilterGroup('resultType', '按成果类型选择', types, initialType) +
          buildFilterGroup('district', '按区县选择', districts, '') +
          '<button id="soil-batch-reset" type="button" class="soil-file-action soil-filter-reset">清空筛选条件</button>' +
          '<div style="margin-top:9px;font-size:.67rem;line-height:1.6;color:#64748b">四类条件采用交叉筛选（AND）。同一组内可多选；北部共享报告按真实任务关联匹配，但下载时同一物理文件只保留1份。</div>' +
        '</aside>' +
        '<section class="soil-batch-results">' +
          '<div class="soil-batch-toolbar">' +
            '<button id="soil-batch-select-all" type="button" class="soil-file-action">全选当前结果</button>' +
            '<button id="soil-batch-clear" type="button" class="soil-file-action">取消全部</button>' +
            '<button id="soil-batch-download" type="button" class="soil-file-action success" disabled>下载已选 ZIP</button>' +
            '<span id="soil-batch-count" class="soil-batch-count"></span>' +
          '</div>' +
          '<div id="soil-batch-list" class="soil-batch-list"></div>' +
          '<div id="soil-batch-progress" class="soil-batch-progress">请选择需要下载的文件。</div>' +
        '</section>' +
      '</div>';
    bindBatchModal(modal);
    renderBatchResults(modal);
  }

  function activeDataKey() {
    if (typeof window.getActiveDashboardKey === 'function') return window.getActiveDashboardKey();
    var tab = document.querySelector('.tab.active');
    return tab && tab.dataset ? tab.dataset.tab : 'soilType';
  }

  function ensureBatchButton() {
    var key = activeDataKey();
    if (!TYPE_LABELS[key]) return;
    var banner = document.getElementById('missingBanner');
    var heading = banner && banner.querySelector('h3');
    if (!heading) return;
    var button = heading.querySelector('.soil-batch-download-trigger');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'soil-batch-download-trigger';
      button.textContent = '批量下载';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openBatchDownload(activeDataKey());
      });
    }
    var deleteButton = heading.querySelector('.admin-delete-trigger');
    if (deleteButton) deleteButton.insertAdjacentElement('afterend', button);
    else heading.appendChild(button);
  }

  function wrapMissingBanner() {
    if (window.renderMissingBanner && !window.renderMissingBanner.__soilBatchDownloadWrapped) {
      var original = window.renderMissingBanner;
      var wrapped = function () {
        var result = original.apply(this, arguments);
        ensureBatchButton();
        return result;
      };
      wrapped.__soilBatchDownloadWrapped = true;
      window.renderMissingBanner = wrapped;
    }
  }

  function bindTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      if (tab.__soilBatchButtonBound) return;
      tab.__soilBatchButtonBound = true;
      tab.addEventListener('click', function () { setTimeout(ensureBatchButton, 0); });
    });
  }

  function install() {
    addStyles();
    interceptResultFileClicks();
    wrapMissingBanner();
    bindTabs();
    ensureBatchButton();
  }

  window.SoilFileAccess = {
    openPreview:openFilePreview,
    openBatchDownload:openBatchDownload,
    buildCatalog:buildCatalog,
    sourceUrlForRepoPath:sourceUrlForRepoPath
  };

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (document.getElementById('soil-file-preview-modal')) closeModal('soil-file-preview-modal');
    else if (document.getElementById('soil-batch-download-modal')) closeModal('soil-batch-download-modal');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
