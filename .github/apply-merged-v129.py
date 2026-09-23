from pathlib import Path
import hashlib, re, subprocess
assert Path('VERSION').read_text().strip() == 'v1.2.8', 'Unexpected base release'
master_before = re.search(r'var masterList = \[[\s\S]*?\n\];', Path('index.html').read_text()).group()
mapping_before = Path('task-unit-mappings.js').read_bytes()

def change(path, old, new):
    p=Path(path);s=p.read_text();assert old in s,(path,old[:80]);p.write_text(s.replace(old,new))

# These are separately recovered source remarks, not changes to either roster.
p=Path('admin-auto-classifier.js');s=p.read_text()
start=s.index('  // Read-only comparison against the selected result type.')
end=s.index('  // A different company is not necessarily an error.',start)
s=s[:start]+r'''  // Read-only source remarks supplied by the owner on 2026-07-27, repeated
  // for soilType on 2026-09-22. The roster had compressed these to 邯郸市.
  // Keep the literal evidence separate; never add tasks to or rewrite lists.
  // Evidence and scope limitations: docs/MERGED_DIRECTORY_EVIDENCE.md.
  var MERGED_DIRECTORY_NOTES = [
    {list:'soilType',city:'邯郸市',unit:'河北向力规划设计有限公司',parent:'邯郸市',
      members:['丛台区','复兴区','峰峰矿区'],
      quote:'市本级（丛台区、复兴区、峰峰）、邯山区、肥乡区、市级'},
    {list:'other',city:'邯郸市',unit:'河北科沃生态科技有限公司',parent:'邯郸市',
      members:['丛台区','复兴区','峰峰矿区'],
      quote:'邯山区、肥乡区、市级（含丛台区、复兴区、峰峰矿区）'}
  ];
  function cleanDirectoryMessage(value) {
    // Old stored receipts stay untouched, but prohibited wording cannot leak
    // back through a stale per-document tooltip or header-review message.
    return String(value || '').replace(/[，,；;]?\s*(?:暂)?不计入(?:应交清单|应交|清单)?统计[。.]?/g,'').trim();
  }
  var mergedRowsCache = {};
  function mergedDirectoryRows(key) {
    var ref=listForKey(key), scopeKey=JSON.stringify(window.mergeSubDistricts || {}), cached=mergedRowsCache[key];
    if(cached && cached.ref===ref && cached.scopeKey===scopeKey)return cached.rows;
    var rows=flattenTasks([key]), derived=[], seen={};
    function add(parent,member,source) {
      if(!member || compact(member)===compact(parent.district))return;
      // Explicit standalone tasks (including a named contained mining area)
      // override any broad legacy city-level merge scope.
      if(rows.some(function(r){return r.city===parent.city && !/合并/.test(r.district) && regionForms(r.district).includes(compact(member));}))return;
      var id=[parent.city,parent.unit,parent.district,member].join('\n');
      if(seen[id])return;seen[id]=true;
      derived.push({city:parent.city,unit:parent.unit,district:member,
        parentDistrict:parent.district,relation:'merged-member',evidence:source});
    }
    MERGED_DIRECTORY_NOTES.forEach(function(note){
      if(note.list!==(key==='soilType'?'soilType':'other'))return;
      rows.filter(function(r){return r.city===note.city && r.district===note.parent && unitMatches(r.unit,note.unit);}).forEach(function(parent){
        note.members.forEach(function(member){add(parent,member,'原通讯录备注：'+note.quote);});
      });
    });
    var scopes=window.mergeSubDistricts || {};
    Object.keys(scopes).forEach(function(city){
      if(!Array.isArray(scopes[city]))return;
      var parents=rows.filter(function(r){return r.city===city && /合并区/.test(r.district);});
      // The original global member scope can only bind when this result type
      // has one unambiguous merged task. Never borrow another type's company.
      if(parents.length!==1)return;
      scopes[city].forEach(function(member){add(parents[0],member,'原内嵌合并区范围：'+scopes[city].join('、'));});
    });
    mergedRowsCache[key]={ref:ref,scopeKey:scopeKey,rows:derived};
    return derived;
  }
  function directoryStatus(key, city, unit, district) {
    var rows=flattenTasks([key]).filter(function(r){return compact(r.city)===compact(city);});
    var matches=rows.filter(function(r){return regionForms(r.district).includes(compact(district));});
    if(!matches.length && typeof window.isDistrictMatched==='function'){
      var submitted={};submitted[city+'_'+district]=true;
      // Split-district membership needs explicit scope evidence, not a generic
      // "市本级"/"合并区" name or a coincidentally identical company.
      matches=rows.filter(function(r){return (!/合并/.test(r.district)||/合并/.test(district)) && window.isDistrictMatched(r.district,city,submitted);});
    }
    var relation='direct',scope='';
    if(!matches.length){
      matches=mergedDirectoryRows(key).filter(function(r){return compact(r.city)===compact(city) && regionForms(r.district).includes(compact(district));});
      if(matches.length){
        relation='merged-member';
        scope='通讯录按合并区统一分配作业单位，实际成果分开编制，因此按“'+district+'”单独质控。';
        scope+='核对依据：'+unique(matches.map(function(r){return r.evidence;})).join('；')+'。';
      }
    }
    var listed=unique(matches.map(function(r){return r.unit;}));
    var code=!listed.length?'outside-list':listed.some(function(u){return unitMatches(u,unit);})?'matched':'unit-mismatch';
    var message=scope;
    if(code==='outside-list')message='与作业单位通讯录不一致；该类成果通讯录未单列“'+district+'”，现有合并区范围及备注也未明确包含该地区。';
    else if(code==='unit-mismatch')message=(scope?scope+'\n':'')+'与作业单位通讯录不一致；'+(relation==='merged-member'?'该合并区':'该类成果')+'通讯录单位：'+listed.join('、')+'；当前记录单位：'+(unit||'未明')+'。';
    return {code:code,mismatch:code!=='matched',listedUnits:listed,relation:relation,
      parentDistricts:unique(matches.map(function(r){return r.parentDistrict||r.district;})),message:message};
  }
''' +s[end:]
s=s.replace("'井陉县（含矿区）':['井陉县']", "'井陉县（含矿区）':['井陉县','井陉矿区']")
s=s.replace("return {mismatch:status.mismatch,code:status.code,title:title};", "return {mismatch:status.mismatch,code:status.code,relation:status.relation,title:cleanDirectoryMessage(title)};")
s=s.replace("var rows = flattenTasks([key]), geo = geographyText(text,company);", "var rows = flattenTasks([key]).concat(mergedDirectoryRows(key)), geo = geographyText(text,company);")
s=s.replace("row.directoryStatus=status.code;row.directoryMessage=status.message;rows.push(row);", "row.directoryStatus=status.code;row.directoryMessage=status.message;row.directoryRelation=status.relation;rows.push(row);")
s=s.replace("+(r.note?'；'+r.note:''));", "+(r.note?'；'+r.note:'')+(r.directoryRelation==='merged-member'?'；'+r.directoryMessage:''));")
s=s.replace("directoryStatus:directoryStatus,directoryAttributes:directoryAttributes,confirmOutside:confirmOutside,", "directoryStatus:directoryStatus,directoryAttributes:directoryAttributes,confirmOutside:confirmOutside,\n    cleanDirectoryMessage:cleanDirectoryMessage,mergedDirectoryRows:mergedDirectoryRows,")
s=s.replace('清单外任务；只归档，不修改通讯录及应交统计。','清单外任务；核对归属后归档，原通讯录保持不变。')
s=s.replace('不会修改通讯录或应交统计。','原通讯录保持不变。')
s=s.replace('不修改通讯录，不改变应交统计。','不修改通讯录。')
p.write_text(s)
change('page-enhancements-core.js',"      return info;\n    }\n    function directoryAttrs(info){return info.mismatch?", "      if(c&&c.cleanDirectoryMessage)info.title=c.cleanDirectoryMessage(info.title);\n      return info;\n    }\n    function directoryAttrs(info){return (info.mismatch||info.relation==='merged-member')?")
change('page-enhancements-core.js',"(info.mismatch?' tabindex=\"0\"':'')", "((info.mismatch||info.relation==='merged-member')?' tabindex=\"0\"':'')")
for name in ['admin-import-v2.js','chunked-staged-upload.js','hybrid-staged-upload.js']:
 p=Path(name);s=p.read_text()
 s=s.replace('已完整识别，将计入统计','归档信息已完整识别')
 s=s.replace('归档信息不完整，文件会上传，但暂不计入统计','归档信息不完整，文件会保存，请补充归属信息')
 s=s.replace('字段不完整的文件仍会上传，但不计入统计','字段不完整的文件仍会保存，请核对并补充归属信息')
 s=s.replace('个文件归档信息不完整，仍会上传但不计入统计。是否继续？','个文件归档信息不完整，请核对并补充归属信息。是否继续保存？')
 s=s.replace('未完整匹配项不计入统计。','未完整匹配项请核对归属信息。')
 p.write_text(s)
change('scripts/validate-auto-import-classifier.js',"// End-to-end mapping checks use the real embedded lists and actual Actions writer.", "require('child_process').execFileSync(process.execPath,['scripts/validate-merged-directory.js'],{stdio:'inherit'});\n\n// End-to-end mapping checks use the real embedded lists and actual Actions writer.")
change('scripts/test-workspace-browser.py',"            unit_ui=runpy.run_path", "            merged_ui=runpy.run_path(str(ROOT/'scripts/check-merged-directory-ui.py'))['check_merged_directory_ui'](page,OUT,engine)\n            (OUT/(engine+'-merged-directory-report.json')).write_text(json.dumps(merged_ui,ensure_ascii=False,indent=2))\n            unit_ui=runpy.run_path")
change('scripts/test-live-workspace.py',"        tabs=page.locator('header .tabs .tab').all_text_contents()", r'''        report['mergedDirectory']=page.evaluate("""()=>{
          const C=SoilAdminAutoClassifier,before=JSON.stringify(SoilTaskUnitLists);
          const covered=C.directoryStatus('soilType','邯郸市','河北向力规划设计有限公司','峰峰矿区');
          const absent=C.directoryStatus('specialty','邯郸市','河北省农林科学院农业资源环境研究所','永年区');
          if(covered.mismatch||covered.relation!=='merged-member'||!covered.message.includes('单独质控'))throw Error('Merged source scope missing');
          if(!absent.mismatch||!absent.message.includes('备注也未明确包含'))throw Error('Uncovered task warning missing');
          const links=Array.from(document.querySelectorAll('#tab-soilType .district-link')).filter(n=>n.textContent.includes('峰峰矿区'));
          if(links.length!==1||links[0].classList.contains('directory-mismatch')||!links[0].title.includes('单独质控'))throw Error('Actual Fengfeng display wrong');
          const texts=[document.body.innerText,...Array.from(document.querySelectorAll('[title],[aria-label]')).map(n=>(n.title||'')+(n.getAttribute('aria-label')||''))].join('\n');
          if(/不计入(?:应交清单|应交|清单)?统计/.test(texts))throw Error('Removed wording leaked to UI');
          if(JSON.stringify(SoilTaskUnitLists)!==before)throw Error('Directory mutated');
          return {status:'passed',fengfeng:covered.message,uncovered:absent.message,actualLinkTitle:links[0].title};
        }""")
        tabs=page.locator('header .tabs .tab').all_text_contents()''')
change('docs/QUALITY_UPLOAD_NAMING.md','；清单外任务不计入应交清单统计。','；清单外任务保留差异说明。')
p=Path('docs/QUALITY_UPLOAD_NAMING.md');p.write_text(p.read_text()+'''

## v1.2.9 合并区范围核对

缺少独立区县条目时，先查该成果通讯录的明确合并范围/备注。备注包含该区县且作业单位一致：保留区县名称和独立质控文件，正常颜色，并说明“通讯录按合并区统一分配作业单位，实际成果分开编制，因此单独质控”。若归属在范围内但单位不同，继续标红，说明合并区分配单位和当前单位；无独立条目且无明确包含证据，继续标红说明差异。不能只因同公司、同市或属市辖区就推定包含。

邯郸丛台区、复兴区、峰峰矿区依据原始备注核对；永年区没有相应包含证据。市、成果、单位严格分开核对，具体证据见 MERGED_DIRECTORY_EVIDENCE.md。显示提示不对记录作排除统计的表述。原通讯录和现有报告均不改。
''')
p=Path('MAINTENANCE_RULES.md');p.write_text(p.read_text()+'''

## v1.2.9 合并范围与提示

- 原通讯录按成果及城市只读核对；独立任务优先，随后核查明确合并范围与原始备注，不凭同公司/同市推定覆盖。
- 恢复的括号备注是独立范围证据，不能写回原任务清单或改变报告的独立区县名称。合并范围内且单位一致正常展示并解释独立质控；范围内单位不同、范围未覆盖均保留红色和具体原因。
- 页面、悬停、上传预览和确认提示不得宣称清单外记录被排除统计；历史证据原件不改写，呈现旧提示时清理该类语句。
''')
p=Path('CHANGELOG.md');p.write_text(p.read_text().replace('# Changelog\n','# Changelog\n\n## v1.2.9 — 2026-09-23\n\n- 恢复原通讯录邯郸市本级包含丛台区、复兴区、峰峰矿区的只读括号备注，分别匹配土壤类型图/其他成果作业单位，不改原清单。\n- 核对顺序为独立任务、明确合并范围/备注、未覆盖；范围内单位相符不误标红，并说明成果单独编制和质控；真实单位差异和未覆盖仍标红。\n- 新上传按相同合并范围识别，保留区县独立名称；修正井陉矿区优先适用“井陉县（含矿区）”明确范围，不误借另一合并区公司。\n- 移除展示、悬停及上传提示中的排除统计表述；旧存储说明展示时过滤，历史证据、报告和统计函数不变。\n- 增加实际合并成员、未覆盖/跨成果/单位不符、双浏览器悬停与线上只读回归。\n',1))
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert master_before==re.search(r'var masterList = \[[\s\S]*?\n\];', Path('index.html').read_text()).group()
assert mapping_before==Path('task-unit-mappings.js').read_bytes()
print('v1.2.9 applied; original directory byte-identical')
