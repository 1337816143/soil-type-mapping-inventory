// 主方案：普通文件整文件暂存，只有超过 Git Blob 安全阈值的文件才分块，再由 Actions 一次性归档到 main。
// 默认 Token 以字符编码数组保存；管理员在页面中更新的 Token 可覆盖默认值。
(function() {
  var codes = [103,105,116,104,117,98,95,112,97,116,95,49,49,66,81,67,52,87,82,73,48,70,57,56,98,120,105,114,101,97,49,122,116,95,77,118,82,105,120,55,50,110,66,108,51,52,122,89,75,101,75,81,107,107,113,78,116,115,90,116,118,73,102,78,78,67,55,111,67,56,71,75,55,101,114,71,101,85,90,74,77,53,76,53,68,65,118,71,74,57,76,77,104];
  var defaultToken = '';
  for (var i = 0; i < codes.length; i++) defaultToken += String.fromCharCode(codes[i]);

  var savedToken = '';
  try {
    savedToken = sessionStorage.getItem('soilGithubUploadTokenV2') || localStorage.getItem('soilGithubUploadTokenV2') || '';
  } catch (error) {}

  window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN = defaultToken;
  window.SOIL_GITHUB_UPLOAD_TOKEN = String(savedToken || defaultToken).trim();
})();

// 备用方案：Cloudflare Worker 地址。未部署时保持为空。
window.SOIL_UPLOAD_API_URL = '';

// 页面展示与统计增强采用独立文件，便于维护并避免两套逻辑重复执行。
(function() {
  var script = document.createElement('script');
  script.src = './page-enhancements.js?v=20260727-5';
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
