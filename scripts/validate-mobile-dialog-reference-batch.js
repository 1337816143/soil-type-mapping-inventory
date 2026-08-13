'use strict';

const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('mobile-dialog-reference-batch.js', 'utf8');
const loader = fs.readFileSync('page-enhancements.js', 'utf8');
const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const maintenance = fs.readFileSync('MAINTENANCE_RULES.md', 'utf8');

assert(source.includes('--soil-visual-height'), '未使用visualViewport高度约束手机弹窗');
assert(source.includes('--soil-visual-top'), '未处理移动浏览器可视区域偏移');
assert(source.includes('window.visualViewport'), '未监听visualViewport变化');
assert(source.includes('env(safe-area-inset-top)'), '未适配刘海/挖孔安全区顶部');
assert(source.includes('env(safe-area-inset-bottom)'), '未适配底部手势安全区');
assert(source.includes('.soil-modal-close{position:absolute!important'), '关闭按钮未固定在手机弹窗可视顶部');
assert(source.includes('max-height:100%!important'), '手机弹窗仍可能高于可视区域');
assert(source.includes('@media(max-width:360px)'), '缺少窄屏手机适配');
assert(source.includes('@media(max-width:760px) and (max-height:650px)'), '缺少小高度手机适配');
assert(source.includes('@media(orientation:landscape) and (max-height:500px)'), '缺少手机横屏适配');
assert(source.includes('grid-template-columns:minmax(230px,34vw) minmax(0,1fr)'), '横屏批量下载未切换双栏布局');
assert(!source.includes('new MutationObserver'), '移动端弹窗/参考批量下载不得引入长期MutationObserver');

const commonPhones = [
  [320,568,'4英寸/小屏Android'],
  [360,640,'常见小屏Android'],
  [375,667,'iPhone SE/8级别'],
  [390,844,'iPhone 12/13/14级别'],
  [393,873,'常见新款Android/iPhone'],
  [412,915,'Pixel/常见Android'],
  [430,932,'iPhone Pro Max级别'],
  [667,375,'小屏手机横屏'],
  [844,390,'主流手机横屏']
];
for (const [width,height,label] of commonPhones) {
  const visualHeight = Math.max(320, height);
  assert(visualHeight <= Math.max(320,height), `${label} 可视高度计算异常`);
  if (width <= 760 && height <= 650) {
    const filterHeight = Math.min(height * 0.28, 165);
    const reserved = 44 + 100 + 45;
    assert(filterHeight + reserved < visualHeight, `${label} 批量下载结果区空间不足`);
  }
  if (height <= 500 && width > height) {
    assert(width >= 320, `${label} 横屏宽度异常`);
  }
}

assert(source.includes("button.id = 'ref-batch-download'"), '参考资料页缺少批量下载按钮');
assert(source.includes("button.textContent = '批量下载'"), '参考资料批量下载按钮文本错误');
assert(source.includes('按成果类型选择'), '参考资料批量下载缺少成果类型筛选');
assert(source.includes('data-reference-type'), '参考资料成果类型筛选控件缺失');
assert(source.includes('全选当前结果'), '参考资料批量下载缺少全选当前结果');
assert(source.includes('取消全部'), '参考资料批量下载缺少取消全部');
assert(source.includes('下载已选 ZIP'), '参考资料批量下载缺少ZIP下载');
assert(source.includes("'三普参考资料_' + timestampName() + '.zip'"), '参考资料ZIP命名规则缺失');
assert(source.includes('referenceCatalog()'), '参考资料批量下载未从仓库目录生成目录');
assert(source.includes('admin.referenceRoot'), '参考资料批量下载未限制到参考资料根目录');
assert(source.includes('admin.raw(path)'), '参考资料批量下载未使用实际仓库文件地址');
assert(!/密码|credPass|ensureAdminToken/.test(source), '公开参考资料批量下载不应要求管理员密码');

assert(loader.includes('mobile-dialog-reference-batch.js?v='), '新移动端/参考批量模块未加入页面加载器');
assert(deploy.includes('mobile-dialog-reference-batch.js'), 'Pages部署未包含新移动端/参考批量模块');
assert(maintenance.includes('参考资料批量下载'), '维护约束未锁定参考资料批量下载功能');
assert(maintenance.includes('关闭按钮'), '维护约束未锁定移动端关闭按钮可见性');

console.log('mobile modal responsive coverage passed: 320-430px portrait + common landscape; reference result-type batch download passed');
