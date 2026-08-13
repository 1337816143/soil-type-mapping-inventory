'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('mobile-file-picker-fix.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');
const bridge = fs.readFileSync('north-quality-authority-bridge.js', 'utf8');

assert(source.includes("var ZIP_ACCEPT = '.zip,application/zip,application/x-zip-compressed'"), '手机ZIP专用选择器未限定ZIP MIME/扩展名');
assert(source.includes("var GENERIC_ACCEPT = '*/*,.zip,application/zip,application/x-zip-compressed'"), '普通文件选择器未保留全类型并显式加入ZIP');
assert(source.includes("input.id = 'adm-zip-mobile'"), '缺少手机专用ZIP input');
assert(source.includes("input.type = 'file'"), '手机专用ZIP控件不是file input');
assert(source.includes("input.accept = ZIP_ACCEPT"), '手机专用ZIP控件未应用非媒体accept');
assert(source.includes("input.removeAttribute('capture')"), '手机专用ZIP控件未明确移除capture');
assert(source.includes("picker.removeAttribute('capture')"), '普通文件选择器未明确移除capture');
assert(source.includes('选择 ZIP 文件（手机推荐）'), '管理员界面缺少明确的手机ZIP入口');
assert(source.includes('避免 Android/部分浏览器误进入照片或视频选择器'), '管理员界面未解释移动端文件选择目的');
assert(source.includes('file.arrayBuffer()'), '手机ZIP选择后未读取实际ZIP字节');
assert(source.includes("/\\.(docx?|pdf)$/i"), '手机ZIP解析未限制为既有质控文件类型');
assert(source.includes('normalizePreparedFiles'), '手机ZIP解析未接入既有管理员导入状态');
assert(source.includes('ensureAuthorityReady'), '手机ZIP解析未等待北部权威索引');
assert(source.includes('classifier.applyItemMetadata(item)'), '手机ZIP解压后未逐文件重新匹配元数据');
assert(source.includes('bridge.syncPreviewRows'), '手机ZIP重新匹配后未立即刷新归档完整状态');
assert(source.includes('已按确认索引重新匹配归档信息'), '手机ZIP完成提示没有说明已重新匹配');
assert(!source.includes('new MutationObserver'), '手机选择器不得使用长期MutationObserver');
assert(bridge.includes('归档信息完整，可直接上传'), '权威索引桥接未将成功匹配显示为归档完整');

const adapterPos = loader.indexOf('north-quality-upload-adapter.js');
const mobilePos = loader.indexOf('mobile-file-picker-fix.js');
const refPos = loader.indexOf('reference-import-mode.js');
assert(adapterPos >= 0 && mobilePos > adapterPos && refPos > mobilePos, '手机ZIP修复模块加载顺序错误');
assert(loader.includes('mobile-file-picker-fix.js?v=1.0.17'), '手机ZIP修复模块未按当前版本缓存键加载');

console.log('mobile Android ZIP picker + authoritative reclassification validation passed');
