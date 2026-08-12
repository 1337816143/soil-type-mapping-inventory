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
const expectedKeys = ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability'];
assert.deepStrictEqual(Array.from(router.coveredKeys), expectedKeys, '综合质控报告成果类型范围错误');
assert(!router.coveredKeys.includes('landUse'), '综合质控报告不应自动关联土地资源评价与利用报告');

router.setAuthority(pkg);
pkg.documents.forEach((doc) => {
  assert.strictEqual(doc.batch, '第一轮', `${doc.filename} 批次不是第一轮`);
  assert.deepStrictEqual(doc.dataKeys, expectedKeys, `${doc.filename} 成果类型范围不一致`);
  assert.deepStrictEqual(Array.from(router.parseTargets(doc.filename)), doc.targets, `${doc.filename} 来源地区解析错误`);
  const inspection = router.inspectFile(doc.filename, expectedKeys, doc.size);
  assert.strictEqual(inspection.authoritative, true, `${doc.filename} 未采用权威关联`);
  assert.strictEqual(inspection.unresolved.length, 0, `${doc.filename} 权威关联不应存在未解析项`);
  expectedKeys.forEach((key) => {
    assert.strictEqual(inspection.byKey[key].length, doc.associationsByDataKey[key].length,
      `${doc.filename} 在 ${key} 的权威关联数量不正确`);
  });
});

const example = pkg.documents.find(x => x.filename.startsWith('安国市、博野县、蠡县、三河市'));
assert(example, '缺少用户示例文件');
assert.strictEqual(example.targets.length, 9, '用户示例应包含9个来源地区');
const inspection = router.inspectFile(example.filename, expectedKeys, example.size);
assert.strictEqual(inspection.byKey.soilType.length, 8, '用户示例土壤类型图应按雄安汇总口径形成8个实际任务');
assert.strictEqual(inspection.byKey.soilAttr.length, 9, '用户示例其他成果应形成9个实际任务');
const sharedPath = router.sharedStoragePath(example.filename, '第一轮');
const expanded = router.expandRecord({
  kind:'quality-control', dataKeys:example.dataKeys, targets:example.targets,
  associationsByDataKey:example.associationsByDataKey,
  batch:'第一轮', path:sharedPath, name:example.filename, registeredOnly:true, fileAvailable:false
});
const expectedExpanded = expectedKeys.reduce((sum, key) => sum + example.associationsByDataKey[key].length, 0);
assert.strictEqual(expanded.length, expectedExpanded, '用户示例页面关联数量应服从权威索引而非简单9×6');
assert.strictEqual(new Set(expanded.map(x => x.path)).size, 1, '共享报告所有页面关联必须引用同一物理文件');

const xiongan = pkg.documents.find(x => x.filename.startsWith('雄县、安新县'));
const xi = router.inspectFile(xiongan.filename, expectedKeys, xiongan.size);
assert.strictEqual(xi.byKey.soilType.length, 1, '雄县、安新县土壤类型图应折叠到雄安新区一个汇总任务');
assert.strictEqual(xi.byKey.soilAttr.length, 2, '雄县、安新县其他成果应保持两个独立任务');
assert.strictEqual(xi.byKey.soilType[0].district, '雄安新区');

const mixedDoc = pkg.documents.find(x => x.filename.startsWith('康保县、承德市本级'));
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

console.log('northern authoritative shared quality routing validation passed: 28 files, multi-task associations, one physical path per report');
