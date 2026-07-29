'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('admin-upload-transport-fix.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');
const config = fs.readFileSync('upload-config.js', 'utf8');
const maintenance = fs.readFileSync('MAINTENANCE_RULES.md', 'utf8');
const version = fs.readFileSync('VERSION', 'utf8').trim().slice(1);

assert(source.includes("window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN"), '管理员上传未读取内置 Token');
assert(source.includes('function uniqueTokens()'), '缺少当前凭证与内置凭证候选机制');
assert(source.includes('function resolveCredential()'), '缺少上传前凭证预检');
assert(source.includes("'/git/ref/heads/main'"), '凭证预检未验证仓库 main 分支');
assert(source.includes('var activeCredential'), '缺少单次上传凭证冻结变量');
assert(source.includes("headers.set('Authorization', 'Bearer ' + activeCredential)"), '上传请求没有固定使用已验证凭证');
assert(source.includes('sessionStorage.removeItem(TOKEN_KEY)'), '失效临时覆盖未清理');
assert(source.includes('window.SOIL_GITHUB_UPLOAD_TOKEN = embeddedToken()'), '清理覆盖后未回退内置 Token');
assert(source.includes('内置 Token 没有被删除'), '401 提示没有明确保留内置 Token');
assert(!source.includes("window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN = ''"), '管理员上传修复脚本删除了内置 Token');

assert(source.includes('new XMLHttpRequest()'), 'GitHub Blob 上传未使用 XMLHttpRequest');
assert(source.includes('xhr.upload.onprogress'), '缺少真实上传字节进度事件');
assert(source.includes('event.loaded / event.total'), '上传百分比未依据实际字节计算');
assert(source.includes('正在传输：'), '缺少上传字节文本提示');
assert(source.includes('等待 GitHub 确认写入'), '缺少 GitHub 服务端确认阶段');
assert(source.includes('startEncodingPulse'), '文件读取与编码阶段缺少进度兜底');
assert(source.includes("button.dataset.authReady = '1'"), '旧管理员凭证拦截仍可能重复执行');
assert(source.includes("button.dataset.transportCredentialReady = '1'"), '凭证预检后未安全重放上传动作');

const transportPosition = loader.indexOf('admin-upload-transport-fix.js');
const hybridPosition = loader.indexOf('hybrid-staged-upload.js');
assert(transportPosition >= 0, '页面未加载管理员上传传输修复脚本');
assert(hybridPosition > transportPosition, '传输修复必须在混合上传脚本之前加载');
assert(loader.includes(`admin-upload-transport-fix.js?v=${version}`), '管理员上传传输脚本缓存版本不一致');

assert(config.includes('var tokenCodes = ['), '内置 Token 数据被删除');
assert(config.includes('savedToken || window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN'), '内置 Token 回退被删除');
assert(maintenance.includes('默认 GitHub Token 内置在前端代码中'), '维护约束未保留内置 Token');

console.log('admin upload credential and progress validation passed');
