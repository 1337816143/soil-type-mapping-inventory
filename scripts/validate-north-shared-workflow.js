'use strict';

const assert = require('assert');
const fs = require('fs');

const hybrid = fs.readFileSync('hybrid-staged-upload.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/import-chunked.yml', 'utf8');
const dashboard = fs.readFileSync('dashboard-extension.js', 'utf8');
const adapter = fs.readFileSync('north-quality-upload-adapter.js', 'utf8');
const classifier = fs.readFileSync('admin-auto-classifier.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('data/north-quality-feedback-package.json', 'utf8'));

assert(hybrid.includes('router.sharedStoragePath'), '共享报告未使用单一物理存储路径');
assert(hybrid.includes('shared: true'), '上传清单未标记共享报告');
assert(hybrid.includes('dataKeys: shared.dataKeys.slice()'), '上传清单未记录共享报告成果类型');
assert(hybrid.includes('targets: shared.targets.slice()'), '上传清单未记录文件名中的关联地区');
assert(workflow.includes("if quality.get('shared')"), 'Actions归档未识别共享报告');
assert(workflow.includes("'sharedSource': True"), 'Actions归档未写入共享索引标记');
assert(workflow.includes("'dataKeys': data_keys"), 'Actions归档未保存成果类型列表');
assert(workflow.includes("'targets': targets"), 'Actions归档未保存地区列表');
assert(dashboard.includes('expandRecord(entry)'), '页面未把紧凑共享索引展开为多个统计关联');
assert(dashboard.includes('associationKey(entry)'), '页面仍可能按物理路径去重掉共享关联');
assert(adapter.includes('loadZip()'), '管理员上传未支持北部ZIP解析');
assert(adapter.includes('仓库仅保存1份'), '上传预览未明确共享存储规则');
assert(!adapter.includes('new MutationObserver'), '北部上传适配器不得长期监听预览DOM');
assert(classifier.includes('north-package-registry'), '北部上传未接入预登记材料表');
assert.strictEqual(pkg.associationStatus, 'pre-associated', '北部28份材料未预关联');
assert.strictEqual(pkg.importDefaults.batch, '第一轮', '北部材料默认批次应为第一轮');

console.log('northern shared QC registry/upload/index/dashboard workflow validation passed');
