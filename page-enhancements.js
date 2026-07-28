(function () {
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('脚本加载失败：' + src)); };
      document.head.appendChild(script);
    });
  }

  function whenDomReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', resolve, {once:true});
    });
  }

  function loadLogoWithoutObserverLoop() {
    return whenDomReady().then(function () {
      // v1.0.2 Logo 脚本会在全页面 MutationObserver 回调中无条件改写版本文字，
      // 文字改写又产生新的 childList 事件，形成无限微任务循环并导致页面“未响应”。
      // Logo 只需在页首和页脚生成后执行一次，因此加载它时临时禁用该观察器。
      var NativeMutationObserver = window.MutationObserver;
      function OneShotObserver() {}
      OneShotObserver.prototype.observe = function () {};
      OneShotObserver.prototype.disconnect = function () {};
      OneShotObserver.prototype.takeRecords = function () { return []; };

      window.MutationObserver = OneShotObserver;
      return loadScript('./soil-survey-logo-v1.0.2.js?v=1.0.2&runtime-fix=20260728-1')
        .then(function () {
          window.MutationObserver = NativeMutationObserver;
        }, function (error) {
          window.MutationObserver = NativeMutationObserver;
          throw error;
        });
    });
  }

  loadScript('./page-enhancements-core.js')
    .then(function () { return loadScript('./task-unit-mappings.js?v=20260727-2'); })
    .then(function () { return loadScript('./regional-progress-dashboard.js?v=20260727-6'); })
    .then(function () { return loadScript('./dashboard-extension.js?v=20260727-4'); })
    .then(function () { return loadScript('./reference-library.js?v=20260727-4'); })
    .then(function () { return loadScript('./app-release-ui.js?v=1.0.2'); })
    .then(loadLogoWithoutObserverLoop)
    .then(function () { return loadScript('./admin-quality-ui.js'); })
    .then(function () { return loadScript('./admin-quality-upload.js'); })
    .then(function () { return loadScript('./admin-import-v2.js'); })
    .then(function () { return loadScript('./admin-import-v2-bridge.js'); })
    .then(function () { return loadScript('./reference-import-mode.js'); })
    // 先执行会话凭证迁移、安全加固和可访问性增强，再加载上传鉴权逻辑。
    .then(function () { return loadScript('./upload-token-default.js?v=20260728-1'); })
    .then(function () { return loadScript('./upload-auth-reply-batch.js'); })
    .then(function () { return loadScript('./admin-delete-manager.js?v=1.0.2'); })
    .then(function () { return loadScript('./pptx-auto-split.js'); })
    .then(function () { return loadScript('./hybrid-staged-upload.js?v=20260727-1'); })
    .catch(function (error) { console.error(error); });
})();
