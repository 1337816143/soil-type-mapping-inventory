(function () {
  'use strict';

  var key = 'soilGithubUploadTokenV2';
  var token = String(window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN || '').trim();
  if (!token) return;

  // 以仓库内配置的默认 Token 为准，覆盖此前浏览器中可能残留的空值或旧值。
  window.SOIL_GITHUB_UPLOAD_TOKEN = token;
  try {
    sessionStorage.setItem(key, token);
    localStorage.setItem(key, token);
  } catch (error) {}
})();
