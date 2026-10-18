"""One-time, version-guarded source transformation; runs only on the feature branch."""
from pathlib import Path
import subprocess

root = Path('.')
assert (root / 'VERSION').read_text().strip() == 'v1.2.18', 'Unexpected base version'

def patch(file, old, new):
    p = root / file
    s = p.read_text(encoding='utf-8')
    assert s.count(old) == 1, (file, s.count(old), old[:100])
    p.write_text(s.replace(old, new), encoding='utf-8')

helpers = r'''  var DOCUMENT_ROLE_LABELS = {quality:'质控', score:'评分', 'quality-score':'质控＋评分'};
  // Optional filename-derived labels, never a new upload confirmation gate.
  function documentRole(value) {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(DOCUMENT_ROLE_LABELS, value.documentRole)) return value.documentRole;
    var input = typeof value === 'string' ? value : value && (typeof value.file === 'string' ? value.file : value.file && value.file.name || value.name || value.originalName || value.path) || '';
    try { input = decodeURIComponent(input); } catch (error) {}
    // Only the physical filename is evidence, not the enclosing directory.
    var name = basename(input).replace(/\s+/g, '');
    if (!/评分|打分|计分/.test(name) || /模板|范本|样表|空白表|手册|指南|评分(?:标准|细则|办法|规则)|打分(?:标准|细则|办法|规则)/.test(name)) return 'quality';
    var quality = /(?:质控|质量控制|审核|审查|复核)(?:报告|意见|反馈|记录)|问题反馈|整改意见/.test(name);
    if (/(?:质控|质量控制)报告(?:验收)?(?:评分|打分|计分)(?:表|报告)/.test(name)) quality = false;
    return quality ? 'quality-score' : 'score';
  }
  function roleLabel(value) { return DOCUMENT_ROLE_LABELS[documentRole(value)]; }
  function roleBadge(value) {
    var role = documentRole(value);
    if (role === 'quality') return '';
    var label = DOCUMENT_ROLE_LABELS[role];
    var title = role === 'score' ? '评分文件（按文件名识别）；不代表已收到单独质控意见，具体内容以原文件为准。' : '文件名同时包含质控报告/意见与评分；一份原文件，具体内容以原文件为准。';
    return '<span class="file-role-badge file-role-' + role + '" data-document-role="' + role + '" title="' + title + '" aria-label="' + label + '">' + label + '</span>';
  }
  function roleSearchMatch(value, token) {
    var role = documentRole(value), t = String(token || '').replace(/\s+/g, '');
    if (/^(?:评分|打分|计分)(?:报告|文件|表)?$|^验收评分(?:表)?$/.test(t)) return role !== 'quality';
    if (/^(?:仅|纯)(?:评分|打分)$/.test(t)) return role === 'score';
    if (/^质控[＋+和与及]评分$/.test(t)) return role === 'quality-score';
    if (/^质控(?:报告|意见|文件)?$/.test(t)) return role !== 'score';
    return null;
  }

'''
patch('admin-auto-classifier.js', '  function inferBatch(text) {', helpers + '  function inferBatch(text) {')
patch('admin-auto-classifier.js', "    var roundInfo = policy && policy.parse(text);\n    if (roundInfo && roundInfo.explicit) return policy.format(roundInfo);", r'''    // Nearest filename fields win over ZIP folders. National survey 3 is
    // not QC round 3. Existing explicit manualBatch remains authoritative.
    var segments = text.replace(/第三次全国土壤普查|全国第三次土壤普查/g, '三普').split('/').reverse();
    var year = '', round = '', feedback = '';
    segments.forEach(function (segment) {
      segment = segment.replace(/\s+/g, '');
      var y = segment.match(/20\d{2}年/), r = segment.match(/第[一二三四五六七八九十两\d]+(?:次(?:质控)?|轮)/), b = segment.match(/第[一二三四五六七八九十两\d]+批(?:补充)?/);
      if (!year && y) year = y[0];
      if (!round && r) round = r[0];
      if (!feedback && b) feedback = b[0];
    });
    var roundInfo = policy && policy.parse((year || '') + round + feedback);
    if (roundInfo && (roundInfo.explicit || /次/.test(round))) return policy.format(roundInfo);''')
patch('admin-auto-classifier.js', "['soilAttr', /土壤属性(?:图|制图)|土壤属性成果|属性图成果|属性图/]", "['soilAttr', /土壤属性(?:(?:与|及)?制图|图)|土壤属性成果|属性图成果|属性图/]")
patch('admin-auto-classifier.js', "    result.kind = kind || result.kind || 'unknown';", "    result.kind = kind || result.kind || 'unknown';\n    if (result.kind === 'quality') result.documentRole = documentRole(fileName);")
patch('admin-auto-classifier.js', '    item.autoMeta = meta;', "    item.autoMeta = meta;\n    if (meta.kind === 'quality') item.documentRole = meta.documentRole;")
patch('admin-auto-classifier.js', '    comprehensiveKeys:COMPREHENSIVE_KEYS.slice(),', '    documentRole:documentRole,roleLabel:roleLabel,roleBadge:roleBadge,roleSearchMatch:roleSearchMatch,\n    comprehensiveKeys:COMPREHENSIVE_KEYS.slice(),')
patch('admin-import-v2.js', "A.esc(A.base(x.path))+'</b><span>'", "A.esc(A.base(x.path))+(window.SoilAdminAutoClassifier?window.SoilAdminAutoClassifier.roleBadge(x.autoMeta||x.file.name):'')+'</b><span>'")
patch('admin-import-v2.js', "adds.push({kind:'quality-control',dataKey:", "adds.push({kind:'quality-control',documentRole:window.SoilAdminAutoClassifier?window.SoilAdminAutoClassifier.documentRole(x.file.name):'quality',dataKey:")
patch('hybrid-staged-upload.js', '        return record;\n      })', "        if (kind === 'quality' && meta && ['quality','score','quality-score'].indexOf(meta.documentRole) >= 0) record.quality.documentRole = meta.documentRole;\n        return record;\n      })")
patch('dashboard-extension.js', "['unitCorrection','unitReviewRequired','unitReviewMessage'].forEach", "['documentRole','unitCorrection','unitReviewRequired','unitReviewMessage'].forEach")
patch('page-enhancements-core.js', "      if (key !== 'reports') return '';\n      var name = String(doc.file || '')", "      var classifier = window.SoilAdminAutoClassifier;\n      var badge = classifier && classifier.roleBadge ? classifier.roleBadge(doc) : '';\n      if (key !== 'reports') return badge;\n      var name = String(doc.file || '')")
patch('page-enhancements-core.js', "      return ' · ' + escapeAttribute(kinds.length ? kinds.join('、') : name);", "      return ' · ' + escapeAttribute(kinds.length ? kinds.join('、') : name) + badge;")
patch('file-preview-batch-download.js', '                  name:basename(repoPath),', '                  name:basename(repoPath),\n                  documentRole:doc.documentRole,')
patch('file-preview-batch-download.js', '      // Report-subtype searches must use the file name', '      var classifier = window.SoilAdminAutoClassifier;\n      var roleMatch = classifier && classifier.roleSearchMatch ? classifier.roleSearchMatch(item, token) : null;\n      if (roleMatch !== null) return roleMatch;\n      // Report-subtype searches must use the file name')
patch('file-preview-batch-download.js', "    return '成果：' + short(types, 4)", "    var classifier = window.SoilAdminAutoClassifier;\n    var role = classifier && classifier.documentRole ? classifier.documentRole(item) : 'quality';\n    return (role !== 'quality' ? classifier.roleLabel(item) + '　|　' : '') + '成果：' + short(types, 4)")
patch('.github/workflows/import-chunked.yml', "                  data_keys = [str(x) for x in (quality.get('dataKeys') or []) if str(x)]", "                  if quality.get('documentRole') in {'quality', 'score', 'quality-score'}:\n                      common['documentRole'] = quality['documentRole']\n                  data_keys = [str(x) for x in (quality.get('dataKeys') or []) if str(x)]")
patch('.github/workflows/import-release.yml', "                      'kind': 'quality-control',", "                      **({'documentRole': quality['documentRole']} if quality.get('documentRole') in {'quality', 'score', 'quality-score'} else {}),\n                      'kind': 'quality-control',")
p = root / 'glass-interface.css'
p.write_text(p.read_text()+'''\n/* Compact filename-derived scoring labels; no new columns or animations. */
.file-role-badge,.v2-file b .file-role-badge{display:inline-flex;align-items:center;vertical-align:middle;margin-inline-start:.4em;padding:.06em .42em;border:1px solid #b58a25;border-radius:999px;background:#fff6d9;color:#6b4800;font-size:.72em;font-weight:700;line-height:1.35;white-space:nowrap;letter-spacing:0}
.file-role-quality-score,.v2-file b .file-role-quality-score{border-color:#6597a9;background:#e9f6fa;color:#225266}
@media (forced-colors:active){.file-role-badge{border:1px solid CanvasText;background:Canvas;color:CanvasText}}
''')
for workflow in ['.github/workflows/deploy.yml', '.github/workflows/security-audit.yml']:
    patch(workflow, '          node scripts/validate-project.js', '          node scripts/validate-scoring-files.js\n          node scripts/validate-project.js')
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
patch('CHANGELOG.md', '# Changelog\n', '''# Changelog

## v1.2.19 — 2026-10-18

- 支持评分、打分、验收评分表及质控报告与评分合并文件，复用现有成果/地区/单位归档，不新增标签页和表格列。
- 修复不带年份的“第三次第一批”轮次识别，文件名优先于ZIP目录；“土壤属性与制图/及制图”识别为属性成果。人工批次和成果调整继续优先，缺失信息沿用原有核对流程。
- 上传预览和成果文件按钮以紧凑的“评分”“质控＋评分”文字标记区分文件；原质控按钮不额外增加标记。
- 上传清单与后台索引保存可选 documentRole 字段，兼容旧索引按文件名推断；同批次原质控与评分文件并存，物理文件不按关联复制。
- 公开批量下载原搜索框支持评分/打分同义查询，可与城市、成果类型、区县交叉筛选；不增加筛选面板。
- 新增截图命名、元数据、保存索引、同批并存、标记及查询回归。参考资料、工作记录、整改答复、凭证及原通讯录保持独立。
''')
(root/'docs/SCORING_FILES.md').write_text('''# 评分文件归档

评分文件使用原成果栏管理员导入入口。支持PDF、DOC、DOCX和原入口支持的其他格式，命名中的评分、打分、计分、验收评分表均可生成评分标记。PDF/DOCX复用原站内预览与缩放；其他格式保持原有下载兜底。

文件在原成果类型、城市、作业单位、区县/市级、批次位置展示，不新增标签页、表格列或性质确认按钮。纯评分显示“评分”；明确包含质控报告/意见和评分的文件显示“质控＋评分”；普通质控不增加标记。标记依据文件名而非自动阅读原文，不代表评分已核实。

- 土壤属性与制图、土壤属性及制图兼容土壤属性图；土壤资源/土地资源评价与利用仍进入原资源评价栏目。
- 第三次第一批兼容2026年第三次第1批；显式年份优先，文件名优先于目录；第三次全国土壤普查不作为第三轮质控。
- 没有批次的单独文件使用用户本次选择的批次；缺少成果或地区且无法唯一识别时仍允许原有逐文件人工调整，不猜配单位。
- 同一任务和批次的评分与质控按物理路径分别保留，原文件不覆盖。现有收缴统计口径、分母和任务去重保持不变，评分标记不代表单独质控意见已经收到。
- 批量下载搜索“评分”或“打分”可匹配两种叫法；“仅评分”筛选纯评分；“质控＋评分”筛选合并文件。继续支持市、单位、成果、区县交叉筛选。
- 参考资料和工作记录保持独立，评分手册/标准/模板不因为评分关键词被标记为已评分的报告。

仅收到命名截图的文件不会被伪造为真实上传文件；本次回归全部使用内存/临时目录样例，不写入正式数据索引。
''',encoding='utf-8')
print('Scoring feature source transformation completed; existing data files untouched.')
