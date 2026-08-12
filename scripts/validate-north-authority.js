'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const EXPECTED_KEYS = ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability'];
const pkg = JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json', 'utf8'));
const routingSource = fs.readFileSync('quality-file-routing.js', 'utf8');
const bridgeSource = fs.readFileSync('north-quality-authority-bridge.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');

assert.strictEqual(pkg.schemaVersion, 2, '北部权威索引schemaVersion错误');
assert.strictEqual(pkg.associationStatus, 'authoritative-confirmed', '北部权威索引状态错误');
assert.strictEqual(pkg.associationRule, 'filename+size+sha256+associationsByDataKey', '北部权威索引规则错误');
assert.strictEqual(pkg.documentCount, 28, '北部权威索引应有28份报告');
assert.strictEqual(pkg.documents.length, 28, '北部权威索引文档数组应有28份');
assert.strictEqual(pkg.totalBytes, 93379068, '北部材料总字节数错误');
assert.strictEqual(pkg.documents.reduce((sum, doc) => sum + Number(doc.size || 0), 0), pkg.totalBytes, '28份材料大小之和错误');
assert.strictEqual(new Set(pkg.documents.map((doc) => doc.filename)).size, 28, '北部报告文件名有重复');
assert.strictEqual(new Set(pkg.documents.map((doc) => doc.physicalPath)).size, 28, '一份报告必须只有一个物理路径');

const coverage = Object.fromEntries(EXPECTED_KEYS.map((key) => [key, new Set()]));
for (const doc of pkg.documents) {
  assert(doc.filename && /\.docx$/i.test(doc.filename), `文件名错误：${doc.filename}`);
  assert(Number(doc.size) > 0, `文件大小错误：${doc.filename}`);
  assert(/^[a-f0-9]{64}$/.test(doc.sha256), `SHA-256错误：${doc.filename}`);
  assert.strictEqual(doc.batch, '第一轮', `批次错误：${doc.filename}`);
  assert.deepStrictEqual(doc.dataKeys, EXPECTED_KEYS, `成果范围错误：${doc.filename}`);
  assert(Array.isArray(doc.targets) && doc.targets.length > 0, `来源地区为空：${doc.filename}`);
  assert(doc.physicalPath.endsWith('/' + doc.filename), `物理路径未复用原文件名：${doc.filename}`);
  assert(doc.associationsByDataKey, `缺少associationsByDataKey：${doc.filename}`);
  for (const key of EXPECTED_KEYS) {
    const associations = doc.associationsByDataKey[key];
    assert(Array.isArray(associations) && associations.length > 0, `缺少${key}任务关联：${doc.filename}`);
    for (const item of associations) {
      assert(item.city && item.unit && item.district, `关联信息不完整：${doc.filename} / ${key}`);
      assert(doc.targets.includes(item.sourceTarget), `sourceTarget不在原始文件地区列表：${doc.filename} / ${item.sourceTarget}`);
      coverage[key].add([item.city,item.unit,item.district].join('|'));
    }
  }
}

assert.strictEqual(coverage.soilType.size, 72, '土壤类型图北部权威任务覆盖应为72');
for (const key of EXPECTED_KEYS.slice(1)) assert.strictEqual(coverage[key].size, 75, `${key}北部权威任务覆盖应为75`);

const cross = pkg.documents.find((doc) => doc.filename.startsWith('安国市、博野县、蠡县、三河市'));
assert(cross, '未找到安国市跨市共享报告');
assert.strictEqual(cross.targets.length, 9, '安国市跨市共享报告应有9个来源地区');
assert.strictEqual(cross.associationsByDataKey.soilType.length, 8, '安国市跨市共享报告土壤类型图应折叠为8个实际任务');
assert.strictEqual(cross.associationsByDataKey.soilAttr.length, 9, '安国市跨市共享报告其他成果应有9个实际任务');
assert(cross.associationsByDataKey.soilType.some((x) => x.city === '雄安新区' && x.district === '雄安新区'), '跨市报告缺少雄安土壤类型图汇总任务');
assert(!cross.associationsByDataKey.soilType.some((x) => x.district === '容城县'), '土壤类型图容城县不应作为独立任务重复统计');

const xiongan = pkg.documents.find((doc) => doc.filename.startsWith('雄县、安新县'));
assert(xiongan, '未找到雄县、安新县共享报告');
assert.strictEqual(xiongan.associationsByDataKey.soilType.length, 1, '雄县、安新县在土壤类型图应对应一个雄安新区汇总任务');
assert.strictEqual(xiongan.associationsByDataKey.soilAttr.length, 2, '雄县、安新县在其他成果应保持两个独立任务');
assert.strictEqual(xiongan.associationsByDataKey.soilType[0].district, '雄安新区');

const complex = pkg.documents.find((doc) => doc.filename.startsWith('康保县、承德市本级'));
assert(complex, '未找到康保县跨承德/张家口报告');
for (const key of EXPECTED_KEYS) {
  const list = complex.associationsByDataKey[key];
  assert(list.some((x) => x.sourceTarget === '合并区' && x.city === '承德市'), `${key} 合并区应属于承德市`);
  assert(list.some((x) => x.sourceTarget === '全市' && x.city === '张家口市'), `${key} 全市应属于张家口市`);
}

const fakeDocument = {readyState:'loading', addEventListener(){}};
const context = {
  window:{},
  document:fakeDocument,
  console,
  CustomEvent:function CustomEvent(){},
};
context.window.window = context.window;
vm.runInNewContext(routingSource, context, {filename:'quality-file-routing.js'});
const router = context.window.SoilQualityFileRouting;
assert(router, '北部路由器未导出');
router.setAuthority(pkg);

for (const doc of [cross, xiongan, complex]) {
  const inspection = router.inspectFile(doc.filename, EXPECTED_KEYS, doc.size);
  assert.strictEqual(inspection.authoritative, true, `权威文件未使用权威索引：${doc.filename}`);
  assert.strictEqual(inspection.unresolved.length, 0, `权威文件不应有未识别任务：${doc.filename}`);
  for (const key of EXPECTED_KEYS) {
    assert.strictEqual(inspection.byKey[key].length, doc.associationsByDataKey[key].length, `路由结果与权威索引不一致：${doc.filename} / ${key}`);
  }
}

const virtualRecord = {
  kind:'quality-control',
  path:cross.physicalPath,
  name:cross.filename,
  batch:'第一轮',
  targets:cross.targets,
  dataKeys:cross.dataKeys,
  associationsByDataKey:cross.associationsByDataKey,
  registeredOnly:true,
  fileAvailable:false,
  associationStatus:'authoritative-confirmed'
};
const expanded = router.expandRecord(virtualRecord);
assert.strictEqual(expanded.length, EXPECTED_KEYS.reduce((sum, key) => sum + cross.associationsByDataKey[key].length, 0), '权威记录展开数量错误');
assert(expanded.every((entry) => entry.registeredOnly && entry.fileAvailable === false), '待归档状态未传递到页面关联');
assert(new Set(expanded.map((entry) => entry.path)).size === 1, '多任务关联不得复制物理文件路径');

assert(!bridgeSource.includes('new MutationObserver'), '北部权威索引桥接不得使用长期MutationObserver');
assert(bridgeSource.includes('一份文件对应多个任务单元是正常关系'), '共享报告预览未明确多任务关系合法');
assert(bridgeSource.includes('已登记·待归档'), '缺少未归档文件的安全显示状态');
assert(bridgeSource.includes('applyAdminQualityIndex'), '权威索引未接入页面统计');
assert(bridgeSource.includes('fileAvailable'), '权威索引未区分实际文件归档状态');

const classifierPos = loader.indexOf('admin-auto-classifier.js');
const authorityPos = loader.indexOf('north-quality-authority-bridge.js');
const adapterPos = loader.indexOf('north-quality-upload-adapter.js');
assert(classifierPos >= 0 && authorityPos > classifierPos && adapterPos > authorityPos, '权威索引桥接加载顺序错误');

console.log('northern authoritative QC association/index/statistics validation passed');
