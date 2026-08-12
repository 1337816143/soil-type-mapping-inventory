(function () {
  'use strict';

  if (window.__soilAdminAutoClassifierInstalled) return;
  window.__soilAdminAutoClassifierInstalled = true;

  var PACKAGE_URL = './data/north-quality-feedback-package.json';
  var COMPREHENSIVE_KEYS = ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability'];
  var TYPE_LABELS = {
    soilType:'土壤类型图',
    soilAttr:'土壤属性图',
    farmland:'耕地质量等级评价',
    degradation:'土壤退化与障碍分析',
    specialty:'土特产品土壤适宜性评价',
    agriSuitability:'土壤农业利用适宜性评价',
    landUse:'土地资源评价与利用报告'
  };
  var catalog = {};
  var catalogLoaded = false;
  var manualMode = false;

  function Q() { return window.SoilAdminImport; }
  function R() { return window.SoilQualityFileRouting; }

  function normalize(value) {
    value = String(value == null ? '' : value);
    try { value = value.normalize('NFKC'); } catch (error) {}
    return value.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\\/g, '/').trim();
  }

  function basename(path) {
    var value = normalize(path);
    return value.slice(value.lastIndexOf('/') + 1);
  }

  function unique(values) {
    var seen = {};
    return (values || []).filter(function (value) {
      value = String(value || '');
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function inferBatch(text) {
    text = normalize(text);
    var special = text.match(/第[一二三四五六七八九十0-9]+批补充/);
    if (special) return special[0];
    var round = text.match(/第[一二三四五六七八九十0-9]+轮/);
    if (round) return round[0];
    var batch = text.match(/第[一二三四五六七八九十0-9]+批/);
    return batch ? batch[0] : '';
  }

  function inferDataKeys(text) {
    text = normalize(text);
    var keys = [];
    var rules = [
      ['specialty', /土特产品(?:土壤)?适宜性|特色产品.*适宜性/],
      ['agriSuitability', /土壤农业利用适宜性|农业利用适宜性/],
      ['landUse', /土地资源评价与利用报告|土地资源评价|土地利用评价/],
      ['farmland', /耕地质量等级/],
      ['degradation', /土壤退化|退化与障碍|障碍分析/],
      ['soilAttr', /土壤属性图|土壤属性/],
      ['soilType', /土壤类型图|土壤类型/]
    ];
    rules.forEach(function (rule) {
      if (rule[1].test(text)) keys.push(rule[0]);
    });
    keys = unique(keys);
    if (!keys.length && /第三次全国土壤普查\s*成果质控报告|综合质控报告|成果综合质控/.test(text)) {
      keys = COMPREHENSIVE_KEYS.slice();
    }
    return keys;
  }

  function inferKind(text, dataKeys) {
    text = normalize(text);
    if (/质控|质量控制|审核意见|审查意见/.test(text) || (dataKeys && dataKeys.length)) return 'quality';
    if (/参考资料|技术规程|技术规范|规范|标准|指南|培训|模板|手册|参考文件/.test(text)) return 'reference';
    return 'unknown';
  }

  function currentMode() {
    var select = document.getElementById('adm-kind');
    return select ? String(select.value || '') : '';
  }

  function catalogMatch(item) {
    var file = item && item.file;
    var name = basename(file && file.name || item && item.path || '');
    var doc = catalog[name];
    if (!doc) return null;
    var sizeMatches = !file || !doc.size || Number(file.size) === Number(doc.size);
    return {
      kind:'quality',
      confidence:sizeMatches ? 'catalog-exact' : 'catalog-name',
      catalogExact:sizeMatches,
      catalogNameMatched:true,
      sizeMatches:sizeMatches,
      batch:String(doc.batch || '第一轮'),
      dataKeys:Array.isArray(doc.dataKeys) ? doc.dataKeys.slice() : COMPREHENSIVE_KEYS.slice(),
      targets:Array.isArray(doc.targets) ? doc.targets.slice() : [],
      expectedSha256:String(doc.sha256 || ''),
      expectedSize:Number(doc.size || 0),
      source:'north-package-registry'
    };
  }

  function classifyItem(item) {
    if (!item) return {kind:'unknown',confidence:'low',dataKeys:[],targets:[],batch:''};
    var exact = catalogMatch(item);
    if (exact) return exact;

    var file = item.file;
    var text = [item.sourcePath, item.path, file && file.name].filter(Boolean).join(' / ');
    var keys = inferDataKeys(text);
    var kind = inferKind(text, keys);
    var batch = inferBatch(text) || String(item.batch || '');
    var targets = [];
    var router = R();
    if (kind === 'quality' && router && file && router.isSharedReport(file.name)) {
      targets = router.parseTargets(file.name);
      if (!keys.length) keys = COMPREHENSIVE_KEYS.slice();
    }
    if (kind === 'unknown' && currentMode()) kind = currentMode();
    return {
      kind:kind || 'unknown',
      confidence:(keys.length || targets.length || inferBatch(text)) ? 'high' : 'low',
      catalogExact:false,
      batch:batch,
      dataKeys:keys,
      targets:targets,
      expectedSha256:'',
      expectedSize:file ? Number(file.size || 0) : 0,
      source:'filename-rules'
    };
  }

  function applyItemMetadata(item) {
    var meta = classifyItem(item);
    item.autoMeta = meta;
    if (meta.batch) item.batch = meta.batch;
    return meta;
  }

  function setSelectValue(id, value) {
    var element = document.getElementById(id);
    if (!element || !value || element.value === value) return;
    var optionExists = Array.prototype.some.call(element.options || [], function (option) { return option.value === value; });
    if (!optionExists && id === 'adm-batch') {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      var insertBefore = Array.prototype.find.call(element.options || [], function (item) { return item.value === '__new__'; });
      element.insertBefore(option, insertBefore || null);
    }
    element.value = value;
    try { element.dispatchEvent(new Event('change', {bubbles:true})); } catch (error) {}
  }

  function selectionMetadata(files) {
    var metas = (files || []).map(applyItemMetadata);
    var knownKinds = unique(metas.map(function (meta) { return meta.kind !== 'unknown' ? meta.kind : ''; }));
    var kind = knownKinds.length === 1 ? knownKinds[0] : (knownKinds.length ? 'mixed' : 'unknown');
    var batches = unique(metas.map(function (meta) { return meta.batch; }));
    var unresolved = metas.filter(function (meta, index) {
      var item = files[index];
      if (meta.kind === 'unknown') return true;
      if (meta.kind === 'quality') {
        if (!meta.dataKeys.length) return true;
        if (meta.targets && meta.targets.length) return false;
        return !(item && item.city && item.unit && item.district);
      }
      return false;
    }).length;
    return {
      metas:metas,
      kind:kind,
      batch:batches.length === 1 ? batches[0] : '',
      unresolved:unresolved,
      catalogExact:metas.filter(function (meta) { return meta.catalogExact; }).length
    };
  }

  function typeSummary(metas) {
    var keys = unique([].concat.apply([], metas.map(function (meta) { return meta.dataKeys || []; })));
    if (!keys.length) return '未识别成果类型';
    return keys.map(function (key) { return TYPE_LABELS[key] || key; }).join('、');
  }

  function ensureStyles() {
    if (document.getElementById('admin-auto-classifier-style')) return;
    var style = document.createElement('style');
    style.id = 'admin-auto-classifier-style';
    style.textContent =
      '.auto-import-summary{margin:0 0 10px;padding:10px 12px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:.74rem;line-height:1.65}' +
      '.auto-import-summary strong{font-weight:750}.auto-import-summary .auto-import-actions{margin-top:6px}' +
      '.auto-import-summary button{padding:4px 9px;border:1px solid #93c5fd;border-radius:6px;background:#fff;color:#1d4ed8;cursor:pointer;font-size:.7rem}' +
      '.auto-import-hidden{display:none!important}.v2-row.auto-import-resolved .v2-fields{display:none!important}' +
      '.v2-row.auto-import-needs-review .v2-fields{display:grid!important}';
    document.head.appendChild(style);
  }

  function fieldFor(id) {
    var node = document.getElementById(id);
    return node && node.closest ? node.closest('.adm-field') : null;
  }

  function setManualFieldsVisible(visible) {
    ['adm-kind','adm-data-key','adm-batch','adm-city','adm-unit','adm-district'].forEach(function (id) {
      var field = fieldFor(id);
      if (field) field.classList.toggle('auto-import-hidden', !visible);
    });
    var apply = document.getElementById('v2-apply');
    if (apply) apply.classList.toggle('auto-import-hidden', !visible);

    var list = document.getElementById('adm-list');
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var index = Number(row.dataset.i);
      var item = Q() && Q().state && Q().state.files ? Q().state.files[index] : null;
      var meta = item && item.autoMeta;
      var complete = meta && meta.kind !== 'unknown' && (meta.kind !== 'quality' ||
        ((meta.dataKeys || []).length && ((meta.targets || []).length || (item.city && item.unit && item.district))));
      row.classList.toggle('auto-import-resolved', !visible && !!complete);
      row.classList.toggle('auto-import-needs-review', visible || !complete);
    });
  }

  function renderSummary(state) {
    var modal = document.getElementById('soilAdminImport');
    if (!modal) return;
    var summary = modal.querySelector('.auto-import-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'auto-import-summary';
      var list = document.getElementById('adm-list');
      var holder = list && list.closest ? list.closest('.adm-field') : null;
      if (holder) holder.parentNode.insertBefore(summary, holder);
      else modal.querySelector('.adm-grid').appendChild(summary);
    }
    if (!state || !state.metas.length) {
      summary.innerHTML = '<strong>自动识别已启用。</strong>选择文件或ZIP后，系统会自动识别导入类型、成果类型、批次和任务单元；只有未识别项才需要人工调整。';
      setManualFieldsVisible(manualMode);
      return;
    }

    var kindText = state.kind === 'quality' ? '质控意见' : state.kind === 'reference' ? '参考资料' : state.kind === 'mixed' ? '混合类型' : '未识别';
    var catalogText = state.catalogExact ? '；其中 ' + state.catalogExact + ' 份与北部片区登记表按“文件名+大小”精确匹配' : '';
    var reviewText = state.unresolved ? '；有 ' + state.unresolved + ' 份需要人工检查' : '；无需手动指定';
    summary.innerHTML = '<strong>自动识别：</strong>' + kindText +
      (state.batch ? ' · ' + state.batch : '') + ' · ' + typeSummary(state.metas) +
      catalogText + reviewText +
      '<div class="auto-import-actions"><button type="button" data-auto-import-toggle="1">' +
      (manualMode ? '恢复自动模式' : '显示人工调整') + '</button></div>';
    var button = summary.querySelector('[data-auto-import-toggle]');
    if (button) button.onclick = function () {
      manualMode = !manualMode;
      refresh();
    };
    setManualFieldsVisible(manualMode || state.unresolved > 0 || state.kind === 'mixed');
  }

  function annotateRows() {
    var q = Q();
    var list = document.getElementById('adm-list');
    if (!q || !list || !q.state) return;
    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var index = Number(row.dataset.i);
      var item = q.state.files[index];
      var meta = item && item.autoMeta;
      var status = row.querySelector('.v2-file em');
      if (!item || !meta || !status) return;
      var text = '';
      var className = 'ok';
      if (meta.kind === 'quality' && meta.catalogExact) {
        text = '已按北部片区登记表精确关联：' + (meta.targets || []).length + ' 个任务单元 × ' + meta.dataKeys.length + ' 类成果；原文件只保存1份。';
      } else if (meta.kind === 'quality' && meta.dataKeys.length) {
        text = '自动识别：' + meta.dataKeys.map(function (key) { return TYPE_LABELS[key] || key; }).join('、') +
          (meta.batch ? ' · ' + meta.batch : '') + ((meta.targets || []).length ? ' · ' + meta.targets.length + ' 个共享任务单元' : '');
      } else if (meta.kind === 'reference') {
        text = '自动识别为参考资料。';
      } else {
        text = '自动识别信息不足，请展开人工调整。';
        className = 'warn';
      }
      if (status.textContent !== text) status.textContent = text;
      if (status.className !== className) status.className = className;
    });
  }

  function applySelectionDefaults(state) {
    if (!state || !state.metas.length) return;
    if (state.kind === 'quality' || state.kind === 'reference') setSelectValue('adm-kind', state.kind);
    if (state.batch) setSelectValue('adm-batch', state.batch);
    if (state.kind === 'quality') {
      var singletonKeys = unique(state.metas.map(function (meta) {
        return meta.dataKeys && meta.dataKeys.length === 1 ? meta.dataKeys[0] : '';
      }));
      if (singletonKeys.length === 1 && state.metas.every(function (meta) { return meta.dataKeys.length === 1; })) {
        setSelectValue('adm-data-key', singletonKeys[0]);
      }
    }
  }

  function refresh() {
    ensureStyles();
    var q = Q();
    var files = q && q.state && Array.isArray(q.state.files) ? q.state.files : [];
    var state = selectionMetadata(files);
    applySelectionDefaults(state);
    annotateRows();
    renderSummary(state);
    window.SoilAdminAutoClassifier.lastSelection = state;
    return state;
  }

  function wrapFunction(name) {
    var q = Q();
    if (!q || typeof q[name] !== 'function' || q[name].__autoClassifierWrapped) return;
    var original = q[name];
    var wrapped = function () {
      var result = original.apply(this, arguments);
      setTimeout(refresh, 0);
      return result;
    };
    wrapped.__autoClassifierWrapped = true;
    q[name] = wrapped;
  }

  function bindInputs() {
    ['adm-files','adm-folder'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input || input.__autoClassifierBound) return;
      input.addEventListener('change', function () { setTimeout(refresh, 80); });
      input.__autoClassifierBound = true;
    });
  }

  function loadCatalog() {
    return fetch(PACKAGE_URL + '?_=' + Date.now(), {cache:'no-store'})
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (payload) {
        catalog = {};
        (payload && Array.isArray(payload.documents) ? payload.documents : []).forEach(function (doc) {
          catalog[basename(doc.filename)] = doc;
        });
        catalogLoaded = true;
        refresh();
        return payload;
      })
      .catch(function () {
        catalogLoaded = true;
        refresh();
        return null;
      });
  }

  function install() {
    wrapFunction('renderPreview');
    wrapFunction('normalizePreparedFiles');
    wrapFunction('open');
    bindInputs();
    refresh();
  }

  window.SoilAdminAutoClassifier = {
    comprehensiveKeys:COMPREHENSIVE_KEYS.slice(),
    typeLabels:Object.assign({}, TYPE_LABELS),
    inferBatch:inferBatch,
    inferDataKeys:inferDataKeys,
    inferKind:inferKind,
    classifyItem:classifyItem,
    applyItemMetadata:applyItemMetadata,
    selectionMetadata:selectionMetadata,
    refresh:refresh,
    get lastSelection() { return this._lastSelection || null; },
    set lastSelection(value) { this._lastSelection = value; },
    isCatalogLoaded:function () { return catalogLoaded; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  setTimeout(install, 600);
  loadCatalog();
})();
