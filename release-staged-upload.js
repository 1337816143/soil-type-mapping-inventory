(function () {
  'use strict';
  if (window.__soilChunkedStagedUploadInstalled) return;
  var existing = document.querySelector('script[data-soil-chunked-upload]');
  if (existing) return;
  var script = document.createElement('script');
  script.src = './chunked-staged-upload.js?v=20260727-2';
  script.dataset.soilChunkedUpload = '1';
  script.onerror = function () {
    console.error(new Error('分块上传脚本加载失败。'));
  };
  document.head.appendChild(script);
})();
