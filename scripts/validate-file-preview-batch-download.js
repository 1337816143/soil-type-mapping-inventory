'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('file-preview-batch-download.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');
const maintenance = fs.readFileSync('MAINTENANCE_RULES.md', 'utf8');
const version = fs.readFileSync('VERSION', 'utf8').trim().replace(/^v/, '');

assert(source.includes("DOCX_PREVIEW_URL = 'https://cdn.jsdelivr.net/npm/docx-preview@0.4.0/dist/docx-preview.min.js'"), 'DOCX 站内预览组件未固定版本');
assert(source.includes("ext === 'docx'"), '缺少 DOCX 站内预览');
assert(source.includes("window.docx.renderAsync"), 'DOCX 未使用浏览器端渲染');
assert(source.includes("ext === 'pdf'"), '缺少 PDF 站内预览');
assert(source.includes("URL.createObjectURL(new Blob([blob], {type:'application/pdf'}))"), 'PDF 未通过 Blob URL 站内打开');
assert(source.includes("download.textContent = '下载文件'"), '预览界面缺少下载按钮');
assert(source.includes("anchor.classList.contains('district-link') || anchor.classList.contains('doc-btn')"), '成果文件点击未统一拦截到站内预览');
assert(source.includes('event.preventDefault()'), '默认点击仍可能直接触发浏览器下载');

assert(source.includes("button.textContent = '批量下载'"), '成果标签页缺少批量下载按钮');
assert(source.includes("heading.querySelector('.admin-delete-trigger')"), '批量下载按钮未定位到管理员删除按钮');
assert(source.includes("deleteButton.insertAdjacentElement('afterend', button)"), '批量下载按钮未放在管理员删除之后');
assert(!source.includes('ensureAdminToken('), '公开批量下载不应要求管理员凭证');
assert(!source.includes('credPass'), '公开批量下载不应要求管理员密码');
assert(source.includes("buildFilterGroup('city', '按市选择'"), '缺少按市筛选');
assert(source.includes("buildFilterGroup('unit', '按作业单位选择'"), '缺少按作业单位筛选');
assert(source.includes("buildFilterGroup('resultType', '按成果类型选择'"), '缺少按成果类型筛选');
assert(source.includes("buildFilterGroup('district', '按区县选择'"), '缺少按区县筛选');
assert(source.includes("id=\"soil-batch-search\""), '缺少批量下载搜索框');
assert(source.includes('全选当前结果'), '缺少全选当前结果');
assert(source.includes('associationMatches(assoc, filters, query, item)'), '筛选未按同一真实任务关联做交叉匹配');
assert(source.includes('byPath[repoPath]'), '批量下载目录未按物理路径去重');
assert(source.includes('new Set()'), '批量下载选择状态未去重');
assert(source.includes("zip.file(zipEntryName(item), blob"), '批量下载未将原文件写入 ZIP');
assert(source.includes("downloadBlob(blob, '三普质控资料_'"), '批量 ZIP 未触发浏览器下载');
assert(source.includes('浏览器需要先读取这些文件再生成ZIP'), '大批量下载缺少内存/耗时提示');
assert(source.includes('正在生成 ZIP：'), '批量下载缺少压缩进度');

assert(loader.includes(`file-preview-batch-download.js?v=${version}`), '文件预览/批量下载模块未按当前版本缓存键加载');
assert(maintenance.includes('所有成果质控文件默认“先预览、后下载”'), '维护约束未锁定预览优先行为');
assert(maintenance.includes('每个成果标签页必须提供无需密码的公开批量下载'), '维护约束未锁定公开批量下载');

console.log('file preview + public cross-filter batch download validation passed');
