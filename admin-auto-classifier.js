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
  var NAME_ALIASES = {
    '信都县':'信都区',
    '南和县':'南和区',
    '沙河县':'沙河市',
    '石家市':'石家庄市',
    '邯郸主城区':'合并区',
    '邯郸市主城区':'合并区',
    '石家庄合并区':'合并区',
    '邯郸合并区':'合并区',
    '雄安新区本级':'雄安新区',
    '雄安本级':'雄安新区',
    '雄安新区市级':'雄安新区'
  };
  var catalogExact = {};
  var catalogCanonical = {};
  var catalogLoaded = false;
  var manualMode = false;
  var refreshQueued = false;

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

  function stem(path) {
    return basename(path).replace(/\.[^.]+$/, '');
  }

  function compact(value) {
    value = normalize(value).toLowerCase();
    Object.keys(NAME_ALIASES).forEach(function (from) {
      value = value.split(from.toLowerCase()).join(NAME_ALIASES[from].toLowerCase());
    });
    return value
      .replace(/质量控制/g, '质控')
      .replace(/第三次全国土壤普查/g, '三普')
      .replace(/全国第三次土壤普查/g, '三普')
      .replace(/成果质量质控/g, '成果质控')
      .replace(/\.(pdf|docx?|xlsx?|pptx?|zip)$/i, '')
      .replace(/[\s\u3000（）()【】\[\]{}《》<>“”"'·,，。:：;；_\-—–]+/g, '');
  }

  function canonicalFilename(value) {
    var text = compact(basename(value));
    text = text.replace(/以[^为]{1,20}为例/g, '以x为例');
    return text;
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
    var special = text.match(/第[一二三四五六七八九十0-9]+批\s*补充/);
    if (special) return special[0].replace(/\s+/g, '');
    var round = text.match(/第[一二三四五六七八九十0-9]+轮/);
    if (round) return round[0];
    var batch = text.match(/第[一二三四五六七八九十0-9]+批/);
    if (batch) return batch[0];
    if (/首轮|第一轮质控/.test(text)) return '第一轮';
    return '';
  }

  function keysForSegment(segment) {
    segment = normalize(segment);
    var keys = [];
    var rules = [
      ['specialty', /土特产品(?:土壤)?适宜性|特色(?:农)?产品.*适宜性|特色产品/],
      ['agriSuitability', /土壤农业利用适宜性|农业利用适宜性|农业适宜性/],
      ['landUse', /土地资源评价与利用报告|土地资源评价|土地利用评价/],
      ['farmland', /耕地质量(?:等级)?评价|耕地质量等级|耕地质量评价|耕评|耕地等级/],
      ['degradation', /土壤退化|退化与障碍|障碍分析|障碍因素/],
      ['soilAttr', /土壤属性图|土壤属性成果|属性图成果|属性图/],
      ['soilType', /土壤类型图|土壤类型成果|土类图|类型图成果/]
    ];
    rules.forEach(function (rule) { if (rule[1].test(segment)) keys.push(rule[0]); });
    return unique(keys);
  }

  function inferDataKeys(text) {
    text = normalize(text);
    var segments = text.split('/').filter(Boolean);
    for (var i = segments.length - 1; i >= 0; i--) {
      var segmentKeys = keysForSegment(segments[i]);
      if (segmentKeys.length) return segmentKeys;
    }
    var keys = keysForSegment(text);
    if (keys.length) return keys;
    if (/三普.*成果.*(?:质控|质量控制).*报告|第三次全国土壤普查.*成果.*(?:质控|质量控制).*报告|综合质控报告|成果综合质控/.test(text)) {
      return COMPREHENSIVE_KEYS.slice();
    }
    return [];
  }

  function inferKind(text, dataKeys) {
    text = normalize(text);
    if (/质控|质量控制|审核意见|审查意见|复核意见|成果检查/.test(text) || (dataKeys && dataKeys.length)) return 'quality';
    if (/参考资料|技术规程|技术规范|规范|标准|指南|培训|模板|手册|参考文件/.test(text)) return 'reference';
    return 'unknown';
  }

  function currentMode() {
    var select = document.getElementById('adm-kind');
    return select ? String(select.value || '') : '';
  }

  function registerCatalog(payload) {
    catalogExact = {};
    catalogCanonical = {};
    (payload && Array.isArray(payload.documents) ? payload.documents : []).forEach(function (doc) {
      var base = basename(doc.filename);
      var canonical = canonicalFilename(base);
      catalogExact[base] = doc;
      if (!catalogCanonical[canonical]) catalogCanonical[canonical] = [];
      catalogCanonical[canonical].push(doc);
    });
    catalogLoaded = true;
    return payload;
  }

  function catalogMatch(item) {
    var file = item && item.file;
    var name = basename(file && file.name || item && item.path || '');
    var candidates = [];
    if (catalogExact[name]) candidates = [catalogExact[name]];
    if (!candidates.length) candidates = catalogCanonical[canonicalFilename(name)] || [];
    if (!candidates.length) return null;

    var size = file ? Number(file.size || 0) : 0;
    var doc = candidates.filter(function (candidate) { return size && Number(candidate.size) === size; })[0] || candidates[0];
    var sizeMatches = !size || !doc.size || Number(doc.size) === size;
    var exactName = basename(doc.filename) === name;
    return {
      kind:'quality',
      confidence:(exactName && sizeMatches) ? 'catalog-exact' : (sizeMatches ? 'catalog-canonical' : 'catalog-name'),
      catalogExact:!!(exactName && sizeMatches),
      catalogMatched:true,
      sizeMatches:sizeMatches,
      batch:String(doc.batch || '第一轮'),
      dataKeys:Array.isArray(doc.dataKeys) ? doc.dataKeys.slice() : COMPREHENSIVE_KEYS.slice(),
      targets:Array.isArray(doc.targets) ? doc.targets.slice() : [],
      expectedSha256:sizeMatches ? String(doc.sha256 || '') : '',
      expectedSize:sizeMatches ? Number(doc.size || 0) : 0,
      source:'north-package-registry'
    };
  }

  function taskListsFor(dataKeys) {
    var registry = window.SoilTaskUnitLists || {};
    var lists = [];
    (dataKeys && dataKeys.length ? dataKeys : ['soilType']).forEach(function (key) {
      var list = typeof registry.listFor === 'function' ? registry.listFor(key) : (key === 'soilType' ? registry.soilType : registry.other);
      if (Array.isArray(list)) lists.push(list);
    });
    if (!lists.length && Array.isArray(window.masterList)) lists.push(window.masterList);
    if (Array.isArray(registry.soilType)) lists.push(registry.soilType);
    if (Array.isArray(registry.other)) lists.push(registry.other);
    return lists;
  }

  function flattenTasks(dataKeys) {
    var rows = [];
    var seen = {};
    taskListsFor(dataKeys).forEach(function (list) {
      (list || []).forEach(function (city) {
        (city.items || []).forEach(function (unit) {
          (unit.districts || []).forEach(function (district) {
            var key = [city.city, unit.unit, district].join('\n');
            if (!seen[key]) {
              seen[key] = true;
              rows.push({city:String(city.city || ''), unit:String(unit.unit || ''), district:String(district || '')});
            }
          });
        });
      });
    });
    return rows;
  }

  function textHas(text, value) {
    return compact(text).indexOf(compact(value)) >= 0;
  }

  function inferSingleAssociation(text, dataKeys) {
    text = normalize(text);
    Object.keys(NAME_ALIASES).forEach(function (from) { text = text.split(from).join(NAME_ALIASES[from]); });
    var rows = flattenTasks(dataKeys);
    if (!rows.length) return null;

    var explicitCities = unique(rows.filter(function (row) { return row.city && textHas(text, row.city); }).map(function (row) { return row.city; }));
    var explicitUnits = unique(rows.filter(function (row) { return row.unit && textHas(text, row.unit); }).map(function (row) { return row.unit; }));
    var matchedDistricts = unique(rows.filter(function (row) { return row.district && textHas(text, row.district); }).map(function (row) { return row.district; }));

    var cityHint = explicitCities.length === 1 ? explicitCities[0] : '';
    var unitHint = explicitUnits.length === 1 ? explicitUnits[0] : '';
    var district = matchedDistricts.length === 1 ? matchedDistricts[0] : '';

    if (!district && cityHint && /(市级|市本级|全市|市级汇总)/.test(text)) {
      var cityLevel = rows.filter(function (row) { return row.city === cityHint && (row.district === cityHint || /市级|本级|汇总/.test(row.district)); });
      if (cityLevel.length === 1) district = cityLevel[0].district;
    }

    var candidates = rows.filter(function (row) {
      if (cityHint && row.city !== cityHint) return false;
      if (unitHint && row.unit !== unitHint) return false;
      if (district && row.district !== district) return false;
      return !!(cityHint || unitHint || district);
    });

    if (!candidates.length && district) candidates = rows.filter(function (row) { return row.district === district; });
    if (!candidates.length && unitHint) candidates = rows.filter(function (row) { return row.unit === unitHint; });
    if (candidates.length === 1) return candidates[0];

    if (district) {
      var districts = candidates.filter(function (row) { return row.district === district; });
      if (cityHint) districts = districts.filter(function (row) { return row.city === cityHint; });
      if (unitHint) districts = districts.filter(function (row) { return row.unit === unitHint; });
      if (districts.length === 1) return districts[0];
    }
    return null;
  }

  function sharedReportTargets(fileName) {
    var router = R();
    if (router && typeof router.isSharedReport === 'function' && router.isSharedReport(fileName)) {
      return router.parseTargets(fileName) || [];
    }
    var name = stem(fileName);
    var marker = name.search(/(?:第三次全国土壤普查|三普).*成果.*(?:质控|质量控制).*报告/);
    if (marker < 0) return [];
    var prefix = name.slice(0, marker).replace(/(?:、|,|，|和|及)?市级$/, '、市级');
    return unique(prefix.split(/[、,，;；和及]+/).map(function (part) { return part.trim(); }).filter(Boolean));
  }

  function resolveShared(targets, dataKeys, fileName) {
    var router = R();
    if (!router || typeof router.resolveTargets !== 'function' || !targets.length) return {associations:[],unresolved:targets.slice()};
    var all = [];
    var unresolved = [];
    (dataKeys || []).forEach(function (key) {
      var result = router.resolveTargets(targets, key, fileName || '');
      (result.associations || []).forEach(function (association) {
        all.push({dataKey:key,city:association.city,unit:association.unit,district:association.district,target:association.target});
      });
      (result.unresolved || []).forEach(function (target) { unresolved.push(target); });
    });
    return {associations:all, unresolved:unique(unresolved)};
  }

  function classifyItem(item) {
    if (!item) return {kind:'unknown',confidence:'low',dataKeys:[],targets:[],batch:'',associations:[],unresolvedTargets:[]};
    var exact = catalogMatch(item);
    var file = item.file;
    var text = [item.sourcePath, item.path, file && file.name].filter(Boolean).join(' / ');
    var fileName = basename(file && file.name || item.path || '');
    var keys = exact ? exact.dataKeys.slice() : inferDataKeys(text);
    var kind = exact ? exact.kind : inferKind(text, keys);
    var batch = exact ? exact.batch : (inferBatch(text) || String(item.batch && item.batch !== '管理员导入' ? item.batch : ''));
    var targets = exact ? exact.targets.slice() : [];
    if (!targets.length && kind === 'quality') targets = sharedReportTargets(fileName);
    if (targets.length && !keys.length) keys = COMPREHENSIVE_KEYS.slice();
    if (kind === 'unknown' && currentMode()) kind = currentMode();

    var association = null;
    var shared = {associations:[], unresolved:[]};
    if (kind === 'quality' && targets.length) shared = resolveShared(targets, keys, fileName);
    else if (kind === 'quality') association = inferSingleAssociation(text, keys);

    var result = exact || {};
    result.kind = kind || result.kind || 'unknown';
    result.confidence = result.confidence || ((keys.length || targets.length || association || inferBatch(text)) ? 'high' : 'low');
    result.catalogExact = !!result.catalogExact;
    result.catalogMatched = !!result.catalogMatched;
    result.batch = batch || result.batch || '';
    result.dataKeys = keys;
    result.targets = targets;
    result.association = association;
    result.associations = shared.associations || [];
    result.unresolvedTargets = shared.unresolved || [];
    result.expectedSha256 = String(result.expectedSha256 || '');
    result.expectedSize = Number(result.expectedSize || (file ? file.size : 0) || 0);
    result.source = result.source || 'filename-path-rules';
    return result;
  }

  function applyItemMetadata(item) {
    var meta = classifyItem(item);
    item.autoMeta = meta;
    if (meta.batch) item.batch = meta.batch;
    if (meta.association) {
      item.city = meta.association.city || item.city || '';
      item.unit = meta.association.unit || item.unit || '';
      item.district = meta.association.district || item.district || '';
    }
    return meta;
  }

  function isResolved(item, meta) {
    if (!meta || meta.kind === 'unknown') return false;
    if (meta.kind !== 'quality') return true;
    if (!meta.dataKeys.length) return false;
    if (meta.targets.length) return meta.unresolvedTargets.length === 0;
    return !!(item && item.city && item.unit && item.district);
  }

  function selectionMetadata(files) {
    var metas = (files || []).map(applyItemMetadata);
    var knownKinds = unique(metas.map(function (meta) { return meta.kind !== 'unknown' ? meta.kind : ''; }));
    var batches = unique(metas.map(function (meta) { return meta.batch; }));
    var unresolved = metas.filter(function (meta, index) { return !isResolved(files[index], meta); }).length;
    return {
      metas:metas,
      kind:knownKinds.length === 1 ? knownKinds[0] : (knownKinds.length ? 'mixed' : 'unknown'),
      batch:batches.length === 1 ? batches[0] : '',
      unresolved:unresolved,
      catalogExact:metas.filter(function (meta) { return meta.catalogExact; }).length,
      catalogMatched:metas.filter(function (meta) { return meta.catalogMatched; }).length
    };
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

  function typeSummary(metas) {
    var keys = unique([].concat.apply([], metas.map(function (meta) { return meta.dataKeys || []; })));
    return keys.length ? keys.map(function (key) { return TYPE_LABELS[key] || key; }).join('、') : '未识别成果类型';
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
      '.v2-row.auto-import-needs-review .v2-fields{display:grid!important}.auto-import-path{color:#1d4ed8!important;font-weight:600}';
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
    var q = Q();
    var list = document.getElementById('adm-list');
    if (!q || !q.state || !list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var item = q.state.files[Number(row.dataset.i)];
      var complete = item && isResolved(item, item.autoMeta);
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
      else if (modal.querySelector('.adm-grid')) modal.querySelector('.adm-grid').appendChild(summary);
    }
    if (!summary) return;
    if (!state || !state.metas.length) {
      summary.innerHTML = '<strong>自动识别已启用。</strong>支持当前北部共享质控报告、历史第一/二/三批文件名与目录结构，以及常见旧行政区名称。';
      setManualFieldsVisible(manualMode);
      return;
    }
    var kindText = state.kind === 'quality' ? '质控意见' : state.kind === 'reference' ? '参考资料' : state.kind === 'mixed' ? '混合类型' : '未识别';
    var matchText = state.catalogMatched ? '；' + state.catalogMatched + ' 份命中北部28份登记表' : '';
    var reviewText = state.unresolved ? '；仍有 ' + state.unresolved + ' 份需要人工检查' : '；全部已自动识别，无需手动指定';
    summary.innerHTML = '<strong>自动识别：</strong>' + kindText + (state.batch ? ' · ' + state.batch : '') + ' · ' + typeSummary(state.metas) + matchText + reviewText +
      '<div class="auto-import-actions"><button type="button" data-auto-import-toggle="1">' + (manualMode ? '恢复自动模式' : '显示人工调整') + '</button></div>';
    var button = summary.querySelector('[data-auto-import-toggle]');
    if (button) button.onclick = function () { manualMode = !manualMode; refresh(); };
    setManualFieldsVisible(manualMode || state.unresolved > 0 || state.kind === 'mixed');
  }

  function annotateRows() {
    var q = Q();
    var list = document.getElementById('adm-list');
    if (!q || !list || !q.state) return;
    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var item = q.state.files[Number(row.dataset.i)];
      var meta = item && item.autoMeta;
      var status = row.querySelector('.v2-file em');
      var preview = row.querySelector('.v2-file small');
      if (!item || !meta || !status) return;
      var text = '';
      var className = 'ok';
      if (meta.kind === 'quality' && meta.targets.length && !meta.unresolvedTargets.length) {
        text = '自动关联完成：' + meta.targets.length + ' 个任务单元 × ' + meta.dataKeys.length + ' 类成果；原文件只保存1份。';
        if (preview) {
          preview.textContent = '共享质控报告 → ' + meta.targets.join('、') + ' ｜ ' + meta.dataKeys.map(function (key) { return TYPE_LABELS[key] || key; }).join('、');
          preview.classList.add('auto-import-path');
        }
      } else if (meta.kind === 'quality' && meta.association && meta.dataKeys.length) {
        text = '自动识别：' + meta.dataKeys.map(function (key) { return TYPE_LABELS[key] || key; }).join('、') + ' · ' + (meta.batch || item.batch || '未分批') + ' · ' + [item.city,item.unit,item.district].filter(Boolean).join(' / ');
      } else if (meta.kind === 'quality' && meta.dataKeys.length) {
        text = '已识别成果类型与批次，但任务单元仍不唯一，请人工检查。';
        className = 'warn';
      } else if (meta.kind === 'reference') {
        text = '自动识别为参考资料。';
      } else {
        text = '自动识别信息不足，请展开人工调整。';
        className = 'warn';
      }
      status.textContent = text;
      status.className = className;
    });
  }

  function applySelectionDefaults(state) {
    if (!state || !state.metas.length) return;
    if (state.kind === 'quality' || state.kind === 'reference') setSelectValue('adm-kind', state.kind);
    if (state.batch) setSelectValue('adm-batch', state.batch);
    if (state.kind === 'quality') {
      var singletonKeys = unique(state.metas.map(function (meta) { return meta.dataKeys && meta.dataKeys.length === 1 ? meta.dataKeys[0] : ''; }));
      if (singletonKeys.length === 1 && state.metas.every(function (meta) { return meta.dataKeys.length === 1; })) setSelectValue('adm-data-key', singletonKeys[0]);
    }
  }

  function refresh() {
    refreshQueued = false;
    ensureStyles();
    var q = Q();
    var files = q && q.state && Array.isArray(q.state.files) ? q.state.files : [];
    var state = selectionMetadata(files);
    applySelectionDefaults(state);
    annotateRows();
    renderSummary(state);
    if (window.SoilAdminAutoClassifier) window.SoilAdminAutoClassifier.lastSelection = state;
    return state;
  }

  function queueRefresh(delay) {
    if (refreshQueued && !delay) return;
    refreshQueued = true;
    setTimeout(refresh, delay || 0);
  }

  function watchStateFiles() {
    var q = Q();
    var state = q && q.state;
    if (!state || state.__autoClassifierFilesWatched) return;
    var current = Array.isArray(state.files) ? state.files : [];
    try {
      Object.defineProperty(state, 'files', {
        configurable:true,
        enumerable:true,
        get:function () { return current; },
        set:function (next) {
          current = Array.isArray(next) ? next : [];
          queueRefresh(0);
        }
      });
      state.__autoClassifierFilesWatched = true;
    } catch (error) {}
  }

  function wrapFunction(name) {
    var q = Q();
    if (!q || typeof q[name] !== 'function' || q[name].__autoClassifierWrapped) return;
    var original = q[name];
    var wrapped = function () {
      var result = original.apply(this, arguments);
      queueRefresh(0);
      return result;
    };
    wrapped.__autoClassifierWrapped = true;
    q[name] = wrapped;
  }

  function bindInputs() {
    ['adm-files','adm-folder'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input || input.__autoClassifierBound) return;
      input.addEventListener('change', function () { queueRefresh(120); });
      input.__autoClassifierBound = true;
    });
  }

  function loadCatalog() {
    return fetch(PACKAGE_URL + '?_=' + Date.now(), {cache:'no-store'})
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (payload) { registerCatalog(payload); refresh(); return payload; })
      .catch(function () { catalogLoaded = true; refresh(); return null; });
  }

  function install() {
    watchStateFiles();
    wrapFunction('renderPreview');
    wrapFunction('normalizePreparedFiles');
    wrapFunction('acceptSplitFiles');
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
    inferSingleAssociation:inferSingleAssociation,
    classifyItem:classifyItem,
    applyItemMetadata:applyItemMetadata,
    selectionMetadata:selectionMetadata,
    loadCatalogData:function (payload) { registerCatalog(payload); return payload; },
    refresh:refresh,
    get lastSelection() { return this._lastSelection || null; },
    set lastSelection(value) { this._lastSelection = value; },
    isCatalogLoaded:function () { return catalogLoaded; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  [250,650,1150,1800].forEach(function (delay) { setTimeout(install, delay); });
  loadCatalog();
})();
