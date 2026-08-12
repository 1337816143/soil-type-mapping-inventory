'use strict';

const assert = require('assert');
const fs = require('fs');

const hybrid = fs.readFileSync('hybrid-staged-upload.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/import-chunked.yml', 'utf8');
const dashboard = fs.readFileSync('dashboard-extension.js', 'utf8');
const adapter = fs.readFileSync('north-quality-upload-adapter.js', 'utf8');

assert(hybrid.includes('router.sharedStoragePath'), '共享报告未使用单一物理存储路径');
assert(hybrid.includes('shared: true'), '上传清单未标记共享报告');
assert(hybrid.includes('dataKeys: shared.dataKeys.slice()'), '上传清单未记录6类成果');
assert(hybrid.includes('targets: shared.targets.slice()'), '上传清单未记录文件名中的关联地区');
assert(workflow.includes("if quality.get('shared')"), 'Actions归档未识别共享报告');
assert(workflow.includes("'sharedSource': True"), 'Actions归档未写入共享索引标记');
assert(workflow.includes("'dataKeys': data_keys"), 'Actions归档未保存成果类型列表');
assert(workflow.includes("'targets': targets"), 'Actions归档未保存地区列表');
assert(dashboard.includes('expandRecord(entry)'), '页面未把紧凑共享索引展开为多个统计关联');
assert(dashboard.includes('associationKey(entry)'), '页面仍可能按物理路径去重掉共享关联');
assert(adapter.includes('loadZip()'), '管理员上传未支持北部ZIP解析');
assert(adapter.includes("batch:'第一轮'"), '北部ZIP导入未设置第一轮批次');
assert(adapter.includes('仓库仅保存1份'), '上传预览未明确共享存储规则');

console.log('northern shared QC upload/index/dashboard workflow validation passed');
