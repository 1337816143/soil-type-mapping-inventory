'use strict';

const fs = require('fs');

const level = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(level)) {
  throw new Error('用法：node scripts/bump-version.js [patch|minor|major]');
}

const versionPath = 'VERSION';
const current = fs.readFileSync(versionPath, 'utf8').trim();
const match = current.match(/^v(\d+)\.(\d+)\.(\d+)$/);
if (!match) throw new Error(`当前版本格式无效：${current}`);

let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);
if (level === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (level === 'minor') {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const next = `v${major}.${minor}.${patch}`;
const bare = next.slice(1);

function replace(path, pattern, replacement) {
  const before = fs.readFileSync(path, 'utf8');
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`${path} 未找到版本字段`);
  fs.writeFileSync(path, after, 'utf8');
}

function replaceLoaderVersion(scriptName) {
  const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  replace(
    'page-enhancements.js',
    new RegExp(escaped + '\\?v=\\d+\\.\\d+\\.\\d+(?:&build=\\d+)?'),
    `${scriptName}?v=${bare}`
  );
}

fs.writeFileSync(versionPath, `${next}\n`, 'utf8');
replace('upload-config.js', /window\.SOIL_RELEASE_VERSION = 'v\d+\.\d+\.\d+';/, `window.SOIL_RELEASE_VERSION = '${next}';`);
replace('upload-config.js', /window\.SOIL_APP_VERSION = 'v\d+\.\d+\.\d+';/, `window.SOIL_APP_VERSION = '${next}';`);
replace('upload-config.js', /page-enhancements\.js\?v=\d+\.\d+\.\d+(?:&build=\d+)?/, `page-enhancements.js?v=${bare}`);
replace('app-release-ui.js', /var VERSION = 'v\d+\.\d+\.\d+';/, `var VERSION = '${next}';`);
replace('app-version-guard.js', /\|\| 'v\d+\.\d+\.\d+'/, `|| '${next}'`);
replace('page-enhancements.js', /var VERSION = '\d+\.\d+\.\d+';/, `var VERSION = '${bare}';`);

[
  'page-enhancements-core.js',
  'task-unit-mappings.js',
  'quality-file-routing.js',
  'regional-progress-dashboard.js',
  'dashboard-extension.js',
  'reference-library.js',
  'repository-manifest-loader.js',
  'app-release-ui.js',
  'soil-survey-logo-v1.0.2.js',
  'app-version-guard.js',
  'admin-quality-ui.js',
  'admin-quality-upload.js',
  'admin-import-v2.js',
  'admin-import-v2-bridge.js',
  'admin-auto-classifier.js',
  'north-quality-upload-adapter.js',
  'reference-import-mode.js',
  'upload-token-default.js',
  'reply-workflow-core.js',
  'upload-auth-reply-batch.js',
  'reply-upload-progress.js',
  'admin-delete-manager.js',
  'pptx-auto-split.js',
  'admin-upload-transport-fix.js',
  'hybrid-staged-upload.js',
  'upload-success-notice.js'
].forEach(replaceLoaderVersion);

console.log(`${current} -> ${next}`);
console.log('请在 CHANGELOG.md 顶部补充本次变更说明后再提交。');
