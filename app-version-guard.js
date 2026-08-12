(function () {
  'use strict';

  var VERSION = String(window.SOIL_RELEASE_VERSION || 'v1.0.13');
  window.SOIL_APP_VERSION = VERSION;
  document.documentElement.setAttribute('data-app-version', VERSION);

  document.querySelectorAll('.app-version-badge').forEach(function (node) {
    if (node.textContent !== VERSION) node.textContent = VERSION;
    node.title = '当前项目版本 ' + VERSION;
  });

  document.querySelectorAll('.app-version-footer').forEach(function (node) {
    var text = '版本 ' + VERSION;
    if (node.textContent !== text) node.textContent = text;
  });
})();
