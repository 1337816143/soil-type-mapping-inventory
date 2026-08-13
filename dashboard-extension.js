(function () {
  'use strict';

  var TYPES = {
    soilType: '土壤类型图',
    soilAttr: '土壤属性图',
    farmland: '耕地质量等级评价',
    degradation: '土壤退化与障碍分析',
    specialty: '土特产品土壤适宜性评价',
    agriSuitability: '土壤农业利用适宜性评价',
    landUse: '土地资源评价与利用报告'
  };
  var NEW_KEYS = ['degradation', 'specialty', 'agriSuitability', 'landUse'];
  var appliedAssociations = {};
  var IMPORTED_QUALITY_PREFIX = './data/质控意见反馈_管理员导入/';

  window.SoilDashboardTypes = Object.assign({}, window.SoilDashboardTypes || {}, TYPES);

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function importedQualityRawUrl(href) {
    href = String(href || '');
    if (href.indexOf(IMPORTED_QUALITY_PREFIX) !== 0) return '';
    var repositoryPath = href.replace(/^\.\//, '');
    var admin = window.SoilRepoAdmin;
    if (admin && typeof admin.raw === 'function') return admin.raw(repositoryPath);
    return 'https://raw.githubusercontent.com/1337816143/soil-type-mapping-inventory/main/' +
      repositoryPath.split('/').map(encodeURIComponent).join('/');
  }

  function rewriteImportedQualityLinks(html) {
    if (!html || html.indexOf(IMPORTED_QUALITY_PREFIX) < 0) return html;
    var holder = document.createElement('div');
    holder.innerHTML = html;
    Array.prototype.forEach.call(holder.querySelectorAll('a[href]'), function (anchor) {
      var rawUrl = importedQualityRawUrl(anchor.getAttribute('href'));
      if (!rawUrl) return;
      anchor.setAttribute('href', rawUrl);
      anchor.setAttribute('rel', 'noopener');
      anchor.setAttribute('data-admin-quality-source', 'github-raw');
    });
    return holder.innerHTML;
  }

  function wrapImportedQualityLinks() {
    if (typeof window.renderCities !== 'function' || window.renderCities.__adminImportedRawLinks) return;
    var original = window.renderCities;
    var wrapped = function () {
      return rewriteImportedQualityLinks(original.apply(this, arguments));
    };
    wrapped.__adminImportedRawLinks = true;
    window.renderCities = wrapped;
  }

  window.SoilAdminQualityRawUrl = importedQualityRawUrl;

  function addStyles() {
    if (document.getElementById('dashboard-extension-style')) return;
    var style = document.createElement('style');
    style.id = 'dashboard-extension-style';
    style.textContent =
      '.missing-banner h3{flex-wrap:wrap}' +
      '.quality-admin-global{margin-left:10px;display:inline-flex;align-items:center;padding:4px 10px;border:1px dashed #7c3aed;border-radius:6px;background:#fff;color:#6d28d9;font-size:.75rem;font-weight:650;cursor:pointer;white-space:nowrap}' +
      '.quality-admin-global:hover{background:#f5f3ff;border-color:#6d28d9}' +
      '@media(max-width:760px){.quality-admin-global{margin-left:0}}';
    document.head.appendChild(style);
  }

  function ensureTabs() {
    var tabs = document.querySelector('header .tabs');
    var container = document.querySelector('body > .container');
    if (!tabs || !container || !window.tabData) return;

    var farmland = tabs.querySelector('[data-tab="farmland"]');
    if (farmland) farmland.textContent = TYPES.farmland;

    NEW_KEYS.forEach(function (key) {
      if (!window.tabData[key]) window.tabData[key] = [];
      var tab = tabs.querySelector('[data-tab="' + key + '"]');
      if (!tab) {
        tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.tab = key;
        tab.textContent = TYPES[key];
        tabs.appendChild(tab);
      } else {
        tab.textContent = TYPES[key];
      }
      var panel = document.getElementById('tab-' + key);
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'tab-' + key;
        panel.className = 'tab-content';
        panel.innerHTML = '<div class="content"></div>';
        container.appendChild(panel);
      }
      if (!tab.dataset.dashboardBound) {
        tab.dataset.dashboardBound = '1';
        tab.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          document.querySelectorAll('.tab').forEach(function (item) { item.classList.remove('active'); });
          document.querySelectorAll('.tab-content').forEach(function (item) { item.classList.remove('active'); });
          tab.classList.add('active');
          panel.classList.add('active');
          if (window.renderMissingBanner) window.renderMissingBanner(key);
        });
      }
    });
  }

  function activeKey() {
    var tab = document.querySelector('.tab.active');
    return tab && tab.dataset.tab ? tab.dataset.tab : 'soilType';
  }
  window.getActiveDashboardKey = activeKey;

  function hideCollectionBanner() {
    var banner = document.getElementById('missingBanner');
    if (banner) banner.style.display = 'none';
  }

  function setHeadingText(heading, text) {
    var textNode = null;
    Array.prototype.some.call(heading.childNodes, function (node) {
      if (node.nodeType === 3) {
        textNode = node;
        return true;
      }
      return false;
    });
    if (textNode) textNode.nodeValue = text;
    else heading.insertBefore(document.createTextNode(text), heading.firstChild);
  }

  function decorateBanner(key) {
    if (!TYPES[key]) return;
    var banner = document.getElementById('missingBanner');
    var heading = banner && banner.querySelector('h3');
    if (!heading) return;

    setHeadingText(heading, TYPES[key] + '收缴进度');

    heading.querySelectorAll('.quality-admin-global').forEach(function (item) { item.remove(); });
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'quality-admin-global';
    button.textContent = '管理员导入质控意见';
    button.dataset.key = key;
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof window.openSoilAdminImport !== 'function') {
        alert('管理员导入组件仍在加载，请稍后重试。');
        return;
      }
      window.openSoilAdminImport({kind: 'quality', dataKey: key});
    });
    heading.appendChild(button);

    var deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'quality-admin-global admin-delete-trigger';
    deleteButton.textContent = '管理员删除';
    deleteButton.dataset.key = key;
    deleteButton.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof window.openSoilAdminDelete !== 'function') {
        alert('管理员删除组件仍在加载，请稍后重试。');
        return;
      }
      window.openSoilAdminDelete({scope:'quality', dataKey:key});
    });
    heading.appendChild(deleteButton);
  }

  function wrapMissingBanner() {
    if (window.__dashboardMissingWrapped || typeof window.renderMissingBanner !== 'function') return;
    var original = window.renderMissingBanner;
    window.renderMissingBanner = function (key) {
      if (key === 'references') {
        hideCollectionBanner();
        return;
      }
      original(key);
      decorateBanner(key);
    };
    window.__dashboardMissingWrapped = true;
  }

  function findOrCreateCity(key, cityName) {
    var cities = window.tabData[key] || (window.tabData[key] = []);
    var city = cities.find(function (item) { return item.name === cityName; });
    if (!city) {
      city = {name: cityName, units: []};
      cities.push(city);
    }
    return city;
  }

  function associationKey(entry) {
    return [entry.path, entry.dataKey, entry.city, entry.unit, entry.district, entry.batch || ''].join('|');
  }

  function mergeQualityEntry(entry) {
    if (!entry || entry.kind !== 'quality-control' || !TYPES[entry.dataKey]) return;
    if (!entry.city || !entry.unit || !entry.district || !entry.path) return;
    var key = associationKey(entry);
    if (appliedAssociations[key]) return;

    var city = findOrCreateCity(entry.dataKey, entry.city);
    var unit = city.units.find(function (item) { return item.name === entry.unit; });
    if (!unit) {
      unit = {name: entry.unit, districts: []};
      city.units.push(unit);
    }
    var district = unit.districts.find(function (item) { return item.label === entry.district; });
    if (!district) {
      district = {label: entry.district, docs: []};
      unit.districts.push(district);
    }
    var relativeFile = String(entry.path).replace(/^data\//, '');
    if (!district.docs.some(function (doc) { return doc.file === relativeFile && doc.batch === (entry.batch || '管理员导入'); })) {
      district.docs.push({batch: entry.batch || '管理员导入', file: relativeFile});
    }
    appliedAssociations[key] = true;
  }

  function expandEntry(entry) {
    var router = window.SoilQualityFileRouting;
    if (router && typeof router.expandRecord === 'function') return router.expandRecord(entry);
    return [entry];
  }

  function refreshDashboard() {
    if (typeof window.refreshAllTabs === 'function') window.refreshAllTabs();
    var key = activeKey();
    if (key === 'references') {
      hideCollectionBanner();
      return;
    }
    if (typeof window.renderMissingBanner === 'function' && TYPES[key]) window.renderMissingBanner(key);
  }

  window.applyAdminQualityIndex = function (entries) {
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      expandEntry(entry).forEach(mergeQualityEntry);
    });
    refreshDashboard();
  };

  window.removeAdminQualityPaths = function (paths) {
    var removed = {};
    (Array.isArray(paths) ? paths : []).forEach(function (path) {
      path = String(path || '');
      removed[path.replace(/^data\//, '')] = true;
      Object.keys(appliedAssociations).forEach(function (key) {
        if (key.indexOf(path + '|') === 0) delete appliedAssociations[key];
      });
    });
    Object.keys(window.tabData || {}).forEach(function (key) {
      (window.tabData[key] || []).forEach(function (city) {
        (city.units || []).forEach(function (unit) {
          (unit.districts || []).forEach(function (district) {
            district.docs = (district.docs || []).filter(function (doc) { return !removed[doc.file]; });
          });
        });
      });
    });
    refreshDashboard();
  };

  function loadAdminIndex() {
    fetch('./data/admin-import-index.json?_=' + Date.now(), {cache: 'no-store'})
      .then(function (response) { return response.ok ? response.json() : []; })
      .then(function (entries) { window.applyAdminQualityIndex(entries); })
      .catch(function (error) { console.error('管理员导入索引加载失败', error); });
  }

  function bindExistingTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      if (tab.dataset.dashboardStatsBound) return;
      tab.dataset.dashboardStatsBound = '1';
      tab.addEventListener('click', function () {
        var key = tab.dataset.tab;
        if (key === 'references') {
          setTimeout(hideCollectionBanner, 0);
          return;
        }
        if (TYPES[key]) setTimeout(function () { decorateBanner(key); }, 0);
      });
    });
  }

  function install() {
    if (!window.tabData || !window.masterList) return;
    addStyles();
    ensureTabs();
    wrapImportedQualityLinks();
    wrapMissingBanner();
    bindExistingTabs();
    refreshDashboard();
    loadAdminIndex();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
