(function () {
  'use strict';

  var VERSION = 'v1.0.10';
  window.SOIL_APP_VERSION = VERSION;
  document.documentElement.setAttribute('data-app-version', VERSION);

  function installStyles() {
    if (document.getElementById('app-release-ui-style')) return;
    var style = document.createElement('style');
    style.id = 'app-release-ui-style';
    style.textContent =
      'header h1.page-title-with-logo{display:flex!important;align-items:center!important;gap:10px!important;flex-wrap:wrap}' +
      '.page-title-logo-frame{display:inline-flex;width:62px;height:62px;min-width:62px;flex:0 0 62px;align-items:center;justify-content:center;overflow:visible;border-radius:50%;background:transparent;box-shadow:none}' +
      '.page-title-logo-frame .page-title-logo{display:block!important;width:60px!important;height:60px!important;min-width:60px!important;max-width:60px!important;flex:0 0 60px!important;object-fit:contain!important;transform:none!important;transform-origin:center}' +
      '.app-version-badge{display:inline-flex;align-items:center;justify-content:center;padding:2px 7px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font-size:.67rem;font-weight:650;letter-spacing:.02em;line-height:1.4;white-space:nowrap}' +
      '.app-version-footer{margin-top:7px;color:var(--muted);font-size:.69rem;letter-spacing:.02em}' +
      '@media(max-width:760px){.page-title-logo-frame{width:50px;height:50px;min-width:50px;flex-basis:50px;border-radius:50%}.page-title-logo-frame .page-title-logo{width:48px!important;height:48px!important;min-width:48px!important;max-width:48px!important;flex-basis:48px!important}.app-version-badge{font-size:.62rem;padding:1px 6px}}';
    document.head.appendChild(style);
  }

  function enhanceHeaderLogo() {
    var title = document.querySelector('header h1');
    if (!title) return;
    var logo = title.querySelector('.page-title-logo');
    if (logo && !logo.closest('.page-title-logo-frame')) {
      var frame = document.createElement('span');
      frame.className = 'page-title-logo-frame';
      frame.setAttribute('aria-hidden', 'true');
      logo.parentNode.insertBefore(frame, logo);
      frame.appendChild(logo);
    }
    if (!title.querySelector('.app-version-badge')) {
      var badge = document.createElement('span');
      badge.className = 'app-version-badge';
      badge.textContent = VERSION;
      badge.title = '当前项目版本 ' + VERSION;
      title.appendChild(badge);
    }
  }

  function enhanceFooterVersion() {
    var footer = document.querySelector('footer .container');
    if (!footer || footer.querySelector('.app-version-footer')) return;
    var version = document.createElement('div');
    version.className = 'app-version-footer';
    version.textContent = '版本 ' + VERSION;
    footer.appendChild(version);
  }

  function closeReferenceGroups(root) {
    if (!root) return;
    root.querySelectorAll('details.ref-cat').forEach(function (group) {
      group.open = false;
    });
  }

  function enforceCollapsedReferenceDefaults() {
    var root = document.getElementById('ref-root');
    if (!root || root.__referenceCollapseObserver) return;
    closeReferenceGroups(root);
    var observer = new MutationObserver(function (mutations) {
      var rendered = mutations.some(function (mutation) {
        return mutation.type === 'childList' && mutation.addedNodes.length;
      });
      if (rendered) setTimeout(function () { closeReferenceGroups(root); }, 0);
    });
    observer.observe(root, {childList:true});
    root.__referenceCollapseObserver = observer;
  }

  function deduplicatedUnitCount(city) {
    var unique = new Set();
    var helper = window.SoilRegionalProgress && window.SoilRegionalProgress.unitKeys;
    (city && city.units || []).forEach(function (unit) {
      var name = unit && (unit.name || unit.unit) || '';
      var keys = helper ? helper(name) : [String(name).replace(/\s+/g, '')];
      keys.filter(Boolean).forEach(function (key) { unique.add(key); });
    });
    return unique.size;
  }

  function patchCityUnitBadges() {
    if (typeof window.renderCities !== 'function' || window.renderCities.__unitDeduplicated) return;
    var original = window.renderCities;
    window.renderCities = function (cities) {
      var html = original.apply(this, arguments);
      var holder = document.createElement('div');
      holder.innerHTML = html;
      var sections = holder.querySelectorAll('.city-section');
      (cities || []).forEach(function (city, index) {
        var badge = sections[index] && sections[index].querySelector('h2 .badge');
        if (!badge) return;
        var count = deduplicatedUnitCount(city);
        badge.textContent = badge.textContent.replace(/^\s*\d+\s*家单位(?:（去重）)?/, count + ' 家单位（去重）');
      });
      return holder.innerHTML;
    };
    window.renderCities.__unitDeduplicated = true;
  }

  function refreshAfterPatches() {
    setTimeout(function () {
      if (window.SoilRegionalProgress && typeof window.SoilRegionalProgress.refresh === 'function') {
        window.SoilRegionalProgress.refresh();
      } else if (typeof window.refreshAllTabs === 'function') {
        window.refreshAllTabs();
      }
    }, 0);
  }

  function install() {
    installStyles();
    enhanceHeaderLogo();
    enhanceFooterVersion();
    enforceCollapsedReferenceDefaults();
    patchCityUnitBadges();
    refreshAfterPatches();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();