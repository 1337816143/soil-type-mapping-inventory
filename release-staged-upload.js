(function () {
  'use strict';
  if (window.__soilHybridStagedUploadInstalled) return;
  var existing = document.querySelector('script[data-soil-hybrid-upload]');
  if (existing) return;
  var script = document.createElement('script');
  script.src = './hybrid-staged-upload.js?v=20260727-1';
  script.dataset.soilHybridUpload = '1';
  script.onerror = function () {
    console.error(new Error('混合上传脚本加载失败。'));
  };
  document.head.appendChild(script);
})();
