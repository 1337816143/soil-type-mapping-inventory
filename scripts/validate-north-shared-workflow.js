'use strict';

const assert = require('assert');
const fs = require('fs');

const hybrid = fs.readFileSync('hybrid-staged-upload.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/import-chunked.yml', 'utf8');
const dashboard = fs.readFileSync('dashboard-extension.js', 'utf8');
const adapter = fs.readFileSync('north-quality-upload-adapter.js', 'utf8');
const classifier = fs.readFileSync('admin-auto-classifier.js', 'utf8');
const bridge = fs.readFileSync('north-quality-authority-bridge.js', 'utf8');
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
assert(classifier.includes('north-package-registry'), '北部上传未接入登记材料表');
assert.strictEqual(pkg.associationStatus, 'authoritative-confirmed', '北部28份材料未升级为权威确认关联');
assert(pkg.importDefaults && pkg.importDefaults.authoritativeAssociations, '北部权威关联未设为自动导入依据');
assert.strictEqual(pkg.importDefaults.batch, '第一轮', '北部材料默认批次应为第一轮');
assert(bridge.includes('applyAdminQualityIndex(records)'), '权威登记索引未同步到页面统计');
assert(bridge.includes('已登记·待归档'), '尚未归档的物理文件未区分展示状态');
assert(bridge.includes('一份文件对应多个任务单元是正常关系'), '共享报告仍可能被错误要求唯一任务单元');
assert(!bridge.includes('new MutationObserver'), '权威索引桥接不得引入长期DOM观察器');

console.log('northern shared QC authoritative registry/upload/index/dashboard workflow validation passed');
