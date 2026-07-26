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
    .then(function () { return loadScript('./dashboard-extension.js'); })
    .then(function () { return loadScript('./reference-library.js'); })
    .then(function () { return loadScript('./admin-quality-ui.js'); })
    .then(function () { return loadScript('./admin-quality-upload.js'); })
    .then(function () { return loadScript('./admin-import-v2.js'); })
    .then(function () { return loadScript('./admin-import-v2-bridge.js'); })
    .then(function () { return loadScript('./reference-import-mode.js'); })
    .then(function () { return loadScript('./upload-auth-reply-batch.js'); })
    .then(function () { return loadScript('./upload-token-default.js'); })
    .then(function () { return loadScript('./pptx-auto-split.js'); })
    .catch(function (error) { console.error(error); });
})();
