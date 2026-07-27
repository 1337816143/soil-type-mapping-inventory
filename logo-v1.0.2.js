(function () {
  'use strict';

  var LOGO_DATA = 'data:image/png;base64,PLACEHOLDER';

  function installStyle() {
    if (document.getElementById('soil-survey-logo-v102-style')) return;
    var style = document.createElement('style');
    style.id = 'soil-survey-logo-v102-style';
    style.textContent =
      '.page-title-logo-frame{width:62px!important;height:62px!important;min-width:62px!important;flex-basis:62px!important;overflow:visible!important;border-radius:50%!important;background:transparent!important;box-shadow:none!important}' +
      '.page-title-logo-frame .page-title-logo{width:60px!important;height:60px!important;min-width:60px!important;max-width:60px!important;flex-basis:60px!important;object-fit:contain!important;transform:none!important}' +
      '@media(max-width:760px){.page-title-logo-frame{width:50px!important;height:50px!important;min-width:50px!important;flex-basis:50px!important}.page-title-logo-frame .page-title-logo{width:48px!important;height:48px!important;min-width:48px!important;max-width:48px!important;flex-basis:48px!important}}';
    document.head.appendChild(style);
  }

  function applyLogo() {
    document.querySelectorAll('.page-title-logo,.footer-brand.survey img').forEach(function (image) {
      if (image.getAttribute('src') !== LOGO_DATA) image.setAttribute('src', LOGO_DATA);
      image.alt = '第三次全国土壤普查';
    });
  }

  function install() {
    installStyle();
    applyLogo();
    var observer = new MutationObserver(function () { applyLogo(); });
    observer.observe(document.documentElement, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
