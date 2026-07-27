(function () {
  'use strict';

  if (window.__soilSurveyLogoV102Installed) return;
  window.__soilSurveyLogoV102Installed = true;

  var VERSION = 'v1.0.2';
  var PARTS = [
    './scripts/logo-v1.0.2.part0?v=1.0.2',
    './scripts/logo-v1.0.2.part1?v=1.0.2'
  ];
  var logoData = '';

  function installStyle() {
    if (document.getElementById('soil-survey-logo-v102-style')) return;
    var style = document.createElement('style');
    style.id = 'soil-survey-logo-v102-style';
    style.textContent =
      '.page-title-logo-frame{display:inline-flex!important;width:62px!important;height:62px!important;min-width:62px!important;flex:0 0 62px!important;align-items:center!important;justify-content:center!important;overflow:visible!important;border-radius:50%!important;background:transparent!important;box-shadow:none!important}' +
      '.page-title-logo-frame .page-title-logo{display:block!important;width:60px!important;height:60px!important;min-width:60px!important;max-width:60px!important;flex:0 0 60px!important;object-fit:contain!important;transform:none!important}' +
      '@media(max-width:760px){.page-title-logo-frame{width:50px!important;height:50px!important;min-width:50px!important;flex-basis:50px!important}.page-title-logo-frame .page-title-logo{width:48px!important;height:48px!important;min-width:48px!important;max-width:48px!important;flex-basis:48px!important}}';
    document.head.appendChild(style);
  }

  function applyVersion() {
    window.SOIL_APP_VERSION = VERSION;
    document.documentElement.setAttribute('data-app-version', VERSION);
    document.querySelectorAll('.app-version-badge').forEach(function (node) {
      node.textContent = VERSION;
      node.title = '当前项目版本 ' + VERSION;
    });
    document.querySelectorAll('.app-version-footer').forEach(function (node) {
      node.textContent = '版本 ' + VERSION;
    });
  }

  function applyLogo() {
    if (!logoData) return;
    document.querySelectorAll('.page-title-logo,.footer-brand.survey img').forEach(function (image) {
      if (image.getAttribute('src') !== logoData) image.setAttribute('src', logoData);
      image.alt = '第三次全国土壤普查';
    });
  }

  function refresh() {
    applyVersion();
    applyLogo();
  }

  function loadLogo() {
    return Promise.all(PARTS.map(function (path) {
      return fetch(path, {cache:'no-store'}).then(function (response) {
        if (!response.ok) throw new Error('三普Logo资源读取失败：HTTP ' + response.status);
        return response.text();
      });
    })).then(function (parts) {
      var base64 = parts.join('').replace(/\s+/g, '');
      if (base64.indexOf('iVBORw0KGgo') !== 0) throw new Error('三普Logo资源格式无效');
      logoData = 'data:image/png;base64,' + base64;
      refresh();
    });
  }

  function install() {
    installStyle();
    applyVersion();
    loadLogo().catch(function (error) { console.error(error); });
    var observer = new MutationObserver(function () { refresh(); });
    observer.observe(document.documentElement, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
