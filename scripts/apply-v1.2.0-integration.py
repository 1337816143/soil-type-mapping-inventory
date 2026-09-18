from pathlib import Path
import re

def replace(path, old, new, count=1):
    p=Path(path); s=p.read_text(); actual=s.count(old)
    assert actual == count, (path,old[:80],actual,count)
    p.write_text(s.replace(old,new))

assert Path('VERSION').read_text().strip() == 'v1.1.6'
credential_before=re.search(r'var tokenCodes = \[[^\]]+\]',Path('upload-config.js').read_text()).group()
for name in ['upload-config.js','app-release-ui.js','app-version-guard.js','page-enhancements.js','VERSION']:
    p=Path(name);p.write_text(p.read_text().replace('1.1.6','1.2.0'))
replace('index.html','</style>','</style>\n<link rel="stylesheet" href="./liquid-glass.css?v=1.2.0">\n<link rel="stylesheet" href="./work-records.css?v=1.2.0">\n<script src="./quality-batches.js?v=1.2.0"></script>')
replace('index.html'," + doc.batch + '</a>'", " + (window.SoilQualityBatches ? SoilQualityBatches.label(doc.batch) : doc.batch) + '</a>'")
replace('index.html',"+ b + '</span>';", "+ (window.SoilQualityBatches ? SoilQualityBatches.label(b) : b) + '</span>';")
replace('page-enhancements-core.js',"+' '+doc.batch+'</a>'", "+' '+(window.SoilQualityBatches?SoilQualityBatches.label(doc.batch):doc.batch)+'</a>'")
replace('page-enhancements-core.js',"+'\">'+b+'</span>'", "+'\">'+(window.SoilQualityBatches?SoilQualityBatches.label(b):b)+'</span>'")
replace('upload-auth-reply-batch.js','return unique(result);','return window.SoilQualityBatches ? SoilQualityBatches.unique(result) : unique(result);')
replace('upload-auth-reply-batch.js',"esc(batch) + '</span>'", "esc(window.SoilQualityBatches ? SoilQualityBatches.label(batch) : batch) + '</span>'")
replace('upload-auth-reply-batch.js','esc(currentUpload.batch) +','esc(window.SoilQualityBatches ? SoilQualityBatches.label(currentUpload.batch) : currentUpload.batch) +')
replace('reply-workflow-core.js','var api = factory();','var api = factory(function () { return root && root.SoilQualityBatches; });')
replace('reply-workflow-core.js',"function () {\n  'use strict';", "function (getBatches) {\n  'use strict';\n  function batchCanonical(value) { var catalog=getBatches&&getBatches(); return catalog ? catalog.key(value) : canonical(value); }\n")
replace('reply-workflow-core.js',"+ canonical(batch) :", "+ batchCanonical(batch) :",2)
replace('admin-auto-classifier.js','text = normalize(text);\n    var special',r"""text = normalize(text);
    if (window.SoilQualityBatches && /20\d{2}年.*第[一二三四五六七八九十0-9]+次|第[一二三四五六七八九十0-9]+次质控/.test(text.replace(/第三次全国土壤普查/g,''))) return SoilQualityBatches.fromText(text);
    var special""")
replace('admin-auto-classifier.js',"    result.batch = batch || result.batch || '';", """    result.batch = batch || result.batch || '';
    if (kind === 'quality' && window.SoilQualityBatches) {
      var q=Q(), override=q&&q.state&&q.state.qualityCycleOverride;
      result.batch = item.manualBatch || SoilQualityBatches.choose(result.batch, text, override);
    }""")
replace('admin-auto-classifier.js','option.textContent = value;','option.textContent = window.SoilQualityBatches ? SoilQualityBatches.label(value) : value;')
replace('admin-import-v2.js','S.batches=u(a);return S.batches',"a=a.concat(S.batches||[]).concat((S.files||[]).map(function(x){return x.batch||''}));S.batches=window.SoilQualityBatches?u(a.filter(Boolean).map(SoilQualityBatches.label)):u(a);return S.batches")
replace('admin-import-v2.js','function bopts(v){return','function bopts(v){if(window.SoilQualityBatches)v=SoilQualityBatches.label(v);return')
replace('admin-import-v2.js','S.files[i].batch=v.trim();','S.files[i].manualBatch=S.files[i].batch=window.SoilQualityBatches?SoilQualityBatches.label(v.trim()):v.trim();')
replace('admin-import-v2.js','S.files[i].batch=this.value;','S.files[i].manualBatch=S.files[i].batch=this.value;')
replace('admin-import-v2.js','S.files.forEach(function(x){x.batch=v})','S.files.forEach(function(x){x.manualBatch=x.batch=v})')
replace('admin-import-v2.js',"if(b&&b!=='__new__')x.batch=b;", "if(b&&b!=='__new__')x.manualBatch=x.batch=b;")
replace('admin-import-v2.js',"S.context=c||{kind:'quality'};S.files=[];", "S.context=c||{kind:'quality'};if(S.context.batch&&window.SoilQualityBatches)S.context.batch=SoilQualityBatches.label(S.context.batch);S.files=[];")
replace('admin-import-v2.js',"mode();m.classList.add('show');", "mode();if(window.SoilQualityBatchControls)SoilQualityBatchControls.onOpen();m.classList.add('show');")
replace('file-preview-batch-download.js',"batch:String(doc.batch || '')", "batch:window.SoilQualityBatches ? SoilQualityBatches.label(doc.batch) : String(doc.batch || '')")
replace('admin-delete-manager.js','record.district, record.batch,','record.district, (window.SoilQualityBatches ? SoilQualityBatches.label(record.batch) : record.batch),')
replace('admin-delete-manager.js','record.district, record.batch]','record.district, (window.SoilQualityBatches ? SoilQualityBatches.label(record.batch) : record.batch)]')
replace('hybrid-staged-upload.js',"        if (kind === 'quality') {\n          if (shared)", "        if (kind === 'quality') {\n          if (window.SoilQualityBatches) item.batch = item.manualBatch || SoilQualityBatches.choose(item.batch, item.path, q.state.qualityCycleOverride);\n          if (shared)")
replace('page-enhancements.js',"{name:'导入自动识别', src:'./admin-auto-classifier.js?v=1.2.0'},", "{name:'导入自动识别', src:'./admin-auto-classifier.js?v=1.2.0'},\n    {name:'质控年度与反馈批次', src:'./quality-batch-controls.js?v=1.2.0'},")
replace('page-enhancements.js',"{name:'统一成功提示', src:'./upload-success-notice.js?v=1.2.0'}", """{name:'统一成功提示', src:'./upload-success-notice.js?v=1.2.0'},
    {name:'工作记录模型', src:'./work-records-core.js?v=1.2.0'},
    {name:'工作记录暂存与保存', src:'./work-records-store.js?v=1.2.0'},
    {name:'附件图片卡片', src:'./work-records-gallery.js?v=1.2.0'},
    {name:'工作记录', src:'./work-records.js?v=1.2.0'}""")
replace('scripts/build-repository-manifest.py','MANAGED_PREFIXES = (','MANAGED_PREFIXES = (\n    "data/work-records/",')
replace('scripts/bump-version.js',"  'upload-success-notice.js'", """  'upload-success-notice.js',
  'quality-batch-controls.js',
  'work-records-core.js',
  'work-records-store.js',
  'work-records-gallery.js',
  'work-records.js'""")
p=Path('scripts/bump-version.js');p.write_text(p.read_text()+r"""
// Head-loaded visual/normalization assets must share the release cache key.
const indexPath = 'index.html';
let indexText = fs.readFileSync(indexPath, 'utf8');
['liquid-glass.css','work-records.css','quality-batches.js'].forEach((name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  indexText = indexText.replace(new RegExp(escaped + '\\?v=\\d+\\.\\d+\\.\\d+', 'g'), name+'?v='+bare);
});
fs.writeFileSync(indexPath, indexText, 'utf8');
""")
newjs=['quality-batches.js','quality-batch-controls.js','work-records-core.js','work-records-store.js','work-records-gallery.js','work-records.js']
files=newjs+['liquid-glass.css','work-records.css','.github/workflows/import-work-records.yml']
replace('.github/workflows/deploy.yml','          sparse-checkout: |','          sparse-checkout: |\n'+'\n'.join('            '+f for f in files))
replace('.github/workflows/deploy.yml','          required_files=(','          required_files=(\n            '+' '.join(files))
for name in ['.github/workflows/deploy.yml','.github/workflows/security-audit.yml']:
    replace(name,'          node --check upload-config.js','\n'.join('          node --check '+f for f in newjs)+'\n          node --check upload-config.js')
    replace(name,'          node scripts/validate-project.js','          node scripts/validate-v1.2.0.js\n          python3 scripts/validate-work-records.py\n          node scripts/validate-project.js')
Path('data/work-records').mkdir(parents=True,exist_ok=True)
assert not Path('data/work-records/index.json').exists()
Path('data/work-records/index.json').write_text('{"schemaVersion":1,"records":[]}\n')
replace('CHANGELOG.md','# Changelog\n','# Changelog\n\n'+Path('scripts/v1.2.0-release-notes.txt').read_text()+'\n')
p=Path('MAINTENANCE_RULES.md');p.write_text(p.read_text()+'\n\n## v1.2.0 补充约束\n\n- 液态玻璃只更换表现层，不移除操作入口；动画只用 transform/opacity，低性能和减少动态模式提供降级。\n- 工作记录使用独立 wr-* DOM、IndexedDB草稿和 data/work-records/目录，不共用质控/参考资料状态。\n- 草稿保存附件原始字节；正式保存后恢复编辑或删除仍需管理员确认。\n- 后台成功回执才代表正式保存；版本冲突拒绝覆盖并保留草稿。\n- 静态页面密码是防误操作门槛，不是服务端身份认证；公开前端凭证不提供强访问控制。\n- 旧批次统一为2026年第一次，保留补充语义；不改名旧文件，不改历史索引/答复路径，不同年度轮次不得串联。\n')
assert re.search(r'var tokenCodes = \[[^\]]+\]',Path('upload-config.js').read_text()).group() == credential_before
print('Integrated new isolated modules; embedded credential bytes unchanged.')
