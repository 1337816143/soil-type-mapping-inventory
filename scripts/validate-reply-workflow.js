'use strict';

const assert = require('assert');
const workflow = require('../reply-workflow-core.js');

const actualFile = '沧州市_易景科技（天津）股份有限公司_孟村回族自治县_批次-第一批_整改答复_20260728095114.pdf';
const expectedKey = workflow.replyKey(
  '沧州市',
  '易景科技（天津）股份有限公司',
  '孟村回族自治县',
  '第一批'
);

const index = workflow.buildIndex([actualFile]);
assert(index[expectedKey], '真实已上传答复未匹配到页面位置');
assert.strictEqual(index[expectedKey].file, actualFile, '真实答复文件路径不正确');
assert.strictEqual(index[expectedKey].batch, '第一批', '答复批次解析错误');

const variantKey = workflow.replyKey(
  ' 沧州市（市级） ',
  '易景科技（天津） 股份有限公司',
  ' 孟村回族自治县 ',
  ' 第一批 '
);
assert.strictEqual(variantKey, expectedKey, '空格或市级标记导致页面位置匹配失败');

const olderFile = '沧州市_易景科技（天津）股份有限公司_孟村回族自治县_批次-第一批_整改答复_20260728090000.pdf';
const newerIndex = workflow.buildIndex([olderFile, actualFile]);
assert.strictEqual(newerIndex[expectedKey].file, actualFile, '未选择同批次中时间最新的答复');

const legacyFile = '沧州市_易景科技（天津）股份有限公司_孟村回族自治县_整改答复_202607251044.pdf';
const legacyKey = workflow.replyKey(
  '沧州市',
  '易景科技（天津）股份有限公司',
  '孟村回族自治县',
  ''
);
const legacyIndex = workflow.buildIndex([legacyFile]);
assert(legacyIndex[legacyKey], '历史未标批次答复兼容失败');
assert.strictEqual(legacyIndex[legacyKey].legacy, true, '历史答复未标记为兼容记录');

assert.strictEqual(
  workflow.parseReplyFilename('not-a-reply.pdf'),
  null,
  '非答复文件不应进入答复索引'
);

console.log('reply workflow validation passed');
