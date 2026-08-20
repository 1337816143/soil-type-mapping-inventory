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
const tokenDefault = read('upload-token-default.js');
const releaseUi = read('app-release-ui.js');
const versionGuard = read('app-version-guard.js');
const loader = read('page-enhancements.js');
const manifestLoader = read('repository-manifest-loader.js');
const referenceUpload = read('reference-upload.js');
const fileAccess = read('file-preview-batch-download.js');
const mobileReference = read('mobile-dialog-reference-batch.js');
const replyCore = read('reply-workflow-core.js');
const replyBatch = read('upload-auth-reply-batch.js');
const successNotice = read('upload-success-notice.js');
const adminUploadTransport = read('admin-upload-transport-fix.js');
const hybridUpload = read('hybrid-staged-upload.js');
const reference = read('reference-library.js');
const regional = read('regional-progress-dashboard.js');
const dashboard = read('dashboard-extension.js');
const deleteManager = read('admin-delete-manager.js');
const logoPatch = read('soil-survey-logo-v1.0.2.js');
const maintenance = read('MAINTENANCE_RULES.md');
const bareVersion = version.slice(1);
const requiredNotice = '上传成功！稍等3~5分钟刷新网站即可查看新上传的文件。';

if (!uploadConfig.includes(`window.SOIL_RELEASE_VERSION = '${version}'`)) fail('upload-config.js 发布版本与 VERSION 不一致');
if (!uploadConfig.includes(`window.SOIL_APP_VERSION = '${version}'`)) fail('upload-config.js 页面版本与 VERSION 不一致');
if (!releaseUi.includes(`var VERSION = '${version}'`)) fail('app-release-ui.js 版本号与 VERSION 不一致');
if (!versionGuard.includes(`|| '${version}'`)) fail('app-version-guard.js 版本号与 VERSION 不一致');
if (!uploadConfig.includes(`page-enhancements.js?v=${bareVersion}`)) fail('主加载器缓存版本未更新');

const tokenCodesMatch = uploadConfig.match(/var tokenCodes = \[([0-9,\s]+)\]/);
if (!tokenCodesMatch) fail('未找到项目所有者要求的内置 Token');
const tokenCodes = tokenCodesMatch[1].split(',').map((value) => Number(value.trim())).filter(Number.isFinite);
const embeddedToken = String.fromCharCode(...tokenCodes);
if (!embeddedToken.startsWith('github_pat_') || embeddedToken.length < 60) fail('内置 GitHub Token 数据不完整');
if (!uploadConfig.includes('savedToken || window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN')) fail('浏览器覆盖为空时未回退内置 Token');
if (uploadConfig.includes("window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN = '';")) fail('内置 Token 被置空');
if (tokenDefault.includes("window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN = '';")) fail('增强脚本会删除内置 Token');
if (!tokenDefault.includes('var defaultToken = String(window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN')) fail('增强脚本未保留内置 Token');
if (!maintenance.includes('不得擅自删除、置空')) fail('维护约束未锁定内置 Token');

[
  'reference-library.js',
  'repository-manifest-loader.js',
  'reference-upload.js',
  'file-preview-batch-download.js',
  'mobile-dialog-reference-batch.js',
  'app-release-ui.js',
  'app-version-guard.js',
  'upload-token-default.js',
  'reply-workflow-core.js',
  'upload-auth-reply-batch.js',
  'reply-upload-progress.js',
  'admin-delete-manager.js',
  'admin-upload-transport-fix.js',
  'hybrid-staged-upload.js',
  'upload-success-notice.js'
].forEach((script) => {
  if (!loader.includes(`${script}?v=${bareVersion}`)) fail(`${script} 未按当前版本加载`);
});
if (loader.includes('reference-import-mode.js')) fail('旧共享参考资料导入保护仍在加载，参考资料与质控上传未彻底隔离');

const orderedScripts = [
  'page-enhancements-core.js',
  'task-unit-mappings.js',
  'regional-progress-dashboard.js',
  'dashboard-extension.js',
  'reference-library.js',
  'repository-manifest-loader.js',
  'reference-upload.js',
  'file-preview-batch-download.js',
  'mobile-dialog-reference-batch.js',
  'app-release-ui.js',
  'soil-survey-logo-v1.0.2.js',
  'app-version-guard.js',
  'upload-token-default.js',
  'reply-workflow-core.js',
  'upload-auth-reply-batch.js',
  'reply-upload-progress.js',
  'admin-delete-manager.js',
  'admin-upload-transport-fix.js',
  'hybrid-staged-upload.js',
  'upload-success-notice.js'
];
const positions = orderedScripts.map((name) => loader.indexOf(name));
if (positions.some((position) => position < 0) || positions.some((position, index) => index && position < positions[index - 1])) {
  fail('页面脚本加载顺序错误');
}

if (!reference.includes('window.openSoilReferenceUpload()')) fail('参考文件管理员入口未切换到独立上传器');
if (reference.includes("openSoilAdminImport({kind: 'reference'")) fail('参考文件管理员入口仍复用质控上传器');
if (referenceUpload.includes('SoilAdminAutoClassifier') || referenceUpload.includes('SoilAdminImport')) fail('参考资料上传器仍依赖质控自动识别/状态');
if (!referenceUpload.includes("var STAGE_ROOT = '.reference-upload';")) fail('参考资料上传未使用独立暂存目录');
if (!referenceUpload.includes("var branch = 'reference-upload-' + uploadId;")) fail('参考资料上传未使用独立分支');
if (!referenceUpload.includes('item.manualDirectory = true') || !referenceUpload.includes('if (!item || item.manualDirectory) return item;')) fail('参考资料人工目录选择可能被自动刷新覆盖');
if (!referenceUpload.includes('window.visualViewport') || !referenceUpload.includes('env(safe-area-inset-top)') || !referenceUpload.includes('env(safe-area-inset-bottom)')) fail('参考资料上传窗口未完整适配手机可视区/安全区');
if (referenceUpload.includes('new MutationObserver')) fail('参考资料独立上传器存在长期 DOM 观察器');
if (!referenceUpload.includes(requiredNotice)) fail('参考资料上传成功提醒缺失');
if (!fs.existsSync('.github/workflows/import-reference.yml')) fail('缺少参考资料专用归档工作流');
if (!fs.existsSync('scripts/validate-reference-upload-isolation.js')) fail('缺少参考资料上传隔离回归测试');

if (!fileAccess.includes('openFilePreview') || !fileAccess.includes('openBatchDownload')) fail('成果文件预览/批量下载模块不完整');
if (!fileAccess.includes('按市选择') || !fileAccess.includes('按作业单位选择') || !fileAccess.includes('按成果类型选择') || !fileAccess.includes('按区县选择')) fail('成果批量下载交叉筛选不完整');
if (!mobileReference.includes('window.visualViewport')) fail('手机弹窗未使用实际可视区域');
if (!mobileReference.includes('env(safe-area-inset-top)') || !mobileReference.includes('env(safe-area-inset-bottom)')) fail('手机弹窗未适配安全区');
if (!mobileReference.includes("button.id = 'ref-batch-download'")) fail('参考资料页缺少公开批量下载按钮');
if (!mobileReference.includes('按成果类型选择') || !mobileReference.includes('下载已选 ZIP')) fail('参考资料批量下载筛选/下载功能不完整');
if (/credPass|ensureAdminToken/.test(mobileReference)) fail('参考资料公开批量下载错误地依赖管理员密码');
if (!maintenance.includes('关闭按钮必须始终固定')) fail('维护约束未锁定手机弹窗关闭按钮可见性');
if (!maintenance.includes('参考资料批量下载')) fail('维护约束未锁定参考资料批量下载');

if (!adminUploadTransport.includes('function normalizeStage(text)')) fail('管理员上传状态缺少统一格式化');
if (!adminUploadTransport.includes('function renderUploadStatus()')) fail('管理员上传状态缺少原位渲染');
if (!adminUploadTransport.includes("'\\n上传进度：'")) fail('管理员上传状态未显示当前百分比');
if (!adminUploadTransport.includes("button.dataset.authReady = '1'")) fail('管理员上传仍可能被重复凭证弹窗拦截');
if (adminUploadTransport.includes('window.fetch = function')) fail('管理员上传仍在全局替换 fetch');
if (adminUploadTransport.includes('new XMLHttpRequest()')) fail('管理员 Git Blob 上传仍被 XHR 接管');
if (adminUploadTransport.includes("tracked.text + '\\n'")) fail('管理员上传状态仍会递归累加旧文本');
if (!hybridUpload.includes("'Authorization': 'Bearer ' + token()")) fail('原始 Git Data API 鉴权链路被改变');
if (!hybridUpload.includes('return fetch(API_ROOT + path')) fail('原始 Git Data API fetch 上传链路被改变');
if (!hybridUpload.includes("return api('/git/blobs'")) fail('原始 Git Blob 创建接口被改变');
if (!hybridUpload.includes('正在整文件上传')) fail('39 MiB 整文件上传策略被删除');
if (!hybridUpload.includes('39 MiB 分块')) fail('超限文件分块策略被删除');

if (!replyCore.includes('replyKey') || !replyCore.includes('buildIndex') || !replyCore.includes("normalize('NFKC')")) {
  fail('整改答复规范化索引核心不完整');
}
if (!replyBatch.includes(requiredNotice)) fail('整改答复上传成功提醒缺失');
if (!successNotice.includes(requiredNotice)) fail('通用上传成功提醒缺失');
if (!maintenance.includes(requiredNotice)) fail('维护约束未锁定上传成功提醒');
if (!replyBatch.includes("closest('#adm-ok')")) fail('管理员导入鉴权拦截缺失');
if (replyBatch.includes("closest('#adm-ok,#confirmUpload')")) fail('整改答复仍被管理员密码鉴权拦截');
const replySubmitBlock = replyBatch.slice(replyBatch.indexOf('function patchReplySubmit'), replyBatch.indexOf('function patchAvailableFunctions'));
if (!replySubmitBlock || replySubmitBlock.includes('ensureAdminToken(') || replySubmitBlock.includes('credPass')) {
  fail('上传整改答复仍要求管理员密码或凭证弹窗');
}
if (!replyBatch.includes('class="reply-view-btn"') || !replyBatch.includes('class="replace-btn"')) {
  fail('已有答复未同时显示查看和替换按钮');
}
if (!replyBatch.includes('replyIndex[lookupKey]') || !replyBatch.includes('refreshAllTabs()')) {
  fail('上传成功后未立即更新原位置按钮');
}
if (!replyBatch.includes('loadReplies(true)')) fail('上传成功后未重新读取仓库答复索引');
if (!replyBatch.includes('admin.loadTree(!!force)')) fail('刷新后未从仓库树恢复答复索引');
if (replyBatch.includes("x.open('GET','https://api.github.com/repos/")) fail('整改答复仍存在未认证目录请求');

if (!manifestLoader.includes('./data/repository-tree.json')) fail('静态目录清单路径未配置');
if (!manifestLoader.includes('loadAuthenticatedApiTree().catch')) fail('实时目录请求缺少静态清单回退');
if (!fs.existsSync('scripts/build-repository-manifest.py')) fail('缺少 Pages 目录清单生成脚本');
if (!fs.existsSync('scripts/bump-version.js')) fail('缺少版本自动迭代脚本');
if (!fs.existsSync('scripts/validate-reply-workflow.js')) fail('缺少整改答复回归测试');
if (!fs.existsSync('scripts/validate-admin-upload-transport.js')) fail('缺少管理员上传传输回归测试');
if (!fs.existsSync('scripts/validate-embedded-token-live.js')) fail('缺少内置 Token 实际 API 验证脚本');
if (!fs.existsSync('scripts/validate-mobile-dialog-reference-batch.js')) fail('缺少手机弹窗/参考资料批量下载回归测试');
if (!fs.existsSync('VERSIONING.md')) fail('缺少版本迭代规则');

const logoMatch = logoPatch.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
if (!logoMatch || logoMatch[1].length < 8000 || !logoMatch[1].startsWith('iVBORw0KGgo')) fail('新三普Logo PNG数据不完整');
if (!logoPatch.includes('transform:none!important')) fail('新三普Logo仍可能被旧裁切规则截断');

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
if (!regional.includes("progressChip('区县'")) fail('片区摘要缺少区县统计块');
if (!regional.includes('expectedUnitKeys:new Set()') || !regional.includes('receivedUnitKeys:new Set()')) fail('作业单位统计未采用集合去重');
if (!regional.includes('土特产品土壤适宜性评价') || !dashboard.includes('土特产品土壤适宜性评价')) fail('土特产品成果名称未统一');
const categoryBlock = reference.slice(reference.indexOf('var CATEGORY_ORDER'), reference.indexOf('];', reference.indexOf('var CATEGORY_ORDER')));
if (categoryBlock.includes("'土特产品适宜性评价'")) fail('参考文件仍包含旧的多余标准分组');
if (!reference.includes("compact.indexOf('土特产品适宜性评价')")) fail('旧参考目录未兼容归入新分组');
if (!deleteManager.includes('sha:null') || !deleteManager.includes('data/admin-import-index.json')) fail('管理员删除未实现事务删除与索引同步');

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
context.renderMissingBanner('soilType');
const chipCount = (banner.innerHTML.match(/regional-progress-chip/g) || []).length;
if (chipCount !== 8 || !banner.innerHTML.includes('区县')) fail('南北片区摘要渲染测试失败');

console.log(`project validation passed (${version})`);
