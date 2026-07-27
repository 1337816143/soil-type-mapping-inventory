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

  loadScript('./page-enhancements-core.js')
    .then(function () { return loadScript('./task-unit-mappings.js?v=20260727-2'); })
    .then(function () { return loadScript('./regional-progress-dashboard.js?v=20260727-6'); })
    .then(function () { return loadScript('./dashboard-extension.js?v=20260727-4'); })
    .then(function () { return loadScript('./reference-library.js?v=20260727-4'); })
    .then(function () { return loadScript('./app-release-ui.js?v=1.0.2'); })
    .then(function () { return loadScript('./soil-survey-logo-v1.0.2.js?v=1.0.2'); })
    .then(function () { return loadScript('./admin-quality-ui.js'); })
    .then(function () { return loadScript('./admin-quality-upload.js'); })
    .then(function () { return loadScript('./admin-import-v2.js'); })
    .then(function () { return loadScript('./admin-import-v2-bridge.js'); })
    .then(function () { return loadScript('./reference-import-mode.js'); })
    .then(function () { return loadScript('./upload-auth-reply-batch.js'); })
    .then(function () { return loadScript('./admin-delete-manager.js?v=1.0.2'); })
    .then(function () { return loadScript('./upload-token-default.js'); })
    .then(function () { return loadScript('./pptx-auto-split.js'); })
    .then(function () { return loadScript('./hybrid-staged-upload.js?v=20260727-1'); })
    .catch(function (error) { console.error(error); });
})();
