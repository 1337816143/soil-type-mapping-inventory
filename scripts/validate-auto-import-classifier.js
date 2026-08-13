'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('admin-auto-classifier.js', 'utf8');
const hybrid = fs.readFileSync('hybrid-staged-upload.js', 'utf8');
const adapter = fs.readFileSync('north-quality-upload-adapter.js', 'utf8');
const mobile = fs.readFileSync('mobile-file-picker-fix.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/import-chunked.yml', 'utf8');
const pkg = JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json', 'utf8'));
const activeKeys = ['soilType','soilAttr','farmland'];

function scopedPackage(raw) {
  const copy = JSON.parse(JSON.stringify(raw));
  copy.activeDataKeys = activeKeys.slice();
  copy.documents.forEach((doc) => {
    doc.dataKeys = activeKeys.slice();
    doc.associationsByDataKey = Object.fromEntries(activeKeys.map((key) => [key, doc.associationsByDataKey[key] || []]));
  });
  return copy;
}

const taskList = [
  {city:'唐山市',items:[{unit:'唐山市农业农村局',districts:['乐亭县','丰南区','丰润区','合并区','玉田县','滦南县','曹妃甸区','唐山市']}]},
  {city:'邢台市',items:[{unit:'邢台测试作业单位',districts:['信都区','南和区','沙河市']}]},
  {city:'沧州市',items:[
    {unit:'河北司南测绘服务有限公司',districts:['东光县']},
    {unit:'海兴县测试作业单位',districts:['海兴县']}
  ]}
];

const fakeDocument = {
  readyState: 'loading',
  addEventListener() {},
  getElementById() { return null; },
  createElement() { return {style:{}, classList:{toggle(){}, add(){}}, appendChild(){}, querySelector(){return null;}}; },
  head: {appendChild(){}},
  querySelector() { return null; }
};
const soilAdminImport = {state:{files:[]}};
const routing = {
  coveredKeys:activeKeys.slice(),
  isSharedReport(name) { return /(?:第三次全国土壤普查|三普).*成果.*(?:质控|质量控制).*报告/.test(String(name || '')); },
  parseTargets(name) {
    const prefix = String(name || '').split(/(?:第三次全国土壤普查|三普).*成果.*(?:质控|质量控制).*报告/)[0]
      .replace(/和市级$/, '、市级');
    return prefix.split(/[、,，和及]+/).filter(Boolean);
  },
  resolveTargets(targets, dataKey) {
    if (!activeKeys.includes(dataKey)) return {associations:[], unresolved:[]};
    return {
      associations: targets.map((target) => ({city:'测试市',unit:'测试单位',district:target,target,dataKey})),
      unresolved: []
    };
  }
};
const context = {
  window: {
    SoilAdminImport:soilAdminImport,
    SoilTaskUnitLists:{soilType:taskList,other:taskList,listFor(){return taskList;}},
    SoilQualityFileRouting:routing,
    masterList:taskList
  },
  document: fakeDocument,
  console,
  Event: function Event() {},
  setTimeout(fn) { fn(); return 0; },
  fetch() { return Promise.reject(new Error('offline test')); }
};
context.window.window = context.window;
vm.runInNewContext(source, context, {filename:'admin-auto-classifier.js'});
const classifier = context.window.SoilAdminAutoClassifier;
assert(classifier, '自动导入分类器未导出');

function arr(value) { return Array.prototype.slice.call(value); }
assert.deepStrictEqual(arr(classifier.inferDataKeys('保定市_土壤类型图_第一批质控意见.docx')), ['soilType']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('耕地质量等级评价 第二批补充 审核意见.docx')), ['farmland']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('耕地质量评价成果质控意见_衡水市131182深州市质控.pdf')), ['farmland']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('土特产品土壤适宜性评价质控意见.docx')), ['specialty']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('土壤农业利用适宜性评价质控意见.docx')), ['agriSuitability']);
assert.deepStrictEqual(arr(classifier.inferDataKeys('土地资源评价与利用报告质控意见.docx')), ['landUse']);
// 历史/非登记综合报告仍保留旧文件名识别能力；北部28份当前材料由权威索引收敛为3类。
assert.deepStrictEqual(arr(classifier.inferDataKeys('某县第三次全国土壤普查成果质控报告.docx')), ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability']);
assert.strictEqual(classifier.inferBatch('2026年第二批补充/某县/土壤属性图.docx'), '第二批补充');
assert.strictEqual(classifier.inferBatch('第一轮/综合质控报告.docx'), '第一轮');
assert.strictEqual(classifier.inferKind('技术规范与参考资料.pdf', []), 'reference');
assert.strictEqual(classifier.inferKind('土壤属性图质控意见.docx', ['soilAttr']), 'quality');

assert.strictEqual(pkg.schemaVersion, 2, '北部权威索引应使用schemaVersion 2');
assert.strictEqual(pkg.documentCount, 28, '北部登记材料应为28份');
assert.strictEqual(pkg.associationStatus, 'authoritative-confirmed', '北部材料应标记为权威确认关联');
assert(pkg.importDefaults && pkg.importDefaults.autoTargets && pkg.importDefaults.autoDataKeys && pkg.importDefaults.authoritativeAssociations, '北部导入默认值未启用权威自动关联');
for (const doc of pkg.documents) {
  assert(doc.filename && doc.size > 0 && /^[a-f0-9]{64}$/.test(doc.sha256), `登记项缺少文件校验信息：${doc.filename}`);
  assert(Array.isArray(doc.targets) && doc.targets.length, `登记项缺少关联地区：${doc.filename}`);
  assert(doc.physicalPath && doc.physicalPath.includes('/北部片区共享质控/第一轮/'), `登记项缺少唯一物理路径：${doc.filename}`);
  assert(doc.associationsByDataKey && activeKeys.every((key) => Array.isArray(doc.associationsByDataKey[key]) && doc.associationsByDataKey[key].length), `登记项缺少当前3类权威任务关联：${doc.filename}`);
}

const scoped = scopedPackage(pkg);
classifier.loadCatalogData(scoped);
const screenshotDoc = scoped.documents.find((doc) => doc.filename.startsWith('乐亭县、丰南区、丰润区'));
assert(screenshotDoc, '未找到截图中的乐亭县报告');
const currentItem = {file:{name:screenshotDoc.filename,size:screenshotDoc.size},path:screenshotDoc.filename,batch:'管理员导入'};
const currentMeta = classifier.applyItemMetadata(currentItem);
assert.strictEqual(currentMeta.catalogExact, true, '当前批次文件应按文件名+大小精确命中');
assert.strictEqual(currentMeta.batch, '第一轮', '当前批次应自动识别为第一轮');
assert.deepStrictEqual(arr(currentMeta.dataKeys), activeKeys, '当前北部综合报告只能自动关联3类已确认成果');
assert.strictEqual(currentMeta.targets.length, screenshotDoc.targets.length, '当前共享报告来源地区数量未正确恢复');
assert.strictEqual(currentMeta.unresolvedTargets.length, 0, '当前共享报告不应显示未识别');

const oldSoilType = {file:{name:'土壤类型图成果质控意见_邢台市130503信都县.pdf',size:1},path:'2026年第一批/土壤类型图/土壤类型图成果质控意见_邢台市130503信都县.pdf',batch:'管理员导入'};
const oldTypeMeta = classifier.applyItemMetadata(oldSoilType);
assert.deepStrictEqual(arr(oldTypeMeta.dataKeys), ['soilType']);
assert.strictEqual(oldTypeMeta.batch, '第一批');
assert.strictEqual(oldSoilType.city, '邢台市');
assert.strictEqual(oldSoilType.unit, '邢台测试作业单位');
assert.strictEqual(oldSoilType.district, '信都区', '历史“信都县”应兼容映射到信都区');

const oldFarmland = {file:{name:'耕地质量评价成果质控意见_130924海兴县.pdf',size:1},path:'2026年第二批/耕地质量评价/耕地质量评价成果质控意见_130924海兴县.pdf',batch:'管理员导入'};
const oldFarmlandMeta = classifier.applyItemMetadata(oldFarmland);
assert.deepStrictEqual(arr(oldFarmlandMeta.dataKeys), ['farmland']);
assert.strictEqual(oldFarmlandMeta.batch, '第二批');
assert.strictEqual(oldFarmland.city, '沧州市', '历史文件即使省略市名也应由唯一任务单元反推市');
assert.strictEqual(oldFarmland.unit, '海兴县测试作业单位');
assert.strictEqual(oldFarmland.district, '海兴县');

assert(source.includes("Object.defineProperty(state, 'files'"), '未安装 state.files 赋值监听，ZIP异步解压仍会绕过自动识别');
soilAdminImport.state.files = [currentItem];
assert(context.window.SoilAdminAutoClassifier.lastSelection && context.window.SoilAdminAutoClassifier.lastSelection.metas.length === 1, 'ZIP完成后 state.files 更新未触发自动识别刷新');
assert(!source.includes('new MutationObserver'), '自动识别不得重新引入长期DOM观察器');
assert(source.includes('[250,650,1150,1800]'), '自动识别未覆盖管理员弹窗延迟重建后的重新绑定');
assert(source.includes("wrapFunction('acceptSplitFiles')"), '拆分文件后的识别链路未接入');

assert(source.includes('north-package-registry'), '自动分类器未使用北部登记表');
assert(source.includes('expectedSha256'), '自动分类器未携带登记SHA-256');
assert(hybrid.includes('function C() { return window.SoilAdminAutoClassifier; }'), '上传流程未接入自动分类器');
assert(hybrid.includes('sharedInspection(item, dataKeys)'), '上传流程未以共享报告检查结果为最终成果范围');
assert(workflow.includes('hashlib.sha256(output.read_bytes()).hexdigest()'), 'Actions未校验登记SHA-256');
assert(workflow.includes('for data_key in data_keys:'), 'Actions未按自动识别的多个成果类型建立索引');
assert(!adapter.includes('new MutationObserver'), '北部上传适配器不得使用长期DOM观察器');
assert(adapter.includes('inspection.dataKeys.length'), '北部上传预览未使用路由器过滤后的3类成果数量');
assert(mobile.includes('ensureAuthorityReady'), '手机ZIP未等待权威索引');
assert(mobile.includes('prepared.forEach(function (item) { classifier.applyItemMetadata(item); })'), '手机ZIP解压后未逐项强制重新匹配');

console.log('automatic import classifier validation passed: current northern package uses 3 active types; historical named types remain compatible');
