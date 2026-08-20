'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const uploader = fs.readFileSync('reference-upload.js', 'utf8');
const library = fs.readFileSync('reference-library.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/import-reference.yml', 'utf8');
const version = fs.readFileSync('VERSION', 'utf8').trim().slice(1);

assert(library.includes('window.openSoilReferenceUpload()'), '参考文件管理员入口未切换到独立上传器');
assert(!library.includes("openSoilAdminImport({kind: 'reference'"), '参考文件入口仍调用质控管理员导入器');
assert(loader.includes(`reference-upload.js?v=${version}`), '独立参考资料上传器未按当前版本加载');
assert(!loader.includes('reference-import-mode.js'), '旧的共享参考资料模式保护仍在运行，未完成隔离');

[
  'SoilAdminAutoClassifier',
  'SoilAdminImport',
  "getElementById('adm-kind')",
  "getElementById('adm-data-key')",
  "getElementById('adm-batch')",
  "getElementById('adm-city')",
  "getElementById('adm-unit')",
  "getElementById('adm-district')"
].forEach((needle) => assert(!uploader.includes(needle), `参考资料上传器仍依赖质控上传逻辑：${needle}`));

assert(uploader.includes("var STAGE_ROOT = '.reference-upload';"), '参考资料没有独立暂存根目录');
assert(uploader.includes("var branch = 'reference-upload-' + uploadId;"), '参考资料没有独立暂存分支');
assert(workflow.includes("- 'reference-upload-*'"), '参考资料专用 Actions 未监听独立分支');
assert(workflow.includes("- '.reference-upload/ready.json'"), '参考资料专用 Actions 未监听独立 ready 清单');
assert(workflow.includes("manifest.get('kind') != 'reference'"), '参考资料专用 Actions 未强制 reference 类型');
assert(!workflow.includes('quality_records'), '参考资料专用 Actions 不应包含质控索引写入');
assert(workflow.includes('git add reference-files/third-soil-survey'), '参考资料专用 Actions 未限制提交目录');
assert(workflow.includes('actions/workflows/deploy.yml/dispatches'), '参考资料归档后未显式触发 Pages');

assert(uploader.includes('window.visualViewport'), '参考资料上传窗口未按移动端实际可视高度适配');
assert(uploader.includes('env(safe-area-inset-top)') && uploader.includes('env(safe-area-inset-bottom)'), '参考资料上传窗口未适配刘海/底部手势安全区');
assert(uploader.includes('@media(max-width:760px)'), '参考资料上传窗口缺少手机窄屏布局');
assert(uploader.includes('@media(max-height:560px) and (orientation:landscape)'), '参考资料上传窗口缺少手机横屏低高度布局');
assert(!uploader.includes('new MutationObserver'), '参考资料上传器重新引入了 DOM 观察器，可能导致闪烁循环');
assert(uploader.includes('function pulse(text, start, end)'), '参考资料上传进度缺少独立的原位平滑推进机制');
assert(uploader.includes('if (label.textContent !== String(text || \'\'))'), '参考资料进度文本未采用原位更新');

assert(uploader.includes('item.manualDirectory = true'), '手动调整目录没有锁定用户选择');
assert(uploader.includes('if (!item || item.manualDirectory) return item;'), '异步目录刷新仍可能覆盖人工选择');
assert(uploader.includes('根据文件名自动识别'), '参考资料上传预览未标明独立自动识别');
assert(uploader.includes('重新自动识别'), '参考资料目录手动调整后缺少恢复自动识别入口');
assert(uploader.includes('ZIP（手机推荐）'), '参考资料独立上传缺少手机 ZIP 入口');
assert(uploader.includes('上传成功！稍等3~5分钟刷新网站即可查看新上传的文件。'), '参考资料上传成功提示缺失');

const repoAdmin = {
  referenceRoot:'reference-files/third-soil-survey',
  dirs:[
    'reference-files/third-soil-survey',
    'reference-files/third-soil-survey/三普成果编制及质量控制主要参考资料/三普成果编制及质控参考资料-土壤类型图',
    'reference-files/third-soil-survey/三普成果编制及质量控制主要参考资料/三普成果编制及质控参考资料-土壤属性图',
    'reference-files/third-soil-survey/三普成果编制及质量控制主要参考资料/三普成果编制及质控参考资料-耕地质量等级评价'
  ],
  clean(value){
    return String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  },
  esc(value){ return String(value == null ? '' : value); },
  base(value){ return String(value || '').split('/').pop(); },
  size(value){ return `${value} B`; }
};
const documentStub = {
  documentElement:{style:{setProperty(){}}},
  getElementById(){ return null; },
  createElement(){ return {style:{},appendChild(){}}; },
  head:{appendChild(){}},
  body:{appendChild(){}}
};
const windowStub = {
  SoilRepoAdmin:repoAdmin,
  innerHeight:800,
  addEventListener(){},
  visualViewport:{height:760,addEventListener(){}},
  document:documentStub
};
const context = {
  window:windowStub,
  document:documentStub,
  console,
  Promise,
  Array,
  Math,
  Number,
  String,
  Date,
  setTimeout(){ return 0; },
  clearTimeout(){},
  setInterval(){ return 1; },
  clearInterval(){},
  requestAnimationFrame(fn){ fn(); return 1; },
  fetch(){ return Promise.reject(new Error('offline')); },
  alert(){},
  File:function File(){},
  Uint8Array,
  btoa(value){ return Buffer.from(value, 'binary').toString('base64'); }
};
windowStub.window = windowStub;
vm.createContext(context);
vm.runInContext(uploader, context, {filename:'reference-upload.js'});

const api = windowStub.SoilReferenceUpload;
assert(api, '独立参考资料上传器未导出');
assert.strictEqual(api.inferCategory('第三次全国土壤普查耕地质量等级评价专题省级成果审核评分手册.pdf'), '耕地质量等级评价');
assert.strictEqual(api.inferCategory('河北省土壤类型图制图技术参考.pdf'), '土壤类型图');
assert.strictEqual(api.inferCategory('土壤属性图成果编制技术规范.docx'), '土壤属性图');
assert.strictEqual(api.inferCategory('基础地理信息1比10000地形要素数据规范.pdf'), '其他资料');
assert(api.directoryForCategory('耕地质量等级评价').endsWith('三普成果编制及质控参考资料-耕地质量等级评价'), '文件名识别后未匹配到正确参考目录');
assert.strictEqual(api.directoryForCategory('其他资料'), 'reference-files/third-soil-survey', '无法识别的参考资料应明确回退根目录');

console.log('isolated reference upload validation passed: mobile UI, independent classifier, manual directory persistence, dedicated staging workflow and progress');
