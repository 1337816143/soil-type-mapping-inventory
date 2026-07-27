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
    if (typeof NativeMutationObserver !== 'function') {
      return loadScript('./release-staged-upload.js?v=20260727-1');
    }

    var restored = false;
    var restoreTimer = null;

    function restore() {
      if (restored) return;
      restored = true;
      if (window.MutationObserver === ReleaseObserverGuard) {
        window.MutationObserver = NativeMutationObserver;
      }
      if (restoreTimer) clearTimeout(restoreTimer);
    }

    function ReleaseObserverGuard(callback) {
      var source = '';
      try { source = Function.prototype.toString.call(callback); } catch (error) {}
      var isReleaseTipObserver =
        (callback && callback.name === 'updateModeTip') ||
        (source.indexOf('adm-tip') >= 0 && source.indexOf('开始上传') >= 0);

      if (!isReleaseTipObserver) return new NativeMutationObserver(callback);

      var observer = new NativeMutationObserver(function (records, currentObserver) {
        currentObserver.disconnect();
        callback(records, currentObserver);
      });
      restore();
      return observer;
    }

    ReleaseObserverGuard.prototype = NativeMutationObserver.prototype;
    window.MutationObserver = ReleaseObserverGuard;
    restoreTimer = setTimeout(restore, 30000);

    return loadScript('./release-staged-upload.js?v=20260727-1').catch(function (error) {
      restore();
      throw error;
    }).then(function () {
      // 页面已经就绪时，脚本会同步创建观察器，此时可以立即恢复。
      // 页面仍在加载时保留守卫，直到 DOMContentLoaded 中真正创建该观察器。
      if (document.readyState !== 'loading') setTimeout(restore, 0);
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
    .then(function () { return loadScript('./release-upload-reliability.js?v=20260727-1'); })
    .then(loadReleaseStagedUpload)
    .catch(function (error) { console.error(error); });
})();
