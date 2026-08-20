'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('mobile-file-picker-fix.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');
const bridge = fs.readFileSync('north-quality-authority-bridge.js', 'utf8');
const referenceUpload = fs.readFileSync('reference-upload.js', 'utf8');
const version = fs.readFileSync('VERSION', 'utf8').trim().replace(/^v/, '');

assert(source.includes("var ZIP_ACCEPT = '.zip,application/zip,application/x-zip-compressed'"), '手机ZIP专用选择器未限定ZIP MIME/扩展名');
assert(source.includes("var GENERIC_ACCEPT = '*/*,.zip,application/zip,application/x-zip-compressed'"), '普通文件选择器未保留全类型并显式加入ZIP');
assert(source.includes("input.id = 'adm-zip-mobile'"), '缺少质控文件手机专用ZIP input');
assert(source.includes("input.type = 'file'"), '质控文件手机专用ZIP控件不是file input');
assert(source.includes("input.accept = ZIP_ACCEPT"), '质控文件手机专用ZIP控件未应用非媒体accept');
assert(source.includes("input.removeAttribute('capture')"), '质控文件手机专用ZIP控件未明确移除capture');
assert(source.includes("picker.removeAttribute('capture')"), '质控普通文件选择器未明确移除capture');
assert(source.includes('选择 ZIP 文件（手机推荐）'), '质控管理员界面缺少明确的手机ZIP入口');
assert(source.includes('避免 Android/部分浏览器误进入照片或视频选择器'), '质控管理员界面未解释移动端文件选择目的');
assert(source.includes('file.arrayBuffer()'), '质控手机ZIP选择后未读取实际ZIP字节');
assert(source.includes("/\\.(docx?|pdf)$/i"), '质控手机ZIP解析未限制为既有质控文件类型');
assert(source.includes('normalizePreparedFiles'), '质控手机ZIP解析未接入既有管理员导入状态');
assert(source.includes('ensureAuthorityReady'), '质控手机ZIP解析未等待北部权威索引');
assert(source.includes('classifier.applyItemMetadata(item)'), '质控手机ZIP解压后未逐文件重新匹配元数据');
assert(source.includes('bridge.syncPreviewRows'), '质控手机ZIP重新匹配后未立即刷新归档完整状态');
assert(source.includes('已按确认索引重新匹配归档信息'), '质控手机ZIP完成提示没有说明已重新匹配');
assert(!source.includes('new MutationObserver'), '质控手机选择器不得使用长期MutationObserver');
assert(bridge.includes('归档信息完整，可直接上传'), '权威索引桥接未将成功匹配显示为归档完整');

const adapterPos = loader.indexOf('north-quality-upload-adapter.js');
const mobilePos = loader.indexOf('mobile-file-picker-fix.js');
assert(adapterPos >= 0 && mobilePos > adapterPos, '质控手机ZIP修复模块加载顺序错误');
assert(loader.includes(`mobile-file-picker-fix.js?v=${version}`), '质控手机ZIP修复模块未按当前版本缓存键加载');
assert(!loader.includes('reference-import-mode.js'), '旧共享参考资料导入层仍在加载');
assert(loader.includes(`reference-upload.js?v=${version}`), '参考资料独立手机上传器未加载');
assert(referenceUpload.includes('id=\"ref-upload-zip\"') || referenceUpload.includes("id='ref-upload-zip'"), '参考资料独立上传器缺少手机ZIP入口');
assert(referenceUpload.includes('.zip,application/zip,application/x-zip-compressed'), '参考资料独立ZIP入口未限定ZIP文件类型');
assert(!referenceUpload.includes('normalizePreparedFiles'), '参考资料ZIP错误复用了质控文件状态');
assert(!referenceUpload.includes('SoilAdminAutoClassifier'), '参考资料ZIP错误调用质控自动分类器');

console.log('mobile ZIP validation passed: quality and reference pickers are separate and independently classified');
