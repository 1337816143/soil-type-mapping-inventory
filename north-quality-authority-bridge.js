(function () {
  'use strict';

  if (window.__soilNorthQualityAuthorityBridgeInstalled) return;
  window.__soilNorthQualityAuthorityBridgeInstalled = true;

  var PACKAGE_URL = './data/north-quality-feedback-package.json';
  var expectedDocumentCount = 28;
  var pendingRelativePaths = {};
  var installedRenderWrapper = false;
  var previewWrapped = false;

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

  function countAssociations(meta) {
    var seen = {};
    (meta && meta.associations || []).forEach(function (item) {
      seen[[item.city,item.unit,item.district].join('|')] = true;
    });
    return Object.keys(seen).length;
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

  function syncPreviewRows() {
    var q = Q();
    var list = document.getElementById('adm-list');
    if (!q || !q.state || !Array.isArray(q.state.files) || !list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var item = q.state.files[Number(row.dataset.i)];
      var meta = item && item.autoMeta;
      if (!item || !meta || !meta.targets || !meta.targets.length || meta.unresolvedTargets && meta.unresolvedTargets.length) return;
      var router = R();
      var file = item.file;
      var authority = router && file && typeof router.findAuthority === 'function' ? router.findAuthority(file.name, file.size) : null;
      if (!authority && meta.source !== 'north-package-registry') return;

      item.batch = meta.batch || authority && authority.batch || item.batch || '第一轮';
      ensureSelectValue(row.querySelector('.rb'), item.batch);
      row.classList.add('north-shared-authoritative');
      row.classList.add('auto-import-resolved');
      row.classList.remove('auto-import-needs-review');

      var status = row.querySelector('.v2-file em');
      var preview = row.querySelector('.v2-file small');
      var associationCount = countAssociations(meta);
      if (!associationCount && router && file && typeof router.inspectFile === 'function') {
        var inspection = router.inspectFile(file.name, meta.dataKeys, file.size);
        var seen = {};
        Object.keys(inspection.byKey || {}).forEach(function (key) {
          (inspection.byKey[key] || []).forEach(function (entry) { seen[[entry.city,entry.unit,entry.district].join('|')] = true; });
        });
        associationCount = Object.keys(seen).length;
      }
      if (status) {
        status.className = 'ok';
        status.textContent = '共享报告已确认：' + meta.targets.length + ' 个来源地区，关联 ' + associationCount + ' 个实际任务单元 × ' + (meta.dataKeys || []).length + ' 类成果；一份文件对应多个任务单元是正常关系，无需选择单一任务单元。';
      }
      if (preview) {
        preview.textContent = '共享质控报告 → ' + meta.targets.join('、') + ' ｜ ' + (meta.dataKeys || []).map(function (key) {
          var labels = C() && C().typeLabels || {};
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
    note.textContent = '北部第一轮：' + payload.documentCount + '份报告已确认关联';
    heading.appendChild(note);
  }

  function applyPayload(payload) {
    if (!payload || payload.associationStatus !== 'authoritative-confirmed' || payload.documentCount !== expectedDocumentCount || !Array.isArray(payload.documents)) {
      throw new Error('北部质控权威索引格式或数量不正确');
    }
    var router = R();
    if (!router || typeof router.setAuthority !== 'function') throw new Error('北部质控路由器尚未就绪');
    router.setAuthority(payload);

    var classifier = C();
    if (classifier && typeof classifier.loadCatalogData === 'function') classifier.loadCatalogData(payload);

    function finish() {
      wrapRenderCities();
      wrapPreview();
      var records = buildRecords(payload, existingPathSet());
      window.SoilNorthQualityRegisteredRecords = records;
      window.SoilNorthQualityAuthorityPayload = payload;
      if (typeof window.applyAdminQualityIndex === 'function') window.applyAdminQualityIndex(records);
      if (classifier && typeof classifier.refresh === 'function') classifier.refresh();
      syncPreviewRows();
      if (typeof window.refreshAllTabs === 'function') window.refreshAllTabs();
      setTimeout(function () { showIndexNote(payload); syncPreviewRows(); }, 0);
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

  window.SoilNorthQualityAuthorityBridge = {
    load:load,
    decorateHtml:decorateHtml,
    syncPreviewRows:syncPreviewRows,
    get pendingRelativePaths() { return Object.assign({}, pendingRelativePaths); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once:true});
  else load();
})();
