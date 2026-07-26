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
    .then(function () { return loadScript('./reference-library.js'); })
    .catch(function (error) { console.error(error); });
})();
