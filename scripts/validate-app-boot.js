'use strict';

const assert = require('assert');
const fs = require('fs');

const version = fs.readFileSync('VERSION', 'utf8').trim();
const bare = version.slice(1);
const config = fs.readFileSync('upload-config.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');

assert(config.includes("root.classList.add('soil-app-booting')"), '页面启动时未启用原子加载遮罩');
assert(config.includes('body>*:not(#soilAppBootScreen)'), '启动遮罩没有隐藏旧版基础页面');
assert(config.includes("window.addEventListener('soil-app-ready'"), '启动遮罩未等待增强模块完成');
assert(config.includes("window.addEventListener('soil-app-error'"), '启动遮罩缺少失败兜底');
assert(config.includes("fetch('./VERSION?ts=' + Date.now()"), '未检查部署版本一致性');
assert(config.includes(`page-enhancements.js?v=${bare}`), 'upload-config.js 未加载当前版本增强入口');
assert(loader.includes(`var VERSION = '${bare}'`), '增强模块入口版本与 VERSION 不一致');
assert(loader.includes("emit('soil-app-ready'"), '增强模块完成后未发送一次性展示信号');
assert(loader.includes("emit('soil-app-error'"), '增强模块失败时未发送错误信号');
assert(loader.includes(`reply-upload-progress.js?v=${bare}`), '实时上传进度模块未加入页面加载链');
assert(loader.indexOf('upload-auth-reply-batch.js') < loader.indexOf('reply-upload-progress.js'), '实时上传进度模块必须在批次答复模块之后加载');

const scriptUrls = Array.from(loader.matchAll(/src:'(\.\/[^']+\.js\?v=([^']+))'/g));
assert(scriptUrls.length >= 20, '增强模块清单数量异常');
scriptUrls.forEach((match) => {
  assert.strictEqual(match[2], bare, `脚本未使用当前版本缓存键：${match[1]}`);
});

const readyPosition = loader.indexOf("emit('soil-app-ready'");
const lastModulePosition = loader.lastIndexOf("src:'./upload-success-notice.js");
assert(readyPosition > lastModulePosition, '页面在全部模块加载完成前就被展示');

console.log('atomic app boot validation passed');
