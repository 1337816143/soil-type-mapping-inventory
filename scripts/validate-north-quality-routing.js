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
  city('保定市', ['安国市','博野县','蠡县','容城县','定兴县','徐水区','满城区','合并区','市级汇总','曲阳县','望都县','清苑区','高阳县','涞水县','涞源县','顺平县','易县','阜平县','唐县','高碑店市','涿州市']),
  city('雄安新区', ['雄安新区','雄县','安新县']),
  city('张家口市', ['阳原县','康保县','张家口市','赤城县','沽源县','张北县','尚义县','万全区','崇礼区','怀安县','宣化区','合并区','蔚县','涿鹿县','怀来县']),
  city('承德市', ['承德市','合并区','丰宁县','宽城县','平泉市','承德县','兴隆县','滦平县','隆化县']),
  city('定州市', ['定州市']),
  city('辛集市', ['辛集市']),
  city('秦皇岛市', ['昌黎县','合并区','青龙县','抚宁区','卢龙县'])
];

const context = {
  console,
  window:{SoilTaskUnitLists:{soilType:mapping, other:mapping}, masterList:mapping}
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, {filename:'quality-file-routing.js'});
const router = context.window.SoilQualityFileRouting;
assert(router, '北部质控文件路由器未安装');

assert.strictEqual(pkg.documentCount, 28, '北部质控包应包含28份报告');
assert.strictEqual(pkg.documents.length, 28, '北部质控包文档数量不一致');
assert.strictEqual(pkg.totalBytes, 93379068, '北部质控包总字节数不一致');
assert.strictEqual(new Set(pkg.documents.map(x => x.filename)).size, 28, '北部质控包文件名存在重复');
assert.strictEqual(pkg.documents.reduce((sum, x) => sum + x.size, 0), pkg.totalBytes, '北部质控包文件大小汇总不一致');

const expectedKeys = ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability'];
assert.deepStrictEqual(Array.from(router.coveredKeys), expectedKeys, '综合质控报告成果类型范围错误');
assert(!router.coveredKeys.includes('landUse'), '综合质控报告不应自动关联土地资源评价与利用报告');

pkg.documents.forEach((doc) => {
  assert.strictEqual(doc.batch, '第一轮', `${doc.filename} 批次不是第一轮`);
  assert.deepStrictEqual(doc.dataKeys, expectedKeys, `${doc.filename} 成果类型范围不一致`);
  const parsed = Array.from(router.parseTargets(doc.filename));
  assert.deepStrictEqual(parsed, doc.targets, `${doc.filename} 文件名目标解析错误`);
  const inspection = router.inspectFile(doc.filename, expectedKeys);
  assert.strictEqual(inspection.unresolved.length, 0,
    `${doc.filename} 存在未解析任务单元：${JSON.stringify(inspection.unresolved)}`);
  expectedKeys.forEach((key) => {
    assert.strictEqual(inspection.byKey[key].length, doc.targets.length,
      `${doc.filename} 在 ${key} 的关联数量不正确`);
  });
});

const example = pkg.documents.find(x => x.filename.startsWith('安国市、博野县、蠡县、三河市'));
assert(example, '缺少用户示例文件');
assert.strictEqual(example.targets.length, 9, '用户示例应对应9个地区');
const sharedPath = router.sharedStoragePath(example.filename, '第一轮');
assert(sharedPath.startsWith('data/质控意见反馈_管理员导入/北部片区共享质控/第一轮/'), '共享文件存储路径错误');
const expanded = router.expandRecord({
  kind:'quality-control',
  dataKeys:expectedKeys,
  targets:example.targets,
  batch:'第一轮',
  path:sharedPath,
  name:example.filename,
  uploadedAt:'2026-08-12T04:33:00Z'
});
assert.strictEqual(expanded.length, 54, '用户示例应扩展为9个任务单元×6类成果的54个页面关联');
assert.strictEqual(new Set(expanded.map(x => x.path)).size, 1, '共享报告在页面关联中必须始终引用同一个物理文件');

const mixed = router.inspectFile('康保县、承德市本级、合并区、丰宁县、全市及赤城县、沽源县第三次全国土壤普查成果质控报告--以康保县为例.docx', ['soilType']);
assert.strictEqual(mixed.unresolved.length, 0, '跨承德/张家口混合文件未正确解析');
const mixedRows = mixed.byKey.soilType;
assert(mixedRows.some(x => x.city === '承德市' && x.district === '合并区'), '承德合并区上下文识别错误');
assert(mixedRows.some(x => x.city === '张家口市' && x.district === '张家口市'), '“全市”未按右侧赤城县识别为张家口市级');

assert.strictEqual(router.normalizeLabel('徐水县'), '徐水区');
assert.strictEqual(router.normalizeLabel('满城'), '满城区');
assert.strictEqual(router.normalizeLabel('清苑'), '清苑区');
assert.strictEqual(router.normalizeLabel('高阳'), '高阳县');
assert.strictEqual(router.normalizeLabel('顺平'), '顺平县');
assert.strictEqual(router.normalizeLabel('雄安新区本级'), '雄安新区');
assert.strictEqual(router.normalizeLabel('承德市本级'), '承德市');

console.log('northern shared quality routing validation passed: 28 files, 6 result types, one physical file per report');
