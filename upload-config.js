// 当前项目版本。自 v1.0.0 起采用语义化版本号。
window.SOIL_APP_VERSION = 'v1.0.2';

// 上传凭证安全策略：公开仓库不再内置任何 GitHub Token。
// 管理员在页面中设置的 Fine-grained PAT 仅保存在当前浏览器会话的 sessionStorage 中。
(function() {
  var key = 'soilGithubUploadTokenV2';
  var savedToken = '';
  try {
    savedToken = sessionStorage.getItem(key) || '';
    // 清理旧版本可能写入的长期存储，避免凭证跨会话残留。
    localStorage.removeItem(key);
  } catch (error) {}

  window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN = '';
  window.SOIL_GITHUB_UPLOAD_TOKEN = String(savedToken || '').trim();
})();

// 备用方案：Cloudflare Worker 地址。未部署时保持为空。
window.SOIL_UPLOAD_API_URL = '';

// 页面展示与统计增强采用独立文件，便于维护并避免两套逻辑重复执行。
(function() {
  var script = document.createElement('script');
  // runtime 参数用于强制浏览器获取“页面未响应”修复后的加载器，避免继续命中旧缓存。
  script.src = './page-enhancements.js?v=20260727-13&security=20260728-1&runtime=20260728-1';
  script.async = false;

  // 等页面增强样式加载完成后再覆盖，确保三普 Logo 不被 Flex 布局压扁或拉长。
  script.onload = function() {
    var oldStyle = document.getElementById('soil-survey-logo-ratio-fix');
    if (oldStyle) oldStyle.remove();

    var style = document.createElement('style');
    style.id = 'soil-survey-logo-ratio-fix';
    style.textContent =
      '.footer-brand.survey{flex:0 0 auto!important;min-width:0!important}' +
      '.footer-brand.survey img{' +
        'display:block!important;' +
        'width:58px!important;height:58px!important;' +
        'min-width:58px!important;max-width:58px!important;' +
        'min-height:58px!important;max-height:58px!important;' +
        'aspect-ratio:1 / 1!important;' +
        'object-fit:contain!important;object-position:center!important;' +
        'flex-grow:0!important;flex-shrink:0!important;flex-basis:58px!important;' +
        'border-radius:0!important;' +
      '}' +
      '@media(max-width:640px){.footer-brand.survey img{' +
        'width:50px!important;height:50px!important;' +
        'min-width:50px!important;max-width:50px!important;' +
        'min-height:50px!important;max-height:50px!important;' +
        'flex-basis:50px!important;' +
      '}}';
    document.head.appendChild(style);
  };

  document.head.appendChild(script);
})();
