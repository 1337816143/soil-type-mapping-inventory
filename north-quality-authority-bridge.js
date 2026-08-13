(function () {
  'use strict';

  if (window.__soilNorthQualityAuthorityBridgeInstalled) return;
  window.__soilNorthQualityAuthorityBridgeInstalled = true;

  var PACKAGE_URL = './data/north-quality-feedback-package.json';
  var expectedDocumentCount = 28;
  var pendingRelativePaths = {};
  var installedRenderWrapper = false;
  var previewWrapped = false;
  var readyPromise = null;

  function A() { return window.SoilRepoAdmin; }
  function R() { return window.SoilQualityFileRouting; }
  function C() { return window.SoilAdminAutoClassifier; }
  function Q() { return window.SoilAdminImport; }

  function relativePath(path) {
    return String(path || '').replace(/^data\//, '');
  }

  function existingPathSet() {
    var set = {};
    var admin = A();
    (admin && Array.isArray(admin.tree) ? admin.tree : []).forEach(function (entry) {
      if (entry && entry.type === 'blob' && entry.path) set[String(entry.path)] = true;
    });
    return set;
  }

  function buildRecords(payload, physicalPaths) {
    pendingRelativePaths = {};
    return (payload.documents || []).map(function (doc) {
      var path = String(doc.physicalPath || '');
      var available = !!physicalPaths[path];
      if (!available) pendingRelativePaths[relativePath(path)] = true;
      return {
        kind:'quality-control',
        shared:true,
        registeredOnly:!available,
        fileAvailable:available,
        sourcePackage:payload.package,
        dataKeys:(doc.dataKeys || []).slice(),
        targets:(doc.targets || []).slice(),
        associationsByDataKey:doc.associationsByDataKey || {},
        batch:doc.batch || '第一轮',
        path:path,
        name:doc.filename,
        sourcePath:doc.filename,
        expectedSha256:doc.sha256 || '',
        expectedSize:Number(doc.size || 0),
        complete:true,
        associationStatus:payload.associationStatus || 'authoritative-confirmed'
      };
    });
  }

  function addStyles() {
    if (document.getElementById('north-quality-authority-style')) return;
    var style = document.createElement('style');
    style.id = 'north-quality-authority-style';
    style.textContent =
      '.north-registered-pending{cursor:default!important;border-style:dashed!important;background:#fff7ed!important;color:#b45309!important;border-color:#fdba74!important;text-decoration:none!important}' +
      '.north-registered-pending:hover{background:#fff7ed!important;color:#b45309!important;border-color:#fdba74!important}' +
      '.north-registered-pending .north-pending-badge{margin-left:3px;font-size:.66rem;font-weight:650;color:#c2410c}' +
      '.north-quality-index-note{display:inline-flex;align-items:center;margin-left:8px;padding:2px 7px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:.67rem;font-weight:650}' +
      '.v2-row.north-shared-authoritative .v2-fields{display:none!important}' +
      '.v2-row.north-shared-authoritative .v2-file em{color:#15803d!important}' +
      '.v2-row.north-shared-authoritative .v2-file small{color:#1d4ed8!important;font-weight:600}';
    document.head.appendChild(style);
  }

  function decorateHtml(html) {
    if (!html || !Object.keys(pendingRelativePaths).length) return html;
    var holder = document.createElement('div');
    holder.innerHTML = html;
    var pendingKeys = Object.keys(pendingRelativePaths);
    Array.prototype.forEach.call(holder.querySelectorAll('a[href]'), function (anchor) {
      var href = String(anchor.getAttribute('href') || '');
      var matched = pendingKeys.some(function (path) {
        return href === path || href.slice(-path.length) === path;
      });
      if (!matched) return;
      anchor.removeAttribute('href');
      anchor.removeAttribute('target');
      anchor.classList.add('north-registered-pending');
      anchor.setAttribute('aria-disabled', 'true');
      anchor.title = '关联关系和统计已确认；原始文件仍待归档到仓库，归档后自动恢复查看链接。';
      if (!anchor.querySelector('.north-pending-badge')) {
        var badge = document.createElement('span');
        badge.className = 'north-pending-badge';
        badge.textContent = '已登记·待归档';
        anchor.appendChild(badge);
      }
    });
    return holder.innerHTML;
  }

  function wrapRenderCities() {
    if (installedRenderWrapper || typeof window.renderCities !== 'function') return;
    var original = window.renderCities;
    window.renderCities = function () {
      return decorateHtml(original.apply(this, arguments));
    };
    window.renderCities.__northAuthorityWrapped = true;
    installedRenderWrapper = true;
  }

  function ensureSelectValue(select, value) {
    if (!select || !value) return;
    var exists = Array.prototype.some.call(select.options || [], function (option) { return option.value === value; });
    if (!exists) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = value;
  }

  function inspectionTaskCount(inspection) {
    var seen = {};
    Object.keys(inspection && inspection.byKey || {}).forEach(function (key) {
      (inspection.byKey[key] || []).forEach(function (entry) {
        seen[[entry.city,entry.unit,entry.district].join('|')] = true;
      });
    });
    return Object.keys(seen).length;
  }

  function syncPreviewRows() {
    var q = Q();
    var list = document.getElementById('adm-list');
    if (!q || !q.state || !Array.isArray(q.state.files) || !list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var item = q.state.files[Number(row.dataset.i)];
      var router = R();
      var classifier = C();
      var file = item && item.file;
      if (!item || !file || !router) return;

      var authority = typeof router.findAuthority === 'function' ? router.findAuthority(file.name, file.size) : null;
      var meta = item.autoMeta;
      // 手机ZIP解压可能发生在登记表异步加载完成前。命中权威文件时必须重新识别，
      // 不允许沿用早先产生的“归档信息不完整/未唯一”的陈旧 autoMeta。
      if (authority && classifier && typeof classifier.applyItemMetadata === 'function') {
        meta = classifier.applyItemMetadata(item);
      }
      if (!meta) return;

      var keys = authority && Array.isArray(authority.dataKeys) && authority.dataKeys.length ? authority.dataKeys.slice() : (meta.dataKeys || []).slice();
      var inspection = typeof router.inspectFile === 'function' ? router.inspectFile(file.name, keys, file.size) : null;
      var resolvedShared = !!(inspection && inspection.targets && inspection.targets.length && !inspection.unresolved.length);
      if (!authority && meta.source !== 'north-package-registry' && !resolvedShared) return;
      if (!resolvedShared) return;

      meta.dataKeys = inspection.dataKeys.slice();
      meta.targets = inspection.targets.slice();
      meta.unresolvedTargets = [];
      meta.associations = [];
      Object.keys(inspection.byKey || {}).forEach(function (key) {
        (inspection.byKey[key] || []).forEach(function (entry) {
          meta.associations.push({dataKey:key,city:entry.city,unit:entry.unit,district:entry.district,target:entry.sourceTarget || ''});
        });
      });
      item.autoMeta = meta;
      item.batch = meta.batch || authority && authority.batch || item.batch || '第一轮';
      ensureSelectValue(row.querySelector('.rb'), item.batch);
      row.classList.add('north-shared-authoritative');
      row.classList.add('auto-import-resolved');
      row.classList.remove('auto-import-needs-review');

      var status = row.querySelector('.v2-file em');
      var preview = row.querySelector('.v2-file small');
      var associationCount = inspectionTaskCount(inspection);
      if (status) {
        status.className = 'ok';
        status.textContent = '共享报告已完整匹配：' + inspection.targets.length + ' 个来源地区，关联 ' + associationCount + ' 个实际任务单元 × ' + inspection.dataKeys.length + ' 类成果；归档信息完整，可直接上传。';
      }
      if (preview) {
        preview.textContent = '共享质控报告 → ' + inspection.targets.join('、') + ' ｜ ' + inspection.dataKeys.map(function (key) {
          var labels = classifier && classifier.typeLabels || {};
          return labels[key] || key;
        }).join('、');
      }
    });
  }

  function wrapPreview() {
    if (previewWrapped) return;
    var q = Q();
    if (!q || typeof q.renderPreview !== 'function') return;
    var original = q.renderPreview;
    q.renderPreview = function () {
      var result = original.apply(this, arguments);
      setTimeout(syncPreviewRows, 0);
      return result;
    };
    q.renderPreview.__northAuthorityBridgeWrapped = true;
    previewWrapped = true;
  }

  function showIndexNote(payload) {
    var banner = document.getElementById('missingBanner');
    var heading = banner && banner.querySelector('h3');
    if (!heading || heading.querySelector('.north-quality-index-note')) return;
    var note = document.createElement('span');
    note.className = 'north-quality-index-note';
    note.textContent = '北部第一轮：' + payload.documentCount + '份报告已确认关联（3类主要成果）';
    heading.appendChild(note);
  }

  function applyPayload(payload) {
    if (!payload || payload.associationStatus !== 'authoritative-confirmed' || payload.documentCount !== expectedDocumentCount || !Array.isArray(payload.documents)) {
      throw new Error('北部质控权威索引格式或数量不正确');
    }
    var router = R();
    if (!router || typeof router.setAuthority !== 'function') throw new Error('北部质控路由器尚未就绪');

    // 路由器在这里把旧索引中错误扩展出的后3类过滤掉，只保留当前确认存在的
    // 土壤类型图、土壤属性图、耕地质量等级评价三类成果。
    var scopedPayload = router.setAuthority(payload);
    var classifier = C();
    if (classifier && typeof classifier.loadCatalogData === 'function') classifier.loadCatalogData(scopedPayload);

    function finish() {
      wrapRenderCities();
      wrapPreview();
      var records = buildRecords(scopedPayload, existingPathSet());
      window.SoilNorthQualityRegisteredRecords = records;
      window.SoilNorthQualityAuthorityPayload = scopedPayload;
      if (typeof window.applyAdminQualityIndex === 'function') window.applyAdminQualityIndex(records);
      if (classifier && typeof classifier.refresh === 'function') classifier.refresh();
      syncPreviewRows();
      if (typeof window.refreshAllTabs === 'function') window.refreshAllTabs();
      setTimeout(function () { showIndexNote(scopedPayload); syncPreviewRows(); }, 0);
      return records;
    }

    var admin = A();
    if (admin && typeof admin.loadTree === 'function') {
      return admin.loadTree(false).catch(function () { return []; }).then(finish);
    }
    return Promise.resolve(finish());
  }

  function load() {
    addStyles();
    return fetch(PACKAGE_URL + '?_=' + Date.now(), {cache:'no-store'})
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(applyPayload)
      .catch(function (error) {
        console.error('北部质控权威索引加载失败', error);
        return [];
      });
  }

  function ensureReady() {
    if (!readyPromise) readyPromise = load();
    window.SoilNorthQualityAuthorityReady = readyPromise;
    return readyPromise;
  }

  window.SoilNorthQualityAuthorityBridge = {
    load:function () { readyPromise = null; return ensureReady(); },
    ensureReady:ensureReady,
    decorateHtml:decorateHtml,
    syncPreviewRows:syncPreviewRows,
    get pendingRelativePaths() { return Object.assign({}, pendingRelativePaths); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureReady, {once:true});
  else ensureReady();
})();
