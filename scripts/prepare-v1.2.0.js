'use strict';
// Mechanical integration only. Idempotent; never rewrites original report files or credentials.
const fs=require('fs'),assert=require('assert'),cp=require('child_process'),crypto=require('crypto');
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s,'utf8');
function change(p,from,to){const before=read(p);if(before.includes(to))return;assert(before.includes(from),p+': missing integration anchor');write(p,before.replace(from,to));}
const credential=read('upload-config.js').match(/var tokenCodes = \[([^\]]+)\]/)[0];
const fingerprint=crypto.createHash('sha256').update(credential).digest('hex');
change('index.html','<html lang="zh-CN">','<html lang="zh-CN" class="glass-ui">');
change('index.html','</style>\n</head>','</style>\n<link rel="stylesheet" href="./glass-interface.css?v=1.2.0">\n<link rel="stylesheet" href="./work-records.css?v=1.2.0">\n</head>');
change('page-enhancements.js','  var modules = [','  var modules = [\n    {name:\'年份与质控轮次\', src:\'./batch-policy.js?v=1.1.6\'},');
let loader=read('page-enhancements.js');
if(!loader.includes("name:'工作记录'")){
 loader=loader.replace(/(  var modules = \[[\s\S]*?)(\n  \];)/,(_,a,b)=>a+",\n    {name:'批次管理与玻璃界面', src:'./batch-management.js?v=1.1.6'},\n    {name:'工作记录存储', src:'./work-records-core.js?v=1.1.6'},\n    {name:'工作记录', src:'./work-records.js?v=1.1.6'}"+b);
 write('page-enhancements.js',loader);
}
change('scripts/bump-version.js',"  'page-enhancements-core.js',","  'batch-policy.js',\n  'batch-management.js',\n  'work-records-core.js',\n  'work-records.js',\n  'page-enhancements-core.js',");
if(read('VERSION').trim()==='v1.1.6')cp.execFileSync(process.execPath,['scripts/bump-version.js','minor'],{stdio:'inherit'});
assert.equal(read('VERSION').trim(),'v1.2.0');
change('reply-workflow-core.js','  function replyKey(city, unit, district, batch) {',"  function batchCanonical(batch) {\n    var policy = typeof globalThis !== 'undefined' && globalThis.SoilBatchPolicy;\n    return policy ? policy.identity(batch) : canonical(batch);\n  }\n\n  function replyKey(city, unit, district, batch) {");
let reply=read('reply-workflow-core.js').replace(/'_批次-' \+ canonical\(batch\)/g,"'_批次-' + batchCanonical(batch)");write('reply-workflow-core.js',reply);
change('upload-auth-reply-batch.js','    return unique(result);',"    return unique(result.map(function (batch) { return window.SoilBatchPolicy ? window.SoilBatchPolicy.format(batch) : batch; }));");
change('admin-auto-classifier.js','    text = normalize(text);\n    var special = text.match',"    text = normalize(text);\n    var policy = window.SoilBatchPolicy;\n    var roundInfo = policy && policy.parse(text);\n    if (roundInfo && roundInfo.explicit) return policy.format(roundInfo);\n    var special = text.match");
change('admin-auto-classifier.js','    var meta = classifyItem(item);\n    item.autoMeta = meta;',"    var meta = classifyItem(item);\n    if (window.SoilBatchPolicy) window.SoilBatchPolicy.applyToItem(item, meta, Q() && Q().state && Q().state.batchSelection);\n    item.autoMeta = meta;");
change('admin-import-v2.js',"S.context=c||{kind:'quality'};S.files=[];","S.context=c||{kind:'quality'};S.batchSelection=null;S.files=[];");
change('admin-import-v2.js',"m.classList.add('show');A.loadTree(false).then(dirs).catch(dirs)","m.classList.add('show');if(window.SoilBatchManager)window.SoilBatchManager.reset();A.loadTree(false).then(dirs).catch(dirs)");
change('admin-import-v2.js','S.batches=u(a);return S.batches','S.batches=u(a.map(function(v){return window.SoilBatchPolicy?window.SoilBatchPolicy.format(v):v}));return S.batches');
change('admin-import-v2.js','function bopts(v){return batches()', 'function bopts(v){if(window.SoilBatchPolicy)v=window.SoilBatchPolicy.format(v);return batches()');
change('admin-import-v2.js','S.files[i].batch=this.value;render()','S.files[i].batch=this.value;S.files[i].manualBatch=this.value;render()');
// Fix two UI details caught in initial source review.
change('work-records.js',"el('div','地点：'+(r.location||'未填写'))","el('div','','地点：'+(r.location||'未填写'))");
change('work-records.js','var w=Math.min(1060,width-16),hh=Math.min(860,height-16);',"var compact=(cls||'').indexOf('wr-auth')>=0;var w=Math.min(compact?480:1060,width-16),hh=Math.min(compact?320:860,height-16);");
// Never carry a historical report fingerprint into a later round with a reused filename.
change('batch-policy.js','      meta.batch = item.batch = format(p);',"      if (meta.catalogMatched && (p.year !== 2026 || p.round !== 1)) { meta.expectedSha256 = ''; meta.catalogExact = false; }\n      meta.batch = item.batch = format(p);");
const newJS=['batch-policy.js','batch-management.js','work-records-core.js','work-records.js'];
let deploy=read('.github/workflows/deploy.yml');
if(!deploy.includes('            work-records.js')){
 deploy=deploy.replace('            index.html','            index.html\n            glass-interface.css\n            work-records.css\n            batch-policy.js\n            batch-management.js\n            work-records-core.js\n            work-records.js\n            work-record-attachments');
 deploy=deploy.replace('          required_files=(', '          required_files=(\n            glass-interface.css work-records.css batch-policy.js batch-management.js work-records-core.js work-records.js\n            data/work-records.json scripts/validate-workspace.js');
 deploy=deploy.replace('          node scripts/validate-project.js', '          node scripts/validate-project.js\n          node scripts/validate-workspace.js');
 write('.github/workflows/deploy.yml',deploy);
}
let audit=read('.github/workflows/security-audit.yml');
if(!audit.includes('node scripts/validate-workspace.js')){audit=audit.replace('          node scripts/validate-project.js','          node scripts/validate-project.js\n          node scripts/validate-workspace.js');write('.github/workflows/security-audit.yml',audit);}
const versionEntry='## v1.2.0 — 2026-09-18\n\n- 全站液态玻璃界面：高对比正文、轻量模式、减少动态效果及手机降级；保留原有功能入口和透明三普标识。\n- 新增独立工作记录标签页：事项、时间、地点、人员、备注、附件；卡片/表格、全文及日期查询。\n- IndexedDB 暂存文字和附件；正式保存后修改/删除须管理员验证；Git 原子提交和修订号冲突保护，失败不丢草稿。\n- 图片完整显示并按顺序堆叠，滚轮、方向键/小键盘及手势切换；Word/PDF 复用现有带缩放预览。\n- 质控改为年份—轮次—反馈批次：旧第一批/第二批补充/第三批统一显示为2026年第一次第x批；新增轮次选择，历史文件路径不改，旧整改答复仍可匹配。\n- 当前内置 Token 内容未改；工作记录沿用公开仓库方案，管理员密码属于页面操作保护，并非服务端身份认证。\n\n';
if(!read('CHANGELOG.md').includes('## v1.2.0'))write('CHANGELOG.md',read('CHANGELOG.md').replace('# Changelog\n\n','# Changelog\n\n'+versionEntry));
const rules='\n\n## v1.2.0 工作记录及批次约束\n\n- 工作记录与参考资料/质控上传使用独立状态和 data/work-records.json；不能触发质控自动识别。\n- 草稿在 IndexedDB 中暂存文字和附件，不保存管理员密码或临时授权；再次编辑已保存记录须重新验证。\n- 更新记录及附件索引必须同一次非强制 Git 提交；并发冲突不得覆盖他人记录。\n- 图片只用 transform/opacity 过渡；减少动态效果与轻量模式有效；输入框中方向键不得切换图片。\n- 历史反馈属于2026年第一次质控。第二批补充仍是第2批补充，不改为独立质控轮次；不同年份/轮次的整改答复不得串联。\n- 历史文件路径与原始附件不移动、不复制，旧批次作为兼容别名保留。\n';
if(!read('MAINTENANCE_RULES.md').includes('## v1.2.0 工作记录及批次约束'))write('MAINTENANCE_RULES.md',read('MAINTENANCE_RULES.md')+rules);
assert.equal(crypto.createHash('sha256').update(read('upload-config.js').match(/var tokenCodes = \[([^\]]+)\]/)[0]).digest('hex'),fingerprint,'Credential bytes must not change');
for(const p of newJS.concat(['page-enhancements.js','admin-import-v2.js','admin-auto-classifier.js','reply-workflow-core.js']))cp.execFileSync(process.execPath,['--check',p]);
console.log('v1.2.0 integration complete; embedded credential bytes identical; source reports unchanged.');
