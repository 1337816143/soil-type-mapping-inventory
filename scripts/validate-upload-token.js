'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('upload-config.js', 'utf8');
const match = source.match(/var tokenCodes = \[([0-9,\s]+)\]/);
assert(match, 'upload-config.js 中未找到内置 Token 数据');
const token = String.fromCharCode(...match[1].split(',').map((value) => Number(value.trim())));
assert(token.startsWith('github_pat_'), '内置 Token 前缀错误');
assert(token.length >= 60, '内置 Token 长度异常');
assert(source.includes('savedToken || window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN'), '未配置内置 Token 回退');
console.log('embedded upload token validation passed');
