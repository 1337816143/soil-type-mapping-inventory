'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('admin-upload-transport-fix.js', 'utf8');
const hybrid = fs.readFileSync('hybrid-staged-upload.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');
const config = fs.readFileSync('upload-config.js', 'utf8');
const maintenance = fs.readFileSync('MAINTENANCE_RULES.md', 'utf8');
const version = fs.readFileSync('VERSION', 'utf8').trim().slice(1);

assert(source.includes('function normalizeStage(text)'), '管理员上传状态缺少统一格式化');
assert(source.includes('function renderUploadStatus()'), '管理员上传状态缺少原位渲染');
assert(source.includes("'\\n上传进度：'"), '管理员上传状态未显示当前百分比');
assert(source.includes('tracked.stage'), '管理员上传状态未分离固定阶段与动态数值');
assert(source.includes('tracked.percent'), '管理员上传状态未维护单一当前进度');
assert(source.includes("button.dataset.authReady = '1'"), '管理员上传仍可能被重复凭证弹窗拦截');
assert(source.includes('不改写 window.fetch'), '管理员上传未声明恢复原始 fetch 链路');
assert(!source.includes('window.fetch = function'), '管理员上传仍在全局替换 fetch');
assert(!source.includes('new XMLHttpRequest()'), '管理员 Git Blob 上传仍被 XHR 接管');
assert(!source.includes("tracked.text + '\\n'"), '管理员上传状态仍会递归累加旧文本');
assert(!source.includes('正在传输：'), '管理员上传状态仍输出逐条传输日志');

assert(hybrid.includes("'Authorization': 'Bearer ' + token()"), '原始 Git Data API Bearer 鉴权链路被改变');
assert(hybrid.includes('return fetch(API_ROOT + path'), '原始 Git Data API fetch 上传链路被改变');
assert(hybrid.includes("return api('/git/blobs'"), '原始 Git Blob 创建接口被改变');
assert(hybrid.includes('正在整文件上传'), '39 MiB 整文件上传策略被删除');
assert(hybrid.includes('39 MiB 分块'), '超限文件分块策略被删除');

const transportPosition = loader.indexOf('admin-upload-transport-fix.js');
const hybridPosition = loader.indexOf('hybrid-staged-upload.js');
assert(transportPosition >= 0, '页面未加载管理员上传状态修复脚本');
assert(hybridPosition > transportPosition, '状态修复必须在混合上传脚本之前加载');
assert(loader.includes(`admin-upload-transport-fix.js?v=${version}`), '管理员上传状态脚本缓存版本不一致');

assert(config.includes('var tokenCodes = ['), '内置 Token 数据被删除');
assert(config.includes('savedToken || window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN'), '内置 Token 回退被删除');
assert(maintenance.includes('默认 GitHub Token 内置在前端代码中'), '维护约束未保留内置 Token');
assert(fs.existsSync('scripts/validate-embedded-token-live.js'), '缺少内置 Token 实际 API 验证脚本');

console.log('admin upload in-place status and original fetch transport validation passed');
