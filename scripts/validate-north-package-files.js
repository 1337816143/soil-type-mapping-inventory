'use strict';

const assert = require('assert');
const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json', 'utf8'));
assert.strictEqual(pkg.documentCount, 28, '北部质控包必须登记28份报告');
assert.strictEqual(pkg.documents.length, 28, '北部质控包文档数组数量不一致');
assert.strictEqual(new Set(pkg.documents.map(x => x.filename)).size, 28, '北部质控包文件名不得重复');
assert.strictEqual(pkg.documents.reduce((sum, x) => sum + x.size, 0), pkg.totalBytes, '北部质控包总大小不一致');
pkg.documents.forEach((doc) => {
  assert(/^([a-f0-9]{64})$/.test(doc.sha256), `SHA-256格式错误：${doc.filename}`);
  assert(doc.targets.length >= 1, `缺少关联地区：${doc.filename}`);
  assert.strictEqual(doc.batch, '第一轮', `批次错误：${doc.filename}`);
  assert.deepStrictEqual(doc.dataKeys, ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability'], `成果类型范围错误：${doc.filename}`);
});
console.log(`northern QC package metadata validation passed: ${pkg.documentCount} documents, ${pkg.totalBytes} bytes`);
