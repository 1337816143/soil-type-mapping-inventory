'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('document-preview-controls.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');
const maintenance = fs.readFileSync('MAINTENANCE_RULES.md', 'utf8');
const version = fs.readFileSync('VERSION', 'utf8').trim().replace(/^v/, '');

assert(source.includes("pdfjs-dist@3.11.174/build/pdf.min.js"), 'PDF.js 未固定版本');
assert(source.includes("pdfjs-dist@3.11.174/build/pdf.worker.min.js"), 'PDF.js worker 未固定版本');
assert(source.includes('window.pdfjsLib.getDocument'), 'PDF 预览未使用 PDF.js');
assert(source.includes("getDocument({data:new Uint8Array(buffer)})"), 'PDF 未从已读取字节进入 PDF.js');
assert(source.includes("page.render({canvasContext:context, viewport:renderViewport}).promise"), 'PDF 页面未渲染到 Canvas');
assert(!source.includes('<iframe'), '新 PDF 预览不得依赖浏览器内置 PDF iframe 阅读器');
assert(source.includes('data-preview-zoom-out'), '预览缺少缩小按钮');
assert(source.includes('data-preview-zoom-in'), '预览缺少放大按钮');
assert(source.includes('data-preview-fit'), '预览缺少适应宽度按钮');
assert(source.includes("localState.zoom = Math.max(0.5"), '缩小范围未限制');
assert(source.includes("localState.zoom = Math.min(4"), '放大范围未限制');
assert(source.includes('fitPdfScale'), 'PDF 缺少适应宽度计算');
assert(source.includes('fitDocxScale'), 'Word 缺少适应宽度计算');
assert(source.includes('window.docx.renderAsync'), 'Word 预览未保留 docx-preview');
assert(source.includes("localState.docxHost.style.zoom"), 'Word 预览未应用缩放');
assert(source.includes("window.addEventListener('click'"), '未在 window capture 阶段接管 PDF/Word 点击');
assert(source.includes('}, true);'), '预览点击接管未使用捕获阶段');
assert(source.includes("anchor.classList.contains('district-link') || anchor.classList.contains('doc-btn')"), '未限制在成果文件链接');
assert(source.includes("modal.className = 'soil-file-modal'"), '新预览未复用移动端安全视口弹窗样式');
assert(source.includes("class=\"soil-file-action soil-modal-close\""), '新预览关闭按钮未复用移动端固定关闭样式');
assert(source.includes('window.visualViewport.addEventListener'), '横竖屏/地址栏变化后未重新适宽');
assert(!source.includes('new MutationObserver'), '新预览不得引入长期 MutationObserver');

const oldPos = loader.indexOf('file-preview-batch-download.js');
const newPos = loader.indexOf('document-preview-controls.js');
const mobilePos = loader.indexOf('mobile-dialog-reference-batch.js');
assert(oldPos >= 0 && newPos > oldPos && mobilePos > newPos, '文档预览增强模块加载顺序错误');
assert(loader.includes(`document-preview-controls.js?v=${version}`), '文档预览增强未使用当前版本缓存键');
assert(maintenance.includes('PDF.js'), '维护约束未锁定 PDF.js 站内预览');
assert(maintenance.includes('缩放'), '维护约束未锁定 PDF/Word 缩放');

console.log('PDF.js canvas preview + PDF/Word zoom validation passed');
