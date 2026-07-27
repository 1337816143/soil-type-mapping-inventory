(function () {
  'use strict';

  var VERSION = 'v1.0.0';
  window.SOIL_APP_VERSION = VERSION;
  document.documentElement.setAttribute('data-app-version', VERSION);

  function installStyles() {
    if (document.getElementById('app-release-ui-style')) return;
    var style = document.createElement('style');
    style.id = 'app-release-ui-style';
    style.textContent =
      'header h1.page-title-with-logo{display:flex!important;align-items:center!important;gap:10px!important;flex-wrap:wrap}' +
      '.page-title-logo-frame{display:inline-flex;width:58px;height:58px;min-width:58px;flex:0 0 58px;align-items:center;justify-content:center;overflow:hidden;border-radius:10px;background:transparent;box-shadow:0 0 0 1px rgba(255,255,255,.18)}' +
      '.page-title-logo-frame .page-title-logo{display:block!important;width:74px!important;height:74px!important;min-width:74px!important;max-width:none!important;flex:0 0 74px!important;object-fit:contain!important;transform:scale(1.08);transform-origin:center}' +
      '.app-version-badge{display:inline-flex;align-items:center;justify-content:center;padding:2px 7px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font-size:.67rem;font-weight:650;letter-spacing:.02em;line-height:1.4;white-space:nowrap}' +
      '.app-version-footer{margin-top:7px;color:var(--muted);font-size:.69rem;letter-spacing:.02em}' +
      '@media(max-width:760px){.page-title-logo-frame{width:46px;height:46px;min-width:46px;flex-basis:46px;border-radius:8px}.page-title-logo-frame .page-title-logo{width:59px!important;height:59px!important;min-width:59px!important;flex-basis:59px!important}.app-version-badge{font-size:.62rem;padding:1px 6px}}';
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

  function install() {
    installStyles();
    enhanceHeaderLogo();
    enhanceFooterVersion();
    enforceCollapsedReferenceDefaults();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
