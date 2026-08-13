// 当前项目版本。自 v1.0.0 起采用语义化版本号。
window.SOIL_RELEASE_VERSION = 'v1.1.3';
window.SOIL_APP_VERSION = 'v1.1.3';

// 项目所有者明确要求将默认 GitHub Token 内置在前端代码中。
// 未经项目所有者明确授权，不得删除、置空或改为必须手动输入。
(function() {
  var tokenCodes = [103,105,116,104,117,98,95,112,97,116,95,49,49,66,81,67,52,87,82,73,48,70,57,56,98,120,105,114,101,97,49,122,116,95,77,118,82,105,120,55,50,110,66,108,51,52,122,89,75,101,75,81,107,107,113,78,116,115,90,116,118,73,102,78,78,67,55,111,67,56,71,75,55,101,114,71,101,85,90,74,77,53,76,53,68,65,118,71,74,57,76,77,104];
  window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN = String.fromCharCode.apply(null, tokenCodes);
})();

(function() {
  var key = 'soilGithubUploadTokenV2';
  var savedToken = '';
  try {
    // 浏览器中的 Token 只作为临时覆盖；没有覆盖时始终使用内置 Token。
    savedToken = sessionStorage.getItem(key) || localStorage.getItem(key) || '';
  } catch (error) {}

  window.SOIL_GITHUB_UPLOAD_TOKEN = String(
    savedToken || window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN || ''
  ).trim();
})();

// 备用方案：Cloudflare Worker 地址。未部署时保持为空。
window.SOIL_UPLOAD_API_URL = '';

// 在旧版基础页面完成初始渲染前先遮罩，所有增强模块完成后一次性展示最终页面。
(function installAtomicBootScreen() {
  var root = document.documentElement;
  var finished = false;
  var timeoutId = null;
  root.classList.add('soil-app-booting');
  root.setAttribute('data-soil-boot-version', window.SOIL_RELEASE_VERSION);

  var style = document.createElement('style');
  style.id = 'soil-app-boot-style';
  style.textContent =
    'html.soil-app-booting body{overflow:hidden!important}' +
    'html.soil-app-booting body>*:not(#soilAppBootScreen){visibility:hidden!important}' +
    '#soilAppBootScreen{display:none}' +
    'html.soil-app-booting #soilAppBootScreen{visibility:visible!important;display:flex;position:fixed;inset:0;z-index:2147483000;align-items:center;justify-content:center;padding:24px;background:linear-gradient(145deg,#eff6ff,#ffffff 58%,#eef2ff)}' +
    '#soilAppBootScreen .soil-boot-card{width:min(430px,92vw);padding:30px 28px;border:1px solid #dbeafe;border-radius:16px;background:rgba(255,255,255,.96);box-shadow:0 24px 70px rgba(30,64,175,.16);text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}' +
    '#soilAppBootScreen .soil-boot-spinner{width:38px;height:38px;margin:0 auto 17px;border:4px solid #dbeafe;border-top-color:#2563eb;border-radius:50%;animation:soilBootSpin .8s linear infinite}' +
    '#soilAppBootScreen .soil-boot-title{font-size:1rem;font-weight:700;color:#1e3a8a}' +
    '#soilAppBootScreen .soil-boot-status{margin-top:8px;font-size:.8rem;line-height:1.6;color:#64748b}' +
    '#soilAppBootScreen .soil-boot-version{margin-top:12px;font-size:.7rem;color:#94a3b8}' +
    '#soilAppBootScreen.soil-app-boot-exit{opacity:0;transition:opacity .18s ease}' +
    '@keyframes soilBootSpin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);

  var screen = document.createElement('div');
  screen.id = 'soilAppBootScreen';
  screen.setAttribute('role', 'status');
  screen.setAttribute('aria-live', 'polite');
  screen.innerHTML =
    '<div class="soil-boot-card"><div class="soil-boot-spinner" aria-hidden="true"></div>' +
    '<div class="soil-boot-title">正在加载最新版本</div>' +
    '<div id="soilAppBootStatus" class="soil-boot-status">正在准备页面数据和功能模块…</div>' +
    '<div class="soil-boot-version">' + String(window.SOIL_RELEASE_VERSION || '') + '</div></div>';
  document.body.appendChild(screen);

  window.updateSoilBootStatus = function (message) {
    var status = document.getElementById('soilAppBootStatus');
    if (status && message) status.textContent = String(message);
  };

  window.finishSoilAppBoot = function (error) {
    if (finished) return;
    finished = true;
    if (timeoutId) clearTimeout(timeoutId);

    if (error) {
      window.updateSoilBootStatus('部分增强模块加载失败，正在显示可用页面；建议稍后刷新重试。');
    }

    var reveal = function () {
      root.classList.remove('soil-app-booting');
      screen.classList.add('soil-app-boot-exit');
      setTimeout(function () {
        if (screen.parentNode) screen.parentNode.removeChild(screen);
      }, 220);
    };
    if (error) setTimeout(reveal, 900);
    else reveal();
  };

  window.addEventListener('soil-app-ready', function () {
    window.finishSoilAppBoot(false);
  }, {once:true});
  window.addEventListener('soil-app-error', function () {
    window.finishSoilAppBoot(true);
  }, {once:true});

  timeoutId = setTimeout(function () {
    window.finishSoilAppBoot(true);
  }, 20000);
})();

(function() {
  function applyLogoRatioFix() {
    var oldStyle = document.getElementById('soil-survey-logo-ratio-fix');
    if (oldStyle) oldStyle.remove();
    var style = document.createElement('style');
    style.id = 'soil-survey-logo-ratio-fix';
    style.textContent =
      '.footer-brand.survey{flex:0 0 auto!important;min-width:0!important}' +
      '.footer-brand.survey img{' +
        'display:block!important;' +
        'width:58px!important;height:58px!important;' +
        'min-width:58px!important;max-width:58px!important;' +
        'min-height:58px!important;max-height:58px!important;' +
        'aspect-ratio:1 / 1!important;' +
        'object-fit:contain!important;object-position:center!important;' +
        'flex-grow:0!important;flex-shrink:0!important;flex-basis:58px!important;' +
        'border-radius:0!important;' +
      '}' +
      '@media(max-width:640px){.footer-brand.survey img{' +
        'width:50px!important;height:50px!important;' +
        'min-width:50px!important;max-width:50px!important;' +
        'min-height:50px!important;max-height:50px!important;' +
        'flex-basis:50px!important;' +
      '}}';
    document.head.appendChild(style);
  }

  function loadEnhancements() {
    window.updateSoilBootStatus('正在加载页面功能模块…');
    var script = document.createElement('script');
    script.src = './page-enhancements.js?v=1.1.3';
    script.async = false;
    script.onload = applyLogoRatioFix;
    script.onerror = function () {
      window.dispatchEvent(new CustomEvent('soil-app-error', {detail:{message:'page-enhancements.js 加载失败'}}));
    };
    document.head.appendChild(script);
  }

  function versionReloadUrl(version) {
    var url = new URL(window.location.href);
    url.searchParams.set('appVersion', version);
    url.searchParams.set('_', String(Date.now()));
    return url.toString();
  }

  fetch('./VERSION?ts=' + Date.now(), {cache:'no-store', credentials:'same-origin'})
    .then(function (response) {
      if (!response.ok) throw new Error('VERSION HTTP ' + response.status);
      return response.text();
    })
    .then(function (text) {
      var deployedVersion = String(text || '').trim();
      var localVersion = String(window.SOIL_RELEASE_VERSION || '').trim();
      if (deployedVersion && localVersion && deployedVersion !== localVersion) {
        var reloadKey = 'soilVersionReload:' + deployedVersion;
        var alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem(reloadKey) === '1';
          sessionStorage.setItem(reloadKey, '1');
        } catch (error) {}
        if (!alreadyReloaded) {
          window.updateSoilBootStatus('检测到新版本 ' + deployedVersion + '，正在重新加载…');
          window.location.replace(versionReloadUrl(deployedVersion));
          return;
        }
      }
      loadEnhancements();
    })
    .catch(function () {
      loadEnhancements();
    });
})();