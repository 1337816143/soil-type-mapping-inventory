'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('admin-auto-classifier.js', 'utf8');
const hybrid = fs.readFileSync('hybrid-staged-upload.js', 'utf8');
const adapter = fs.readFileSync('north-quality-upload-adapter.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/import-chunked.yml', 'utf8');
const pkg = JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json', 'utf8'));

const fakeDocument = {
  readyState: 'loading',
  addEventListener() {},
  getElementById() { return null; },
  createElement() { return {style:{}, classList:{toggle(){}}, appendChild(){}, querySelector(){return null;}}; },
  head: {appendChild(){}},
  querySelector() { return null; }
};
const context = {
  window: {},
  document: fakeDocument,
  console,
  Event: function Event() {},
  setTimeout() { return 0; },
  fetch() { return Promise.reject(new Error('offline test')); }
};
context.window.window = context.window;
vm.runInNewContext(source, context, {filename:'admin-auto-classifier.js'});
const classifier = context.window.SoilAdminAutoClassifier;
assert(classifier, '自动导入分类器未导出');

function arr(value) { return Array.prototype.slice.call(value); }
assert.deepStrictEqual(arr(classifier.inferDataKeys('保定市_土壤类型图_第一批质控意见.docx')), ['soilType']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('耕地质量等级评价 第二批补充 审核意见.docx')), ['farmland']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('土特产品土壤适宜性评价质控意见.docx')), ['specialty']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('土壤农业利用适宜性评价质控意见.docx')), ['agriSuitability']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('土地资源评价与利用报告质控意见.docx')), ['landUse']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('某县第三次全国土壤普查成果质控报告.docx')), ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability']);
assert.strictEqual(classifier.inferBatch('第二批补充/某县/土壤属性图.docx'), '第二批补充');
assert.strictEqual(classifier.inferBatch('第一轮/综合质控报告.docx'), '第一轮');
assert.strictEqual(classifier.inferKind('技术规范与参考资料.pdf', []), 'reference');
assert.strictEqual(classifier.inferKind('土壤属性图质控意见.docx', ['soilAttr']), 'quality');

assert.strictEqual(pkg.documentCount, 28, '北部登记材料应为28份');
assert.strictEqual(pkg.associationStatus, 'pre-associated', '北部材料未标记为预关联');
assert.strictEqual(pkg.associationRule, 'filename+size+sha256', '北部材料关联校验规则不正确');
assert(pkg.importDefaults && pkg.importDefaults.autoTargets && pkg.importDefaults.autoDataKeys, '北部导入默认值未启用自动关联');
const expectedKeys = ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability'];
for (const doc of pkg.documents) {
  assert(doc.filename && doc.size > 0 && /^[a-f0-9]{64}$/.test(doc.sha256), `登记项缺少文件校验信息：${doc.filename}`);
  assert.deepStrictEqual(doc.dataKeys, expectedKeys, `登记项成果类型不完整：${doc.filename}`);
  assert(Array.isArray(doc.targets) && doc.targets.length, `登记项缺少关联地区：${doc.filename}`);
}
const sample = pkg.documents.find(doc => doc.filename.includes('安国市、博野县、蠡县、三河市'));
assert(sample, '未找到用户指定的安国市示例报告');
assert.strictEqual(sample.targets.length, 9, '安国市示例应关联9个地区');

assert(source.includes('north-package-registry'), '自动分类器未使用北部登记表');
assert(source.includes('expectedSha256'), '自动分类器未携带登记SHA-256');
assert(hybrid.includes('function C() { return window.SoilAdminAutoClassifier; }'), '上传流程未接入自动分类器');
assert(hybrid.includes('dataKeys: dataKeys.slice()'), '普通质控文件未按每文件成果类型写入清单');
assert(hybrid.includes('record.expectedSha256'), '上传清单未携带登记SHA-256');
assert(workflow.includes('hashlib.sha256(output.read_bytes()).hexdigest()'), 'Actions未校验登记SHA-256');
assert(workflow.includes('for data_key in data_keys:'), 'Actions未按自动识别的多个成果类型建立索引');
assert(!adapter.includes('new MutationObserver'), '北部上传适配器不得使用长期DOM观察器');
assert(adapter.includes('导入类型、成果类型、批次和关联地区均自动识别'), '北部上传说明未体现全自动匹配');

console.log('automatic import classifier and northern pre-association validation passed');
