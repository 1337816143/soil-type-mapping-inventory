'use strict';
const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('admin-upload-transport-fix.js', 'utf8');
const notice = fs.readFileSync('upload-success-notice.js', 'utf8');
const hybrid = fs.readFileSync('hybrid-staged-upload.js', 'utf8');
const auth = fs.readFileSync('upload-auth-reply-batch.js', 'utf8');
const tokenDefault = fs.readFileSync('upload-token-default.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');
const config = fs.readFileSync('upload-config.js', 'utf8');
const maintenance = fs.readFileSync('MAINTENANCE_RULES.md', 'utf8');
const referenceMode = fs.readFileSync('reference-import-mode.js', 'utf8');
const version = fs.readFileSync('VERSION', 'utf8').trim().slice(1);

assert(source.includes('function normalizeStage(text)'), '管理员上传状态缺少统一格式化');
assert(source.includes('function renderUploadStatus()'), '管理员上传状态缺少原位渲染');
assert(source.includes("'\\n上传进度：'"), '管理员上传状态未显示当前百分比');
assert(source.includes('tracked.stage'), '管理员上传状态未分离固定阶段与动态数值');
assert(source.includes('tracked.percent'), '管理员上传状态未维护单一当前进度');
assert(source.includes('q.__soilAdminStatusInPlaceInstalled'), '管理员进度包装未使用对象级一次性标记');
assert(notice.includes('admin.__successNoticeProgressPatched'), '成功提示包装未使用对象级一次性标记');
assert(source.includes("if (button.dataset.authReady === '1') delete button.dataset.authReady;"), '管理员上传未恢复统一凭证校验入口');
assert(!source.includes("button.dataset.authReady = '1';"), '管理员上传状态脚本仍永久绕过凭证校验');
assert(auth.includes("document.addEventListener('click', interceptAdminImport, true)"), '管理员导入统一凭证校验拦截器缺失');
assert(auth.includes("button.dataset.authReady = '1';"), '凭证校验完成后的单次递归放行逻辑缺失');
assert(source.includes('不再把 authReady 永久置为 1'), '管理员上传状态脚本未记录凭证校验恢复策略');
assert(!source.includes('window.fetch = function'), '管理员上传仍在全局替换 fetch');
assert(!source.includes('new XMLHttpRequest()'), '管理员 Git Blob 上传仍被 XHR 接管');
assert(!source.includes("tracked.text + '\\n'"), '管理员上传状态仍会递归累加旧文本');
assert(!source.includes('new MutationObserver(armAdminUpload)'), '管理员状态脚本仍长期监听全页面文本变化');
assert(!source.includes('正在传输：'), '管理员上传状态仍输出逐条传输日志');

assert(hybrid.includes("'Authorization': 'Bearer ' + token()"), '原始 Git Data API Bearer 鉴权链路被改变');
assert(hybrid.includes('return fetch(API_ROOT + path'), '原始 Git Data API fetch 上传链路被改变');
assert(hybrid.includes("return api('/git/blobs'"), '原始 Git Blob 创建接口被改变');
assert(hybrid.includes('正在整文件上传'), '39 MiB 整文件上传策略被删除');
assert(hybrid.includes('39 MiB 分块'), '超限文件分块策略被删除');

assert(referenceMode.includes('function isReferenceContext()'), '参考资料显式导入上下文保护缺失');
assert(referenceMode.includes("Q.state.context.kind === 'reference'"), '参考资料入口未锁定 reference 上下文');
assert(referenceMode.includes('function ensureReferenceMode('), '参考资料导入类型恢复逻辑缺失');
assert(referenceMode.includes("closest('#adm-ok')"), '点击上传前未再次保护参考资料导入类型');
assert(!referenceMode.includes('new MutationObserver'), '参考资料导入不得重新引入长期 DOM 观察器');

const transportPosition = loader.indexOf('admin-upload-transport-fix.js');
const hybridPosition = loader.indexOf('hybrid-staged-upload.js');
assert(transportPosition >= 0, '页面未加载管理员上传状态修复脚本');
assert(hybridPosition > transportPosition, '状态修复必须在混合上传脚本之前加载');
assert(loader.includes(`admin-upload-transport-fix.js?v=${version}`), '管理员上传状态脚本缓存版本不一致');
assert(loader.includes(`reference-import-mode.js?v=${version}`), '参考资料导入保护脚本缓存版本不一致');

assert(config.includes('var tokenCodes = ['), '内置 Token 数据被删除');
assert(config.includes('savedToken || window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN'), '内置 Token 回退被删除');
assert(config.includes('localStorage.removeItem(key)'), '启动阶段未清理旧版持久化 Token');
assert(tokenDefault.includes('localStorage.removeItem(TOKEN_KEY)'), '增强阶段未清理旧版持久化 Token');
assert(!config.includes('sessionStorage.getItem(key) || localStorage.getItem(key)'), '启动阶段仍会优先使用长期遗留 Token');
assert(config.includes(`page-enhancements.js?v=${version}`), '完整启动加载器或缓存键缺失');
assert(config.includes('installAtomicBootScreen'), '原子启动逻辑被截断');
assert(maintenance.includes('默认 GitHub Token 内置在前端代码中'), '维护约束未保留内置 Token');
assert(fs.existsSync('scripts/validate-embedded-token-live.js'), '缺少内置 Token 实际 API 验证脚本');
assert(fs.existsSync('scripts/validate-admin-progress-wrapper.js'), '缺少管理员进度递归动态回归测试');
assert(fs.existsSync('scripts/validate-reference-upload-stability.js'), '缺少参考资料上传稳定性回归测试');

console.log('reference import stability, credential validation, stale-token cleanup and original upload transport validation passed');
