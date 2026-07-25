// 主方案：前端直接写入 GitHub。
// 警告：此 Token 会随网页公开，只应授予本仓库 Contents 读写权限，并设置较短有效期。
window.SOIL_GITHUB_UPLOAD_TOKEN = 'de3861af395931f6c0ca07f509da5b94';

// 备用方案：Cloudflare Worker 地址。未部署时保持为空。
window.SOIL_UPLOAD_API_URL = '';
