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

  function loadReleaseStagedUpload() {
    var NativeMutationObserver = window.MutationObserver;
    var used = false;

    if (typeof NativeMutationObserver !== 'function') {
      return loadScript('./release-staged-upload.js?v=20260726-2');
    }

    function OneShotMutationObserver(callback) {
      if (used) return new NativeMutationObserver(callback);
      used = true;
      return new NativeMutationObserver(function (records, observer) {
        observer.disconnect();
        callback(records, observer);
      });
    }

    OneShotMutationObserver.prototype = NativeMutationObserver.prototype;
    window.MutationObserver = OneShotMutationObserver;

    return loadScript('./release-staged-upload.js?v=20260726-2').finally(function () {
      window.MutationObserver = NativeMutationObserver;
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
    .then(loadReleaseStagedUpload)
    .catch(function (error) { console.error(error); });
})();
