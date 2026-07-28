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

fs.writeFileSync(versionPath, `${next}\n`, 'utf8');
replace('upload-config.js', /window\.SOIL_RELEASE_VERSION = 'v\d+\.\d+\.\d+';/, `window.SOIL_RELEASE_VERSION = '${next}';`);
replace('upload-config.js', /window\.SOIL_APP_VERSION = 'v\d+\.\d+\.\d+';/, `window.SOIL_APP_VERSION = '${next}';`);
replace('app-release-ui.js', /var VERSION = 'v\d+\.\d+\.\d+';/, `var VERSION = '${next}';`);
replace('app-version-guard.js', /\|\| 'v\d+\.\d+\.\d+'/, `|| '${next}'`);
replace('page-enhancements.js', /app-release-ui\.js\?v=\d+\.\d+\.\d+/, `app-release-ui.js?v=${bare}`);
replace('page-enhancements.js', /app-version-guard\.js\?v=\d+\.\d+\.\d+/, `app-version-guard.js?v=${bare}`);
replace('page-enhancements.js', /repository-manifest-loader\.js\?v=\d+\.\d+\.\d+/, `repository-manifest-loader.js?v=${bare}`);
replace('page-enhancements.js', /admin-delete-manager\.js\?v=\d+\.\d+\.\d+/, `admin-delete-manager.js?v=${bare}`);

console.log(`${current} -> ${next}`);
console.log('请在 CHANGELOG.md 顶部补充本次变更说明后再提交。');
