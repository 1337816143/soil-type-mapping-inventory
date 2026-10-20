/* Public, read-only inspection materials. No upload or authentication integration. */
(function () {
  'use strict';
  if (window.SoilNationalInspection) return;
  var C = window.SoilNationalInspectionCore;
  if (!C) throw new Error('国家抽查清单模块未加载');
  var data = {schemaVersion:1, batches:[], materials:[]};
  var loaded = false, loading = false, downloadBusy = false;
  var topicId = C.topics[0].id, panel, tab, topicPanel, results, summary, status, tabs, filters, downloadButton, refreshButton;
  var view = 'topics', matrixPanel, matrixStatus, topicTabs, viewButtons, popup, popupAnchor;
  function el(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }
  function button(label, className, action) {
    var node = el('button', 'ni-button ' + (className || ''), label);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }
  function lookup(list, id) { return list.find(function (item) { return item.id === id; }); }
  function notify(message, error) {
    status.textContent = message;
    status.classList.toggle('error', !!error);
    if (matrixStatus) {
      matrixStatus.hidden = !error;
      matrixStatus.querySelector('span').textContent = error ? message : '';
    }
  }
  function countText(materials) { var count = C.summary(materials); return count.files + ' 个文件 · ' + count.batches + ' 个批次标签'; }
  function currentFilters() {
    return {topicId:topicId, countyId:filters.county.value, batchId:filters.batch.value, search:filters.search.value};
  }
  function filteredMaterials() { return C.query(data, currentFilters()); }
  function updateCounts() {
    summary.textContent = loaded ? countText(data.materials) : '材料清单待读取';
    tabs.forEach(function (node, i) {
      node.querySelector('.ni-topic-count').textContent = loaded ? String(C.summary(C.query(data, {topicId:C.topics[i].id})).files) : '—';
    });
  }
  function preview(entry) {
    closePopup(false);
    var url = C.sourceUrl(entry.path);
    if (/\.(pdf|docx)$/i.test(entry.name) && window.SoilDocumentPreview) {
      window.SoilDocumentPreview.open(url, entry.name);
    } else if (window.SoilFileAccess && typeof window.SoilFileAccess.openPreview === 'function') {
      window.SoilFileAccess.openPreview(url, entry.name);
    } else {
      notify('文件预览组件尚未就绪，请刷新页面后重试。', true);
    }
  }
  function renderMaterials() {
    if (!results) return;
    closePopup(false);
    renderMatrix();
    results.replaceChildren();
    downloadButton.disabled = !loaded || loading || downloadBusy || !filteredMaterials().length;
    if (!loaded) {
      var message = el('div', 'ni-load-message', loading ? '正在读取国家抽查材料清单…' : '国家抽查材料清单尚未读取。');
      if (!loading) message.appendChild(button('重新读取清单', '', function () { refresh(); }));
      results.appendChild(message);
      return;
    }
    var entries = filteredMaterials(), columns = el('div', 'ni-material-columns');
    var hasFilters = !!(filters.county.value || filters.batch.value || filters.search.value.trim());
    C.kinds.forEach(function (kind) {
      var groupEntries = entries.filter(function (entry) { return entry.materialType === kind.id; });
      var group = el('section', 'ni-material-group ' + kind.id);
      var title = el('h4', 'ni-material-title', kind.label);
      title.appendChild(el('span', 'ni-material-count', C.summary(groupEntries).files + ' 个文件'));
      group.appendChild(title);
      if (!groupEntries.length) {
        var empty = el('div', 'ni-empty');
        empty.appendChild(el('strong', '', hasFilters ? '当前筛选下暂无' + kind.label : '本专题暂无' + kind.label));
        empty.appendChild(el('span', '', hasFilters ? '可清除筛选，查看本专题的全部材料。' : '待材料整理后挂载；同一专题可保留多个批次。'));
        group.appendChild(empty);
      } else {
        groupEntries.forEach(function (entry) {
          var county = lookup(C.counties, entry.countyId), batch = lookup(data.batches, entry.batchId);
          var row = el('article', 'ni-file');
          row.setAttribute('data-material-id', entry.id);
          row.appendChild(el('p', 'ni-file-name', entry.name));
          row.appendChild(el('div', 'ni-file-meta', county.city + ' · ' + county.label + ' ｜ ' + batch.label + ' ｜ ' + versionText(entry)));
          var open = button('预览文件', '', function () { preview(entry); });
          open.setAttribute('aria-label', '预览：' + entry.name + '，' + county.city + county.label + '，' + batch.label);
          row.appendChild(open);
          group.appendChild(row);
        });
      }
      columns.appendChild(group);
    });
    results.appendChild(columns);
    if (!downloadBusy && !loading) notify('当前专题筛选结果：' + countText(entries) + '。文件默认先预览，预览内可下载。');
  }
  function versionText(entry) { return entry.version ? 'v' + entry.version : '原件未标版本'; }
  function closePopup(restoreFocus) {
    if (!popup) return;
    popup.remove(); popup = null;
    popupAnchor.setAttribute('aria-expanded', 'false');
    if (restoreFocus) popupAnchor.focus({preventScroll:true});
    popupAnchor = null;
  }
  function openPopup(anchor, entries, label) {
    var same = popupAnchor === anchor;
    closePopup(false);
    if (same) return;
    popupAnchor = anchor; anchor.setAttribute('aria-expanded', 'true');
    popup = el('div', 'ni-popover'); popup.id = 'ni-file-popover';
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', label);
    var head = el('div', 'ni-popover-head'); head.appendChild(el('strong', '', label));
    head.appendChild(button('关闭', '', function () { closePopup(true); })); popup.appendChild(head);
    var list = el('div', 'ni-popover-list');
    if (!entries.length) list.appendChild(el('p', 'ni-popover-empty', '暂无材料'));
    entries.forEach(function (entry) {
      var item = el('article', 'ni-popover-file'); item.setAttribute('data-material-id', entry.id);
      item.appendChild(el('div', 'ni-file-meta', lookup(data.batches, entry.batchId).label + ' ｜ ' + versionText(entry)));
      item.appendChild(el('p', 'ni-file-name', entry.name));
      item.appendChild(button('预览文件', '', function () { preview(entry); })); list.appendChild(item);
    });
    popup.appendChild(list); panel.appendChild(popup);
    positionPopup();
    head.querySelector('button').focus({preventScroll:true});
  }
  function positionPopup() {
    if (!popup) return;
    var box = popupAnchor.getBoundingClientRect(), width = Math.min(460, window.innerWidth - 16);
    popup.style.width = width + 'px';
    popup.style.left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8)) + 'px';
    var height = popup.getBoundingClientRect().height;
    popup.style.top = Math.max(8, Math.min(box.bottom + 4, window.innerHeight - height - 8)) + 'px';
  }
  function renderMatrix() {
    if (!matrixPanel) return;
    matrixPanel.replaceChildren();
    matrixStatus = el('div', 'ni-matrix-error'); matrixStatus.setAttribute('role', 'alert');
    matrixStatus.hidden = !status.classList.contains('error');
    matrixStatus.appendChild(el('span', '', matrixStatus.hidden ? '' : status.textContent));
    matrixStatus.appendChild(button('重新读取清单', '', function () { refresh(); })); matrixPanel.appendChild(matrixStatus);
    if (!loaded) { matrixPanel.appendChild(el('p', 'ni-load-message', loading ? '正在读取国家抽查材料清单…' : '材料清单尚未读取，请切换专题视图重试。')); return; }
    var table = el('table', 'ni-matrix'); table.setAttribute('aria-label', '区县 × 成果类型，文件数按物理文件去重');
    var caption = el('caption', '', '区县 × 成果类型'); table.appendChild(caption);
    var thead = el('thead'), header = el('tr'), corner = el('th', '', '区县'); corner.setAttribute('scope', 'col'); header.appendChild(corner);
    var shortNames = ['类型图','属性图','耕评','退化障碍','土特产','农适','资源评价','三报告'];
    C.topics.forEach(function (topic, i) {
      var th = el('th'); th.setAttribute('scope', 'col'); th.setAttribute('title', topic.label);
      th.appendChild(el('span', 'ni-col-full', topic.label));
      var short = el('span', 'ni-col-short', shortNames[i]); short.setAttribute('aria-hidden', 'true'); th.appendChild(short);
      th.appendChild(el('span', 'ni-matrix-count', String(C.summary(C.query(data, {topicId:topic.id})).files))); header.appendChild(th);
    });
    thead.appendChild(header); table.appendChild(thead);
    var tbody = el('tbody');
    C.counties.forEach(function (county) {
      var tr = el('tr'); tr.setAttribute('data-county', county.id);
      var th = el('th'); th.setAttribute('scope', 'row');
      th.appendChild(el('span', 'ni-row-city', county.city + '·'));
      th.appendChild(el('span', 'ni-row-county', county.label));
      th.appendChild(el('span', 'ni-matrix-count', String(C.summary(C.query(data, {countyId:county.id})).files))); tr.appendChild(th);
      C.topics.forEach(function (topic) {
        var entries = C.query(data, {countyId:county.id, topicId:topic.id}), cell = el('td'); cell.setAttribute('data-topic', topic.id);
        if (!entries.length) cell.appendChild(el('span', 'ni-cell-empty', '暂无材料'));
        var actions = el('div', 'ni-cell-actions');
          C.kinds.forEach(function (kind) {
            var matches = entries.filter(function (entry) { return entry.materialType === kind.id; });
            var label = kind.id === 'quality' ? '质控' : '评分';
            var control = button(label, 'ni-cell-button ' + kind.id, function () { openPopup(control, matches, county.city + '·' + county.label + ' · ' + topic.label + ' · ' + label); });
            control.setAttribute('aria-label', county.city + '·' + county.label + '，' + topic.label + '，' + label + '，' + matches.length + ' 个文件');
            control.setAttribute('aria-haspopup', 'dialog'); control.setAttribute('aria-controls', 'ni-file-popover'); control.setAttribute('aria-expanded', 'false');
            if (!matches.length) control.classList.add('ni-no-files');
            actions.appendChild(control);
          });
          cell.appendChild(actions);
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); matrixPanel.appendChild(table);
    matrixPanel.appendChild(el('p', 'ni-matrix-note', '数字为实际文件数，质控与评分合并文件只计一次。点击质控或评分查看文件；预览内可下载。'));
  }
  function selectView(next) {
    closePopup(false); view = next;
    var matrix = view === 'matrix';
    topicTabs.hidden = matrix; topicPanel.hidden = matrix; matrixPanel.hidden = !matrix;
    viewButtons.forEach(function (node, i) { node.setAttribute('aria-pressed', String((i === 1) === matrix)); });
    if (matrix && window.innerWidth <= 600 && matrixPanel.scrollIntoView) matrixPanel.scrollIntoView({block:'start', behavior:'instant'});
  }
  function rebuildBatchFilter() {
    var previous = filters.batch.value;
    filters.batch.replaceChildren();
    var all = el('option', '', '全部批次'); all.value = ''; filters.batch.appendChild(all);
    var used = new Set(C.query(data, {topicId:topicId}).map(function (entry) { return entry.batchId; }));
    data.batches.filter(function (batch) { return used.has(batch.id); }).forEach(function (batch) {
      var option = el('option', '', batch.label); option.value = batch.id; filters.batch.appendChild(option);
    });
    filters.batch.value = used.has(previous) ? previous : '';
    filters.batch.disabled = !loaded || !used.size;
  }
  function selectTopic(id, focus) {
    topicId = id;
    tabs.forEach(function (node, index) {
      var active = C.topics[index].id === id;
      node.setAttribute('aria-selected', String(active)); node.tabIndex = active ? 0 : -1;
      if (active && focus) node.focus({preventScroll:true});
    });
    topicPanel.setAttribute('aria-labelledby', 'ni-topic-' + id);
    panel.querySelector('.ni-topic-heading').textContent = lookup(C.topics, id).label;
    rebuildBatchFilter();
    renderMaterials();
  }
  async function refresh() {
    if (loading) return;
    loading = true;
    refreshButton.disabled = true;
    notify('正在读取国家抽查材料清单…');
    renderMaterials();
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var version = String(window.SOIL_RELEASE_VERSION || window.SOIL_APP_VERSION || '').replace(/^v/, '');
      var response = await fetch('./data/national-inspection.json?v=' + encodeURIComponent(version), {cache:'no-cache', credentials:'omit', signal:controller.signal});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var incoming = C.catalog(await response.json());
      data = incoming; loaded = true;
      loading = false;
      updateCounts(); rebuildBatchFilter(); renderMaterials();
    } catch (error) {
      loading = false;
      renderMaterials();
      notify('清单读取失败：' + (error.name === 'AbortError' ? '请求超时' : error.message) + (loaded ? '。继续显示上次成功读取的材料，请重试。' : '。尚不能确认文件或批次数量，请重试。'), true);
    } finally {
      clearTimeout(timer); loading = false; refreshButton.disabled = false;
      downloadButton.disabled = !loaded || downloadBusy || !filteredMaterials().length;
    }
  }
  function ensureZip() {
    if (window.JSZip) return Promise.resolve();
    var script = document.getElementById('soil-public-jszip');
    if (script && script.__soilLoadPromise) return script.__soilLoadPromise;
    script = script || document.createElement('script');
    script.id = 'soil-public-jszip'; script.async = true;
    script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    script.__soilLoadPromise = new Promise(function (resolve, reject) {
      script.addEventListener('load', function () { if (window.JSZip) resolve(); else reject(new Error('ZIP 组件初始化失败')); }, {once:true});
      script.addEventListener('error', function () { reject(new Error('ZIP 组件加载失败，请刷新页面后重试')); }, {once:true});
    });
    if (!script.parentNode) document.head.appendChild(script);
    return script.__soilLoadPromise;
  }
  async function downloadCurrent() {
    if (!loaded || downloadBusy) return;
    var entries = C.uniqueFiles(filteredMaterials());
    if (!entries.length) return;
    if (entries.length > 80 && !window.confirm('已选择 ' + entries.length + ' 个文件。浏览器需要先读取这些文件再生成 ZIP，可能占用较多内存和时间。是否继续？')) return;
    var downloadTopicLabel = lookup(C.topics, topicId).label;
    downloadBusy = true; downloadButton.disabled = true;
    notify('正在准备 ' + entries.length + ' 个文件。浏览器需要先读取文件再生成 ZIP，请保持页面打开。');
    try {
      await ensureZip();
      var zip = new window.JSZip();
      for (var i = 0; i < entries.length; i++) {
        notify('正在读取文件 ' + (i + 1) + ' / ' + entries.length + '：' + entries[i].name);
        var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 60000);
        try {
          var response = await fetch(C.sourceUrl(entries[i].path), {credentials:'omit', signal:controller.signal});
          if (!response.ok) throw new Error(entries[i].name + '（HTTP ' + response.status + '）');
          zip.file(entries[i].path, await response.blob());
        } finally { clearTimeout(timer); }
      }
      var blob = await zip.generateAsync({type:'blob'}, function (metadata) { notify('正在生成 ZIP：' + Math.round(metadata.percent) + '%'); });
      var url = URL.createObjectURL(blob), link = el('a');
      link.href = url; link.download = '国家抽查_' + downloadTopicLabel + '.zip';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      notify(downloadTopicLabel + '：已生成包含 ' + entries.length + ' 个原文件的 ZIP；同一路径只打包一次。');
    } catch (error) {
      notify('批量下载未完成：' + error.message + '。未生成不完整的 ZIP，请稍后重试。', true);
    } finally { downloadBusy = false; downloadButton.disabled = !filteredMaterials().length; }
  }
  function enter() {
    document.querySelectorAll('.tab,.tab-content').forEach(function (node) { node.classList.remove('active'); });
    tab.classList.add('active'); panel.classList.add('active');
    var banner = document.getElementById('missingBanner'); if (banner) banner.style.display = 'none';
    if (!loaded) refresh();
  }
  function filter(labelText, id, node, className) {
    var label = el('label', 'ni-filter ' + (className || ''));
    label.htmlFor = id; label.appendChild(el('span', '', labelText));
    node.id = id; label.appendChild(node);
    return label;
  }
  function install() {
    var navigation = document.querySelector('header .tabs'), host = document.querySelector('body > .container');
    if (!navigation || !host || document.getElementById('tab-nationalInspection')) return;
    tab = el('div', 'tab', '国家抽查'); tab.dataset.tab = 'nationalInspection'; tab.tabIndex = -1;
    tab.id = 'glass-tab-nationalInspection'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false'); tab.setAttribute('aria-controls', 'tab-nationalInspection');
    tab.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); enter(); });
    tab.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); enter(); } });
    navigation.appendChild(tab);
    panel = el('section', 'tab-content'); panel.id = 'tab-nationalInspection'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
    var page = el('div', 'ni-page'), heading = el('div', 'ni-heading'), introduction = el('div');
    introduction.appendChild(el('h2', '', '国家抽查'));
    introduction.className = 'ni-heading-title';
    introduction.appendChild(el('div', 'ni-kicker', '国家抽查 · 材料专栏'));
    summary = el('div', 'ni-summary', '材料清单待读取'); heading.appendChild(introduction); heading.appendChild(summary); page.appendChild(heading);
    var switcher = el('div', 'ni-view-switch'); switcher.setAttribute('role', 'group'); switcher.setAttribute('aria-label', '材料查看方式');
    viewButtons = [button('按专题', '', function () { selectView('topics'); }), button('区县 × 成果类型', '', function () { selectView('matrix'); })];
    viewButtons.forEach(function (node) { switcher.appendChild(node); }); page.appendChild(switcher);
    topicTabs = el('div', 'ni-topic-tabs'); topicTabs.setAttribute('role', 'tablist'); topicTabs.setAttribute('aria-label', '国家抽查专题');
    tabs = C.topics.map(function (topic) {
      var node = el('button', 'ni-topic', topic.label); node.type = 'button'; node.id = 'ni-topic-' + topic.id;
      node.setAttribute('role', 'tab'); node.setAttribute('aria-controls', 'ni-topic-panel');
      var count = el('span', 'ni-topic-count', '—'); count.setAttribute('aria-label', '文件数'); node.appendChild(count);
      node.addEventListener('click', function () { selectTopic(topic.id, false); }); topicTabs.appendChild(node); return node;
    });
    topicTabs.addEventListener('keydown', function (event) {
      var index = tabs.indexOf(event.target);
      if (index < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); event.stopPropagation(); selectTopic(C.topics[next].id, true);
    });
    page.appendChild(topicTabs);
    topicPanel = el('section'); topicPanel.id = 'ni-topic-panel'; topicPanel.setAttribute('role', 'tabpanel');
    var scope = el('div', 'ni-scope'); scope.setAttribute('aria-label', '本次抽查范围');
    C.counties.forEach(function (county) { scope.appendChild(el('span', '', county.city + ' · ' + county.label)); }); topicPanel.appendChild(scope);
    topicPanel.appendChild(el('h3', 'ni-topic-heading'));
    var toolbar = el('div', 'ni-toolbar'); filters = {county:el('select'), batch:el('select'), search:el('input')};
    var all = el('option', '', '全部区县'); all.value = ''; filters.county.appendChild(all);
    C.counties.forEach(function (county) { var option = el('option', '', county.city + ' · ' + county.label); option.value = county.id; filters.county.appendChild(option); });
    filters.search.type = 'search'; filters.search.placeholder = '搜索文件名、区县或批次';
    toolbar.appendChild(filter('区县', 'ni-county', filters.county));
    toolbar.appendChild(filter('批次', 'ni-batch', filters.batch));
    toolbar.appendChild(filter('搜索材料', 'ni-search', filters.search, 'ni-search-filter'));
    toolbar.appendChild(button('清除筛选', '', function () { filters.county.value = ''; filters.batch.value = ''; filters.search.value = ''; renderMaterials(); }));
    downloadButton = button('下载当前筛选 ZIP', 'primary', downloadCurrent); downloadButton.disabled = true; toolbar.appendChild(downloadButton);
    refreshButton = button('刷新清单', '', refresh); toolbar.appendChild(refreshButton);
    filters.county.addEventListener('change', renderMaterials); filters.batch.addEventListener('change', renderMaterials); filters.search.addEventListener('input', renderMaterials);
    topicPanel.appendChild(toolbar);
    status = el('p', 'ni-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); topicPanel.appendChild(status);
    results = el('div', 'ni-results'); topicPanel.appendChild(results);
    topicPanel.appendChild(el('p', 'ni-footnote', '此专栏仅展示已明确挂载的国家抽查材料，不自动搬入原质控区文件，也不计入原成果收缴统计。批量下载按当前专题及筛选条件打包，无需管理员密码。'));
    page.appendChild(topicPanel);
    matrixPanel = el('section', 'ni-matrix-panel'); matrixPanel.id = 'ni-matrix-panel'; page.appendChild(matrixPanel);
    panel.appendChild(page); host.appendChild(panel);
    document.addEventListener('click', function (event) { if (popup && event.target !== popupAnchor && event.target.closest('.ni-popover') !== popup) closePopup(false); });
    document.addEventListener('keydown', function (event) { if (popup && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePopup(true); } });
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', function (event) { if (popup && (!event.target.closest || event.target.closest('.ni-popover') !== popup)) positionPopup(); }, true);
    updateCounts(); selectTopic(topicId, false);
    selectView(view);
  }
  window.SoilNationalInspection = {install:install, enter:enter, refresh:refresh};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})();
