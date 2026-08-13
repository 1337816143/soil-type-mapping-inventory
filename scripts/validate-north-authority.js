'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const ACTIVE_KEYS = ['soilType','soilAttr','farmland'];
const pkg = JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json', 'utf8'));
const routingSource = fs.readFileSync('quality-file-routing.js', 'utf8');
const bridgeSource = fs.readFileSync('north-quality-authority-bridge.js', 'utf8');
const mobileSource = fs.readFileSync('mobile-file-picker-fix.js', 'utf8');
const adapterSource = fs.readFileSync('north-quality-upload-adapter.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');

assert.strictEqual(pkg.schemaVersion, 2, '北部权威索引schemaVersion错误');
assert.strictEqual(pkg.associationStatus, 'authoritative-confirmed', '北部权威索引状态错误');
assert.strictEqual(pkg.documentCount, 28, '北部权威索引应有28份报告');
assert.strictEqual(pkg.documents.length, 28, '北部权威索引文档数组应有28份');
assert.strictEqual(pkg.totalBytes, 93379068, '北部材料总字节数错误');
assert.strictEqual(pkg.documents.reduce((sum, doc) => sum + Number(doc.size || 0), 0), pkg.totalBytes, '28份材料大小之和错误');
assert.strictEqual(new Set(pkg.documents.map((doc) => doc.filename)).size, 28, '北部报告文件名有重复');
assert.strictEqual(new Set(pkg.documents.map((doc) => doc.physicalPath)).size, 28, '一份报告必须只有一个物理路径');

for (const doc of pkg.documents) {
  assert(doc.filename && /\.docx$/i.test(doc.filename), `文件名错误：${doc.filename}`);
  assert(Number(doc.size) > 0, `文件大小错误：${doc.filename}`);
  assert(/^[a-f0-9]{64}$/.test(doc.sha256), `SHA-256错误：${doc.filename}`);
  assert.strictEqual(doc.batch, '第一轮', `批次错误：${doc.filename}`);
  assert(Array.isArray(doc.targets) && doc.targets.length > 0, `来源地区为空：${doc.filename}`);
  assert(doc.physicalPath.endsWith('/' + doc.filename), `物理路径未复用原文件名：${doc.filename}`);
  assert(doc.associationsByDataKey, `缺少associationsByDataKey：${doc.filename}`);
  for (const key of ACTIVE_KEYS) {
    const associations = doc.associationsByDataKey[key];
    assert(Array.isArray(associations) && associations.length > 0, `缺少${key}任务关联：${doc.filename}`);
    for (const item of associations) {
      assert(item.city && item.unit && item.district, `关联信息不完整：${doc.filename} / ${key}`);
      assert(doc.targets.includes(item.sourceTarget), `sourceTarget不在原始文件地区列表：${doc.filename} / ${item.sourceTarget}`);
    }
  }
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
const scoped = router.setAuthority(pkg);
assert.deepStrictEqual(Array.from(router.coveredKeys), ACTIVE_KEYS, '北部综合质控活动成果范围不是3类');
assert.deepStrictEqual(Array.from(scoped.activeDataKeys), ACTIVE_KEYS, '北部权威索引运行时未收敛到3类成果');
assert(scoped.documents.every((doc) => JSON.stringify(Array.from(doc.dataKeys)) === JSON.stringify(ACTIVE_KEYS)), '至少一份北部报告仍携带未确认成果类型');
assert(scoped.documents.every((doc) => Object.keys(doc.associationsByDataKey).every((key) => ACTIVE_KEYS.includes(key))), '运行时权威关联仍存在后续未确认成果类型');

const coverage = Object.fromEntries(ACTIVE_KEYS.map((key) => [key, new Set()]));
for (const doc of scoped.documents) {
  for (const key of ACTIVE_KEYS) {
    for (const item of doc.associationsByDataKey[key]) coverage[key].add([item.city,item.unit,item.district].join('|'));
  }
}
assert.strictEqual(coverage.soilType.size, 72, '土壤类型图北部权威任务覆盖应为72');
assert.strictEqual(coverage.soilAttr.size, 75, '土壤属性图北部权威任务覆盖应为75');
assert.strictEqual(coverage.farmland.size, 75, '耕地质量等级评价北部权威任务覆盖应为75');

const cross = scoped.documents.find((doc) => doc.filename.startsWith('安国市、博野县、蠡县、三河市'));
assert(cross, '未找到安国市跨市共享报告');
assert.strictEqual(cross.targets.length, 9, '安国市跨市共享报告应有9个来源地区');
assert.strictEqual(cross.associationsByDataKey.soilType.length, 8, '安国市跨市共享报告土壤类型图应折叠为8个实际任务');
assert.strictEqual(cross.associationsByDataKey.soilAttr.length, 9, '安国市跨市共享报告土壤属性图应有9个实际任务');
assert.strictEqual(cross.associationsByDataKey.farmland.length, 9, '安国市跨市共享报告耕地质量评价应有9个实际任务');
assert(cross.associationsByDataKey.soilType.some((x) => x.city === '雄安新区' && x.district === '雄安新区'), '跨市报告缺少雄安土壤类型图汇总任务');
assert(!cross.associationsByDataKey.soilType.some((x) => x.district === '容城县'), '土壤类型图容城县不应作为独立任务重复统计');

const xiongan = scoped.documents.find((doc) => doc.filename.startsWith('雄县、安新县'));
assert(xiongan, '未找到雄县、安新县共享报告');
assert.strictEqual(xiongan.associationsByDataKey.soilType.length, 1, '雄县、安新县在土壤类型图应对应一个雄安新区汇总任务');
assert.strictEqual(xiongan.associationsByDataKey.soilAttr.length, 2, '雄县、安新县属性图应保持两个独立任务');
assert.strictEqual(xiongan.associationsByDataKey.farmland.length, 2, '雄县、安新县耕地质量评价应保持两个独立任务');

for (const doc of [cross, xiongan]) {
  const inspection = router.inspectFile(doc.filename, ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability'], doc.size);
  assert.strictEqual(inspection.authoritative, true, `权威文件未使用权威索引：${doc.filename}`);
  assert.strictEqual(inspection.unresolved.length, 0, `权威文件不应有未识别任务：${doc.filename}`);
  assert.deepStrictEqual(Array.from(inspection.dataKeys), ACTIVE_KEYS, `权威文件仍扩展到未确认成果：${doc.filename}`);
}

const expanded = router.expandRecord({
  kind:'quality-control',
  path:cross.physicalPath,
  name:cross.filename,
  batch:'第一轮',
  targets:cross.targets,
  dataKeys:pkg.documents.find((doc) => doc.filename === cross.filename).dataKeys,
  associationsByDataKey:pkg.documents.find((doc) => doc.filename === cross.filename).associationsByDataKey,
  registeredOnly:true,
  fileAvailable:false,
  associationStatus:'authoritative-confirmed'
});
assert.strictEqual(expanded.length, ACTIVE_KEYS.reduce((sum, key) => sum + cross.associationsByDataKey[key].length, 0), '权威记录展开数量应只包含3类成果');
assert.strictEqual(new Set(expanded.map((entry) => entry.dataKey)).size, 3, '权威记录仍展开了后续未确认成果');
assert(expanded.every((entry) => entry.registeredOnly && entry.fileAvailable === false), '待归档状态未传递到页面关联');
assert(new Set(expanded.map((entry) => entry.path)).size === 1, '多任务关联不得复制物理文件路径');

assert(!bridgeSource.includes('new MutationObserver'), '北部权威索引桥接不得使用长期MutationObserver');
assert(bridgeSource.includes('3类主要成果'), '页面没有明确北部当前只确认3类成果');
assert(bridgeSource.includes('归档信息完整，可直接上传'), '共享报告匹配成功后仍可能显示归档信息不完整');
assert(bridgeSource.includes('applyAdminQualityIndex'), '权威索引未接入页面统计');
assert(adapterSource.includes('findAuthority(file.name, file.size)'), '北部上传适配器没有按文件名+大小重新匹配权威索引');
assert(adapterSource.includes('归档信息完整'), '北部上传适配器未把成功匹配标记为归档完整');
assert(mobileSource.includes('ensureAuthorityReady'), '手机ZIP解析未等待权威索引');
assert(mobileSource.includes('applyItemMetadata'), '手机ZIP解压后未逐项重新识别');

const classifierPos = loader.indexOf('admin-auto-classifier.js');
const authorityPos = loader.indexOf('north-quality-authority-bridge.js');
const adapterPos = loader.indexOf('north-quality-upload-adapter.js');
const mobilePos = loader.indexOf('mobile-file-picker-fix.js');
assert(classifierPos >= 0 && authorityPos > classifierPos && adapterPos > authorityPos && mobilePos > adapterPos, '北部权威索引/手机ZIP模块加载顺序错误');

console.log('northern authoritative QC validation passed: 28 files, 3 active result types, mobile ZIP reclassification, complete shared metadata');
