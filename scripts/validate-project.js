'use strict';

const fs = require('fs');
const vm = require('vm');

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const version = read('VERSION').trim();
if (!/^v\d+\.\d+\.\d+$/.test(version)) fail('VERSION 不符合语义化版本格式');
if (!read('CHANGELOG.md').includes(`## ${version}`)) fail('CHANGELOG.md 缺少当前版本记录');

const uploadConfig = read('upload-config.js');
const releaseUi = read('app-release-ui.js');
const versionGuard = read('app-version-guard.js');
const loader = read('page-enhancements.js');
const manifestLoader = read('repository-manifest-loader.js');
const reference = read('reference-library.js');
const regional = read('regional-progress-dashboard.js');
const dashboard = read('dashboard-extension.js');
const deleteManager = read('admin-delete-manager.js');
const logoPatch = read('soil-survey-logo-v1.0.2.js');
const bareVersion = version.slice(1);

if (!uploadConfig.includes(`window.SOIL_RELEASE_VERSION = '${version}'`)) fail('upload-config.js 发布版本与 VERSION 不一致');
if (!uploadConfig.includes(`window.SOIL_APP_VERSION = '${version}'`)) fail('upload-config.js 页面版本与 VERSION 不一致');
if (!releaseUi.includes(`var VERSION = '${version}'`)) fail('app-release-ui.js 版本号与 VERSION 不一致');
if (!loader.includes(`app-release-ui.js?v=${bareVersion}`)) fail('版本界面脚本未按当前版本加载');
if (!loader.includes(`app-version-guard.js?v=${bareVersion}`)) fail('版本保护脚本未按当前版本加载');
if (!loader.includes(`repository-manifest-loader.js?v=${bareVersion}`)) fail('静态目录清单脚本未按当前版本加载');
if (!loader.includes(`admin-delete-manager.js?v=${bareVersion}`)) fail('管理员删除脚本未按当前版本加载');
if (!versionGuard.includes("window.SOIL_RELEASE_VERSION")) fail('版本保护脚本未以发布版本为准');

const logoMatch = logoPatch.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
if (!logoMatch || logoMatch[1].length < 8000 || !logoMatch[1].startsWith('iVBORw0KGgo')) fail('新三普Logo PNG数据不完整');
if (!logoPatch.includes('transform:none!important')) fail('新三普Logo仍可能被旧裁切规则截断');

if (!manifestLoader.includes("./data/repository-tree.json")) fail('静态目录清单路径未配置');
if (!manifestLoader.includes('loadManifest')) fail('静态目录清单加载逻辑缺失');
if (!manifestLoader.includes('force && String(window.SOIL_GITHUB_UPLOAD_TOKEN')) fail('管理员实时目录刷新未要求认证凭证');
if (!manifestLoader.includes('loadAuthenticatedApiTree().catch')) fail('实时目录请求缺少静态清单回退');
if (!fs.existsSync('scripts/build-repository-manifest.py')) fail('缺少 Pages 目录清单生成脚本');
if (!fs.existsSync('scripts/bump-version.js')) fail('缺少版本自动迭代脚本');
if (!fs.existsSync('VERSIONING.md')) fail('缺少版本迭代规则');

const requiredCategories = [
  '土壤类型图',
  '土壤属性图',
  '耕地质量等级评价',
  '土壤退化与障碍分析',
  '土特产品土壤适宜性评价',
  '土壤农业利用适宜性评价',
  '土地资源评价与利用报告'
];
let lastPosition = reference.indexOf('var CATEGORY_ORDER');
requiredCategories.forEach((name) => {
  const position = reference.indexOf(`'${name}'`, lastPosition);
  if (position < 0) fail(`参考文件缺少标准分组：${name}`);
  if (position < lastPosition) fail('参考文件标准分组顺序错误');
  lastPosition = position;
});
if (!releaseUi.includes('group.open = false')) fail('参考文件分组未设置默认收起');
if (!releaseUi.includes('__unitDeduplicated')) fail('城市作业单位徽标未启用去重');
if (!releaseUi.includes('家单位（去重）')) fail('城市作业单位去重口径未标明');
if (!regional.includes("progressChip('区县'")) fail('片区摘要缺少区县统计块');
if (!regional.includes('expectedUnitKeys:new Set()') || !regional.includes('receivedUnitKeys:new Set()')) {
  fail('作业单位统计未采用集合去重');
}
if (!regional.includes('作业单位（去重）')) fail('页面未明确标注作业单位去重口径');
if (!regional.includes('土特产品土壤适宜性评价') || !dashboard.includes('土特产品土壤适宜性评价')) fail('土特产品成果名称未统一');
const categoryBlock = reference.slice(reference.indexOf('var CATEGORY_ORDER'), reference.indexOf('];', reference.indexOf('var CATEGORY_ORDER')));
if (categoryBlock.includes("'土特产品适宜性评价'")) fail('参考文件仍包含旧的多余标准分组');
if (!reference.includes("compact.indexOf('土特产品适宜性评价')")) fail('旧参考目录未兼容归入新分组');
if (!deleteManager.includes('sha:null') || !deleteManager.includes('data/admin-import-index.json')) fail('管理员删除未实现事务删除与索引同步');
if (!deleteManager.includes('质控意见') || !deleteManager.includes('整改答复') || !deleteManager.includes('参考文件')) fail('管理员删除类型不完整');

const orderedScripts = [
  'page-enhancements-core.js',
  'task-unit-mappings.js',
  'regional-progress-dashboard.js',
  'dashboard-extension.js',
  'reference-library.js',
  'repository-manifest-loader.js',
  'app-release-ui.js',
  'soil-survey-logo-v1.0.2.js',
  'app-version-guard.js',
  'upload-auth-reply-batch.js',
  'admin-delete-manager.js'
];
const positions = orderedScripts.map((name) => loader.indexOf(name));
if (positions.some((position) => position < 0) || positions.some((position, index) => index && position < positions[index - 1])) {
  fail('页面脚本加载顺序错误');
}

const banner = {style:{}, innerHTML:''};
const documentStub = {
  readyState:'complete',
  head:{appendChild(){}},
  createElement(tag) {
    if (tag === 'style') return {id:'', textContent:''};
    return {innerHTML:'', querySelector(){ return null; }};
  },
  getElementById(id) {
    if (id === 'missingBanner') return banner;
    return null;
  },
  querySelector(selector) {
    if (selector === '.tab.active') return {getAttribute(){ return 'soilType'; }};
    return null;
  }
};

const context = {
  console,
  Set,
  document:documentStub,
  window:null,
  masterList:[],
  renderCities(){ return ''; },
  refreshAllTabs(){},
  collectSubmittedDistricts(){ return []; },
  isMunicipalTask(){ return false; },
  isDistrictMatched(){ return false; },
  SoilTaskUnitLists:{
    soilType:[
      {city:'定州市',items:[{unit:'重复测试单位',districts:['定州市']}]},
      {city:'辛集市',items:[
        {unit:'重复测试单位',districts:['辛集市']},
        {unit:'联合甲（牵头人） / 联合乙',districts:['测试区']}
      ]}
    ],
    other:[]
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(regional, context, {filename:'regional-progress-dashboard.js'});

const totals = context.SoilRegionalProgress.calculate('soilType').overall;
if (totals.expUnits !== 3) fail(`作业单位去重测试失败，应为3，实际为${totals.expUnits}`);
if (totals.totalUnits !== 0) fail('未提交成果时作业单位已收数应为0');

context.renderMissingBanner('soilType');
const chipCount = (banner.innerHTML.match(/regional-progress-chip/g) || []).length;
if (chipCount !== 8) fail(`南北片区应各有4个统计块，实际共${chipCount}个`);
if (!banner.innerHTML.includes('区县')) fail('渲染结果中缺少区县统计');

const legacyReplies = [];
if (fs.existsSync('replies')) {
  const walk = (dir) => fs.readdirSync(dir, {withFileTypes:true}).forEach((entry) => {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(full);
    if (/^(.*)_整改答复_([0-9]+)\.([a-z0-9]+)$/i.test(entry.name) && !entry.name.includes('_批次-')) {
      legacyReplies.push(full);
    }
  });
  walk('replies');
}
if (legacyReplies.length) fail(`检测到历史未标批次文件：\n${legacyReplies.join('\n')}`);

console.log(`project validation passed (${version})`);
