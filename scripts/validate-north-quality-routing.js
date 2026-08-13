'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('quality-file-routing.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json', 'utf8'));

function city(name, districts) {
  return {city:name, items:[{unit:name + '测试单位', districts:districts}]};
}

const mapping = [
  city('唐山市', ['乐亭县','丰南区','丰润区','合并区','玉田县','滦南县','曹妃甸区','唐山市','迁西县','遵化市','迁安市']),
  city('廊坊市', ['固安县','霸州市','三河市','大厂县','香河县','安次区','广阳区','文安县','大城县']),
  city('保定市', ['安国市','博野县','蠡县','定兴县','徐水区','满城区','合并区','市级汇总','曲阳县','望都县','清苑区','高阳县','涞水县','涞源县','顺平县','易县','阜平县','唐县','高碑店市','涿州市']),
  city('雄安新区', ['雄安新区','容城县','雄县','安新县']),
  city('张家口市', ['阳原县','康保县','张家口市','赤城县','沽源县','张北县','尚义县','万全区','崇礼区','怀安县','宣化区','合并区','蔚县','涿鹿县','怀来县']),
  city('承德市', ['承德市','合并区','丰宁县','宽城县','平泉市','承德县','兴隆县','滦平县','隆化县']),
  city('定州市', ['定州市']),
  city('辛集市', ['辛集市']),
  city('秦皇岛市', ['昌黎县','合并区','青龙县','抚宁区','卢龙县'])
];

const context = {console, window:{SoilTaskUnitLists:{soilType:mapping, other:mapping}, masterList:mapping}};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, {filename:'quality-file-routing.js'});
const router = context.window.SoilQualityFileRouting;
assert(router, '北部质控文件路由器未安装');

assert.strictEqual(pkg.documentCount, 28, '北部质控包应包含28份报告');
assert.strictEqual(pkg.associationStatus, 'authoritative-confirmed', '北部材料应使用权威关联');
const expectedKeys = ['soilType','soilAttr','farmland'];
assert.deepStrictEqual(Array.from(router.coveredKeys), expectedKeys, '北部综合质控当前应仅对应类型图、属性图、耕地质量等级评价3类成果');
assert(!router.coveredKeys.includes('degradation'), '北部综合报告不应自动关联土壤退化与障碍分析');
assert(!router.coveredKeys.includes('specialty'), '北部综合报告不应自动关联土特产品适宜性评价');
assert(!router.coveredKeys.includes('agriSuitability'), '北部综合报告不应自动关联农业利用适宜性评价');
assert(!router.coveredKeys.includes('landUse'), '北部综合报告不应自动关联土地资源评价与利用报告');

const scoped = router.setAuthority(pkg);
assert.deepStrictEqual(Array.from(scoped.activeDataKeys), expectedKeys, '权威索引未在运行时收敛到3类成果');
scoped.documents.forEach((doc) => {
  assert.strictEqual(doc.batch, '第一轮', `${doc.filename} 批次不是第一轮`);
  assert.deepStrictEqual(Array.from(doc.dataKeys), expectedKeys, `${doc.filename} 运行时成果范围未收敛到3类`);
  assert.deepStrictEqual(Array.from(router.parseTargets(doc.filename)), Array.from(doc.targets), `${doc.filename} 来源地区解析错误`);
  const inspection = router.inspectFile(doc.filename, ['soilType','soilAttr','farmland','degradation'], doc.size);
  assert.strictEqual(inspection.authoritative, true, `${doc.filename} 未采用权威关联`);
  assert.strictEqual(inspection.unresolved.length, 0, `${doc.filename} 权威关联不应存在未解析项`);
  assert.deepStrictEqual(Array.from(inspection.dataKeys), expectedKeys, `${doc.filename} 检查结果仍混入未确认成果类型`);
  expectedKeys.forEach((key) => {
    assert.strictEqual(inspection.byKey[key].length, doc.associationsByDataKey[key].length,
      `${doc.filename} 在 ${key} 的权威关联数量不正确`);
  });
  assert.strictEqual(inspection.byKey.degradation, undefined, `${doc.filename} 不应生成退化成果关联`);
});

const example = scoped.documents.find(x => x.filename.startsWith('安国市、博野县、蠡县、三河市'));
assert(example, '缺少用户示例文件');
assert.strictEqual(example.targets.length, 9, '用户示例应包含9个来源地区');
const inspection = router.inspectFile(example.filename, expectedKeys, example.size);
assert.strictEqual(inspection.byKey.soilType.length, 8, '用户示例土壤类型图应按雄安汇总口径形成8个实际任务');
assert.strictEqual(inspection.byKey.soilAttr.length, 9, '用户示例土壤属性图应形成9个实际任务');
assert.strictEqual(inspection.byKey.farmland.length, 9, '用户示例耕地质量等级评价应形成9个实际任务');
const sharedPath = router.sharedStoragePath(example.filename, '第一轮');
const expanded = router.expandRecord({
  kind:'quality-control', dataKeys:pkg.documents.find(x => x.filename === example.filename).dataKeys, targets:example.targets,
  associationsByDataKey:pkg.documents.find(x => x.filename === example.filename).associationsByDataKey,
  batch:'第一轮', path:sharedPath, name:example.filename, registeredOnly:true, fileAvailable:false
});
const expectedExpanded = expectedKeys.reduce((sum, key) => sum + example.associationsByDataKey[key].length, 0);
assert.strictEqual(expanded.length, expectedExpanded, '共享报告页面关联数量必须只按3类确认成果展开');
assert.strictEqual(new Set(expanded.map(x => x.dataKey)).size, 3, '共享报告不应展开到后续未确认成果类型');
assert.strictEqual(new Set(expanded.map(x => x.path)).size, 1, '共享报告所有页面关联必须引用同一物理文件');

const xiongan = scoped.documents.find(x => x.filename.startsWith('雄县、安新县'));
const xi = router.inspectFile(xiongan.filename, expectedKeys, xiongan.size);
assert.strictEqual(xi.byKey.soilType.length, 1, '雄县、安新县土壤类型图应折叠到雄安新区一个汇总任务');
assert.strictEqual(xi.byKey.soilAttr.length, 2, '雄县、安新县属性图应保持两个独立任务');
assert.strictEqual(xi.byKey.farmland.length, 2, '雄县、安新县耕地质量评价应保持两个独立任务');
assert.strictEqual(xi.byKey.soilType[0].district, '雄安新区');

const mixedDoc = scoped.documents.find(x => x.filename.startsWith('康保县、承德市本级'));
const mixed = router.inspectFile(mixedDoc.filename, ['soilType'], mixedDoc.size);
assert.strictEqual(mixed.unresolved.length, 0, '跨承德/张家口权威文件未正确解析');
assert(mixed.byKey.soilType.some(x => x.sourceTarget === '合并区' && x.city === '承德市'), '承德合并区上下文识别错误');
assert(mixed.byKey.soilType.some(x => x.sourceTarget === '全市' && x.city === '张家口市'), '“全市”应属于张家口市');

assert.strictEqual(router.normalizeLabel('徐水县'), '徐水区');
assert.strictEqual(router.normalizeLabel('满城'), '满城区');
assert.strictEqual(router.normalizeLabel('清苑'), '清苑区');
assert.strictEqual(router.normalizeLabel('高阳'), '高阳县');
assert.strictEqual(router.normalizeLabel('顺平'), '顺平县');
assert.strictEqual(router.normalizeLabel('雄安新区本级'), '雄安新区');
assert.strictEqual(router.normalizeLabel('承德市本级'), '承德市');

console.log('northern QC routing validation passed: 28 files, 3 confirmed result types, multi-task associations, one physical path per report');
