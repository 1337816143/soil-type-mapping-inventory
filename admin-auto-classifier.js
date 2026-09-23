(function () {
  'use strict';

  if (window.__soilAdminAutoClassifierInstalled) return;
  window.__soilAdminAutoClassifierInstalled = true;

  var PACKAGE_URL = './data/north-quality-feedback-package.json';
  // 未明确写出成果名称的“综合/成果质控报告”默认只按当前已确认的三类主要成果处理。
  // 后续成果若有独立文件名（如“土壤退化…”）仍由下方显式规则正常识别，不受此默认值影响。
  var COMPREHENSIVE_KEYS = ['soilType','soilAttr','farmland'];
  var TYPE_LABELS = {
    soilType:'土壤类型图',
    soilAttr:'土壤属性图',
    farmland:'耕地质量等级评价',
    degradation:'土壤退化与障碍分析',
    specialty:'土特产品土壤适宜性评价',
    agriSuitability:'土壤农业利用适宜性评价',
    landUse:'土地资源评价与利用报告',
    reports:'总体、工作、数据报告'
  };
  var NAME_ALIASES = {
    '信都县':'信都区',
    '南和县':'南和区',
    '沙河县':'沙河市',
    '石家市':'石家庄市',
    '邯郸主城区':'合并区',
    '邯郸市主城区':'合并区',
    '石家庄合并区':'合并区',
    '邯郸合并区':'合并区',
    '雄安新区本级':'雄安新区',
    '雄安本级':'雄安新区',
    '雄安新区市级':'雄安新区'
  };
  var catalogExact = {};
  var catalogCanonical = {};
  var catalogLoaded = false;
  var manualMode = false;
  var refreshQueued = false;
  var applyingDefaults = false;

  function Q() { return window.SoilAdminImport; }
  function R() { return window.SoilQualityFileRouting; }

  function normalize(value) {
    value = String(value == null ? '' : value);
    try { value = value.normalize('NFKC'); } catch (error) {}
    return value.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\\/g, '/').trim();
  }

  function basename(path) {
    var value = normalize(path);
    return value.slice(value.lastIndexOf('/') + 1);
  }

  function stem(path) {
    return basename(path).replace(/\.[^.]+$/, '');
  }

  function compact(value) {
    value = normalize(value).toLowerCase();
    Object.keys(NAME_ALIASES).forEach(function (from) {
      value = value.split(from.toLowerCase()).join(NAME_ALIASES[from].toLowerCase());
    });
    return value
      .replace(/质量控制/g, '质控')
      .replace(/第三次全国土壤普查/g, '三普')
      .replace(/全国第三次土壤普查/g, '三普')
      .replace(/成果质量质控/g, '成果质控')
      .replace(/\.(pdf|docx?|xlsx?|pptx?|zip)$/i, '')
      .replace(/[\s\u3000（）()【】\[\]{}《》<>“”"'·,，。:：;；_\-—–]+/g, '');
  }

  function canonicalFilename(value) {
    var text = compact(basename(value));
    text = text.replace(/以[^为]{1,20}为例/g, '以x为例');
    return text;
  }

  function unique(values) {
    var seen = {};
    return (values || []).filter(function (value) {
      value = String(value || '');
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function inferBatch(text) {
    text = normalize(text);
    var policy = window.SoilBatchPolicy;
    var roundInfo = policy && policy.parse(text);
    if (roundInfo && roundInfo.explicit) return policy.format(roundInfo);
    var special = text.match(/第[一二三四五六七八九十0-9]+批\s*补充/);
    if (special) return special[0].replace(/\s+/g, '');
    var round = text.match(/第[一二三四五六七八九十0-9]+轮/);
    if (round) return round[0];
    var batch = text.match(/第[一二三四五六七八九十0-9]+批/);
    if (batch) return batch[0];
    if (/首轮|第一轮质控/.test(text)) return '第一轮';
    return '';
  }

  function keysForSegment(segment) {
    segment = normalize(segment);
    var keys = [];
    var rules = [
      ['specialty', /土特产品(?:土壤)?适宜性|特色(?:农)?产品.*适宜性|特色产品/],
      ['agriSuitability', /土壤农业利用适宜性|农业利用适宜性|农业适宜性/],
      ['landUse', /土地资源评价与利用报告|土地资源评价|土地利用评价/],
      ['farmland', /耕地质量(?:等级)?评价|耕地质量等级|耕地质量评价|耕评|耕地等级/],
      ['degradation', /土壤退化|退化与障碍|障碍分析|障碍因素/],
      ['soilAttr', /土壤属性图|土壤属性成果|属性图成果|属性图/],
      ['soilType', /土壤类型图|土壤类型成果|土类图|类型图成果/]
    ];
    rules.forEach(function (rule) { if (rule[1].test(segment)) keys.push(rule[0]); });
    return unique(keys);
  }

  function isReportFamily(text) {
    return /总体报告|工作报告|数据报告/.test(normalize(text));
  }
  function isReportReference(text) {
    return /模板|范本|指南|导引|规范|规程|编制要求|培训|参考资料|参考文件/.test(text) &&
      !/质控意见|审核意见|审查意见|复核意见/.test(text);
  }
  function inferDataKeys(text) {
    text = normalize(text);
    var segments = text.split('/').filter(Boolean);
    for (var i = segments.length - 1; i >= 0; i--) {
      var segmentKeys = keysForSegment(segments[i]);
      if (segmentKeys.length) return segmentKeys;
    }
    var keys = keysForSegment(text);
    if (keys.length) return keys;
    if (isReportFamily(text) && !isReportReference(text)) return ['reports'];
    if (/三普.*成果.*(?:质控|质量控制).*报告|第三次全国土壤普查.*成果.*(?:质控|质量控制).*报告|综合质控报告|成果综合质控/.test(text)) {
      return COMPREHENSIVE_KEYS.slice();
    }
    return [];
  }

  function inferKind(text, dataKeys) {
    text = normalize(text);
    if (!(dataKeys && dataKeys.length) && isReportFamily(text) && isReportReference(text)) return 'reference';
    if (/质控|质量控制|审核意见|审查意见|复核意见|成果检查/.test(text) || (dataKeys && dataKeys.length)) return 'quality';
    if (/参考资料|技术规程|技术规范|规范|标准|指南|培训|模板|手册|参考文件/.test(text)) return 'reference';
    return 'unknown';
  }

  function currentMode() {
    var select = document.getElementById('adm-kind');
    return select ? String(select.value || '') : '';
  }

  function registerCatalog(payload) {
    catalogExact = {};
    catalogCanonical = {};
    (payload && Array.isArray(payload.documents) ? payload.documents : []).forEach(function (doc) {
      var base = basename(doc.filename);
      var canonical = canonicalFilename(base);
      catalogExact[base] = doc;
      if (!catalogCanonical[canonical]) catalogCanonical[canonical] = [];
      catalogCanonical[canonical].push(doc);
    });
    catalogLoaded = true;
    return payload;
  }

  function catalogMatch(item) {
    var file = item && item.file;
    var name = basename(file && file.name || item && item.path || '');
    var candidates = [];
    if (catalogExact[name]) candidates = [catalogExact[name]];
    if (!candidates.length) candidates = catalogCanonical[canonicalFilename(name)] || [];
    if (!candidates.length) return null;

    var size = file ? Number(file.size || 0) : 0;
    var doc = candidates.filter(function (candidate) { return size && Number(candidate.size) === size; })[0] || candidates[0];
    var sizeMatches = !size || !doc.size || Number(doc.size) === size;
    var exactName = basename(doc.filename) === name;
    return {
      kind:'quality',
      confidence:(exactName && sizeMatches) ? 'catalog-exact' : (sizeMatches ? 'catalog-canonical' : 'catalog-name'),
      catalogExact:!!(exactName && sizeMatches),
      catalogMatched:true,
      sizeMatches:sizeMatches,
      batch:String(doc.batch || '第一轮'),
      dataKeys:Array.isArray(doc.dataKeys) ? doc.dataKeys.slice() : COMPREHENSIVE_KEYS.slice(),
      targets:Array.isArray(doc.targets) ? doc.targets.slice() : [],
      expectedSha256:sizeMatches ? String(doc.sha256 || '') : '',
      expectedSize:sizeMatches ? Number(doc.size || 0) : 0,
      source:'north-package-registry'
    };
  }

  // Company discovery may read all lists, but task resolution MUST stay in the
  // requested result type. Never mutate SoilTaskUnitLists or window.masterList.
  function listForKey(key) {
    var registry = window.SoilTaskUnitLists || {};
    if (typeof registry.listFor === 'function') return registry.listFor(key) || [];
    if (Array.isArray(registry[key])) return registry[key];
    if (key === 'soilType' && Array.isArray(registry.soilType)) return registry.soilType;
    if (key !== 'soilType' && Array.isArray(registry.other)) return registry.other;
    return Array.isArray(window.masterList) ? window.masterList : [];
  }
  function taskListsFor(dataKeys) {
    return unique(dataKeys || []).map(listForKey);
  }
  function flattenTasks(dataKeys) {
    var rows = [], seen = new Set();
    taskListsFor(dataKeys).forEach(function (list) {
      list.forEach(function (city) {
        (city.items || []).forEach(function (unit) {
          (unit.districts || []).forEach(function (district) {
            var id = [city.city,unit.unit,district].join('\n');
            if (!seen.has(id)) {
              seen.add(id); rows.push({city:city.city,unit:unit.unit,district:district});
            }
          });
        });
      });
    });
    return rows;
  }
  function textHas(text, value) { return !!value && compact(text).indexOf(compact(value)) >= 0; }
  function companyForm(name) {
    return compact(name).replace(/牵头人|牵头单位|联合体成员/g,'').replace(/[\/＋+]/g,'');
  }
  function unitForms(unit) {
    return unique([unit].concat(String(unit).split(/\s*\/\s*/))).map(companyForm).filter(Boolean);
  }
  function unitMatches(unit, named) { return unitForms(unit).indexOf(companyForm(named)) >= 0; }
  var companyCache = null;
  function companyNames() {
    var refs = Object.keys(TYPE_LABELS).map(listForKey);
    if (companyCache && refs.every(function (v,i) { return v === companyCache.refs[i]; })) return companyCache.names;
    var names = unique(flattenTasks(Object.keys(TYPE_LABELS)).map(function(r) { return r.unit; }));
    companyCache = {refs:refs,names:names}; return names;
  }
  function detectCompany(text, source) {
    var normalized = normalize(text).replace(/\.[^.\/]+$/, ''), value = companyForm(normalized);
    var names = companyNames().filter(function (name) { return value.indexOf(companyForm(name)) >= 0; });
    // Full, delimiter-separated names also work for a newly appointed company.
    // Never guess an abbreviation or silently replace an explicit company.
    normalized.split(/[_;；|\n\r]+/).forEach(function (part) {
      part = part.trim().replace(/^(?:作业单位|公司名称|承编单位)\s*[:：=]\s*/, '');
      if (part.length <= 120 && /^[\u4e00-\u9fffA-Za-z0-9（）()·\s\-]{2,}(?:有限公司|有限责任公司|公司|大学|研究所|研究院|勘查院|勘察院|大队|调查中心|监测中心)$/.test(part) &&
          !/质控|质量控制|审核意见|三普|20\d{2}年|第[一二三四\d]+批/.test(part)) names.push(part);
    });
    names = unique(names).filter(function (name, i, all) {
      var form = companyForm(name);
      return !all.some(function (other,j) { return j !== i && companyForm(other).length > form.length && companyForm(other).includes(form); });
    });
    names = names.filter(function(name,i,all){return all.findIndex(function(n){return companyForm(n)===companyForm(name);})===i;});
    return {names:names,name:names.length===1?names[0]:'',source:source || 'filename',
      unparsed:!names.length && /有限公司|有限责任公司/.test(normalized)};
  }
  function companySignal(item) {
    // Only the physical filename supplies an explicit company. A stale enclosing
    // directory must not override the requested type/district's embedded list.
    return detectCompany(basename(item.file && item.file.name || item.path || ''),'filename');
  }
  function geographyText(text, company) {
    var out = compact(text);
    var names = companyNames().concat(company && company.names || []);
    names.sort(function(a,b){return b.length-a.length;}).forEach(function(name){
      [name].concat(String(name).split(/\s*\/\s*/)).forEach(function(part){
        out = out.split(compact(part)).join('');
        out = out.split(companyForm(part)).join('');
      });
    });
    return out;
  }
  function regionForms(name) {
    var aliases = {'井陉县（含矿区）':['井陉县','井陉矿区'], '孟村县':['孟村回族自治县'],
      '青龙县':['青龙满族自治县'], '丰宁县':['丰宁满族自治县'], '宽城县':['宽城满族自治县'],
      '围场县':['围场满族蒙古族自治县']};
    return [name].concat(aliases[name] || []).map(compact);
  }

  // Read-only source remarks supplied by the owner on 2026-07-27, repeated
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
  // A different company is not necessarily an error. Repair only reviewed
  // typo pairs or unknown names, with a unique result/city/task directory row.
  function unknownUnit(value) {
    return /^(?:|[-—–/?？]+|未(?:标明|注明|明确|知|明|分类|识别)(?:公司|单位|作业单位)?|(?:公司|单位)(?:未明|不详)|不详|未知公司|未知单位|暂无)$/.test(normalize(value).replace(/[\s（）()]/g,''));
  }
  function oneEdit(a,b) {
    if(a===b || Math.abs(a.length-b.length)>1)return false;
    var i=0,j=0,n=0;
    while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++n>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
    return n+(a.length-i)+(b.length-j)===1;
  }
  function unitEvidence(key,city,district,value) {
    var check=directoryStatus(key,city,value,district),listed=check.listedUnits;
    var result={action:'keep',unit:value||'',originalUnit:value||'',reason:check.message,listedUnits:listed};
    if(listed.length!==1)return result;
    var target=listed[0],old=companyForm(value),full=companyForm(target);
    if(unknownUnit(value)){result.action='fill';result.unit=target;result.reason='该成果、该市及任务单元在原通讯录中唯一对应；补齐未明单位。';return result;}
    if(unitMatches(target,value)){result.reason='与该类成果通讯录一致。';return result;}
    // Verified project name, not a fuzzy alias. The unchanged typed roster
    // must uniquely assign this exact target; other companies remain red.
    // Source and scope: docs/TUYU_NAME_EVIDENCE.md.
    if(normalize(value)==='河北图宇地理信息科技有限公司' && full===companyForm('河北图宇科技有限公司')) {
      result.action='typo';result.unit=target;
      result.reason='外部正式名称资料与该成果、该市及任务单元的原通讯录一致；订正本项目中不规范扩写的单位名称。核对依据：docs/TUYU_NAME_EVIDENCE.md。';
      return result;
    }
    var known=unique([].concat.apply([],companyNames().map(unitForms)));
    if(old.length<10 || full.length<10 || /[\/＋+]/.test(target) || known.includes(old) || !/(?:公司|研究所|研究院|大学|中心|大队)$/.test(target) || !oneEdit(old,full))return result;
    var reviewedTypoPairs={'中地科动察设计有限公司':'中地科勘察设计有限公司'};
    if(companyForm(reviewedTypoPairs[normalize(value)]||'')!==full)return result;
    var near=known.filter(function(n){return oneEdit(old,n);});
    if(near.length!==1 || near[0]!==full)return result;
    result.action='typo';result.unit=target;result.reason='已核实的单位错字对，且原通讯录按成果及地区唯一对应；不以字符串相似度替换其他真实单位。';return result;
  }

  function directoryAttributes(key,city,unit,district,batch,file) {
    var status=directoryStatus(key,city,unit,district);
    var title=[TYPE_LABELS[key]||key,city+' / '+district,'作业单位：'+unit,batch||'',file?basename(file):'',status.message].filter(Boolean).join('\n');
    return {mismatch:status.mismatch,code:status.code,relation:status.relation,title:cleanDirectoryMessage(title)};
  }
  // Out-of-directory geography is a literal, separated name, NOT a fuzzy
  // correction or a new roster entry. The user must confirm it before upload.
  function outsideCandidate(item,key,company) {
    var name=stem(item.file&&item.file.name||item.path||'');
    var tokens=normalize(name).split(/[_;；|]+/).map(function(s){return s.trim();}).filter(Boolean);
    var knownCities=unique(flattenTasks(Object.keys(TYPE_LABELS)).map(function(r){return r.city;}));
    var cities=tokens.filter(function(t){return knownCities.some(function(c){return compact(c)===compact(t);});});
    cities=unique(cities);
    if(cities.length!==1)return null;
    var city=knownCities.find(function(c){return compact(c)===compact(cities[0]);});
    var districts=unique(tokens.filter(function(t){return compact(t)!==compact(city) &&
      !company.names.some(function(c){return companyForm(c)===companyForm(t);}) &&
      /^[\u4e00-\u9fff]{2,20}(?:县|区|市)$/.test(t) && !/报告|质控|成果|评价|公司|研究|上传|测试/.test(t);}));
    if(districts.length>1)return null;
    var district=districts[0];
    if(!district && tokens.some(function(t){return /^(?:市级|市本级|市级汇总|本级)$/.test(t);}))district=city;
    if(!district)return null;
    // Do not turn contradictory city/county pairs into out-of-list tasks.
    var elsewhere=flattenTasks([key]).some(function(r){return r.city!==city && regionForms(r.district).includes(compact(district));});
    if(elsewhere)return null;
    if(directoryStatus(key,city,company.name,district).code!=='outside-list')return null;
    return {dataKey:key,city:city,unit:company.name||'',district:district,
      unitSource:company.name?'filename':'',listedUnits:[],note:'清单外任务；核对归属后归档，原通讯录保持不变。'};
  }
  function reviewAssignments(item,keys,byKey,problems,company) {
    var rows=[];
    keys.forEach(function(key){(byKey[key]||[]).forEach(function(row){
      if(row.unitSource!=='manual'){
        var evidence=unitEvidence(key,row.city,row.district,row.unit);
        if(evidence.action!=='keep'){
          row.unitCorrection=evidence;row.unit=evidence.unit;row.unitSource='directory-evidence';
          row.note='依通讯录'+(evidence.action==='typo'?'订正单位错字':'补齐未明单位')+'：“'+evidence.originalUnit+'” → “'+evidence.unit+'”。'+evidence.reason;
        }
      }
      var status=directoryStatus(key,row.city,row.unit,row.district);
      row.directoryStatus=status.code;row.directoryMessage=status.message;row.directoryRelation=status.relation;rows.push(row);
    });});
    var outside=rows.filter(function(row){return row.directoryStatus==='outside-list';});
    var signature=outside.length?JSON.stringify([basename(item.file&&item.file.name||item.path||''),Number(item.file&&item.file.size||0),Number(item.file&&item.file.lastModified||0),
      keys,rows.map(function(r){return [r.dataKey,r.city,r.district,r.unit];})]):'';
    var pending=outside.length>0 && !problems.length && item.unlistedConfirmation!==signature;
    if(pending)problems.push(issue('','unlisted-confirmation','清单外任务：请核对市、任务单元、成果及单位，点击“确认按文件名归档”。原通讯录保持不变。',outside));
    outside.forEach(function(row){row.unlistedConfirmed=!!signature&&item.unlistedConfirmation===signature;});
    return {version:2,byKey:byKey,issues:problems,company:company,confirmationKey:signature,
      canConfirmOutside:pending,hasOutside:outside.length>0,
      complete:!problems.length&&keys.length>0&&keys.every(function(k){return byKey[k]&&byKey[k].length>0;})};
  }
  function confirmOutside(item) {
    var meta=applyItemMetadata(item),a=meta.assignment;
    if(!a||!a.canConfirmOutside)throw new Error('当前文件不是信息完整、等待确认的清单外任务，请重新核对。');
    item.unlistedConfirmation=a.confirmationKey;
    return applyItemMetadata(item);
  }

  function issue(key, code, message, rows) {
    return {dataKey:key,code:code,message:message,candidates:(rows || []).map(function(r){return {city:r.city,unit:r.unit,district:r.district};})};
  }
  function resolveOne(text, key, company) {
    var rows = flattenTasks([key]).concat(mergedDirectoryRows(key)), geo = geographyText(text,company);
    if (!rows.length) return {issue:issue(key,'missing-list','该类成果没有可用对照清单，请联系管理员核对。')};
    var cities = unique(rows.filter(function(r){return geo.includes(compact(r.city));}).map(function(r){return r.city;}));
    if (cities.length > 1) return {issue:issue(key,'multiple-cities','文件名或目录出现多个所属市：'+cities.join('、')+'。请只保留本文件的所属市。')};
    var city = cities[0] || '';
    var matches = rows.filter(function(r){
      return r.district !== r.city && !/市级|本级|汇总/.test(r.district) && regionForms(r.district).some(function(form){return geo.includes(form);});
    });
    // A parent-city name is context, not a second city-level task when a county
    // is present. Keep genuine multi-county or contradictory names unresolved.
    var labels = unique(matches.map(function(r){return r.district;}));
    labels = labels.filter(function(d){return !labels.some(function(long){return long!==d && compact(long).includes(compact(d));});});
    if (labels.length > 1) return {issue:issue(key,'multiple-districts','识别到多个任务单元：'+labels.join('、')+'。请使用多地区共享报告命名或人工明确归属。',matches)};
    var district = labels[0] || '';
    // Soil-type maps aggregate these source areas to the Xiongan task only.
    if (!district && key==='soilType' && /雄县|安新县|容城县|雄安新区/.test(geo)) {
      city='雄安新区';district='雄安新区';
    }
    var candidates;
    if (district) {
      candidates = rows.filter(function(r){return r.district===district && (!city || r.city===city);});
      if (!candidates.length) return {issue:issue(key,'city-district-conflict','所属市与任务单元不一致，或该类成果清单中没有此组合：'+[city,district].join(' / '),matches)};
    } else if (city) {
      var remaining=geo.split(compact(city)).join('');
      if (/[\u4e00-\u9fff]{1,12}(?:县|区)/.test(remaining.replace(/市级|市本级|市级汇总/g,''))) {
        return {issue:issue(key,'unknown-district','已识别所属市，但区县名称未匹配该类成果清单。请使用平台任务单元名称。')};
      }
      candidates=rows.filter(function(r){return r.city===city && (r.district===city || /市级|本级|汇总/.test(r.district));});
      if (!candidates.length) return {issue:issue(key,'missing-city-task','已识别'+city+'，但该类成果清单没有对应市级任务；请核对任务单元。')};
    } else return {issue:issue(key,'missing-district','尚未识别任务单元。请在文件名中补充区县或市级名称；“合并区”须同时写所属市。')};
    var geos = unique(candidates.map(function(r){return r.city+'\n'+r.district;}));
    if (geos.length>1 && company.name) {
      var narrowed=candidates.filter(function(r){return unitMatches(r.unit,company.name);});
      if (narrowed.length) {candidates=narrowed;geos=unique(candidates.map(function(r){return r.city+'\n'+r.district;}));}
    }
    if (geos.length!==1) return {issue:issue(key,'ambiguous-region','同名任务单元对应多个地区，请补充所属市：'+unique(candidates.map(function(r){return r.city+' / '+r.district;})).join('；'),candidates)};
    var listed=unique(candidates.map(function(r){return r.unit;})), unit='', note='';
    if (company.name) {
      var equivalent=listed.filter(function(u){return unitMatches(u,company.name);});
      unit=equivalent.length===1?equivalent[0]:company.name;
      if (!equivalent.length) note='文件名单位优先；该类成果清单单位为“'+listed.join('、')+'”，本次归档使用“'+unit+'”，不改清单。';
    } else if (listed.length===1) unit=listed[0];
    else return {issue:issue(key,'ambiguous-unit','该类成果、该地区在清单中仍有多个作业单位，请补充公司全称：'+listed.join('；'),candidates)};
    return {row:{dataKey:key,city:candidates[0].city,district:candidates[0].district,unit:unit,
      unitSource:company.name?company.source:'type-district-list',listedUnits:listed,note:note}};
  }
  function resolveAssignments(item, keys, targets) {
    var company=companySignal(item), byKey={}, problems=[], filename=basename(item.file&&item.file.name||item.path||'');
    var context=[item.sourcePath,item.path].filter(Boolean).join(' / '), manual=item.manualAssociation;
    keys.forEach(function(key){byKey[key]=[];});
    if (!keys.length) problems.push(issue('','missing-type','尚未识别成果类型，请使用完整成果名称或人工选择成果类型。'));
    if (company.names.length>1) problems.push(issue('','multiple-companies','识别到多个不同公司：'+company.names.join('；')+'。请明确本文件作业单位；联合体请使用清单中的完整单位名称。'));
    if (company.unparsed) problems.push(issue('','unparsed-company','检测到公司名称，但未能完整提取。请以“_公司全称_”单独分隔，避免默认为清单单位。'));
    if (manual) {
      problems=[];
      if (!keys.length || !manual.city || !manual.unit || !manual.district) problems.push(issue('','manual-incomplete','人工调整尚未填写完整，请选择成果类型、市、作业单位和任务单元。'));
      else keys.forEach(function(key){byKey[key]=[{dataKey:key,city:manual.city,unit:manual.unit,district:manual.district,unitSource:'manual'}];});
    } else if (!problems.length) {
      keys.forEach(function(key){
        if (targets && targets.length) {
          // Preserve the existing target parser and generic/aggregate geography
          // rules, then pin each association's company independently per type.
          var result=R().resolveTargets(targets,key,'');
          (result.unresolved||[]).forEach(function(u){problems.push(issue(key,'shared-unresolved','共享报告中的“'+(u.target||u)+'”未匹配，请检查所属市和任务名称。'));});
          (result.associations||[]).forEach(function(r){
            var listed=r.unit, unit=company.name?(unitMatches(listed,company.name)?listed:company.name):listed;
            byKey[key].push({dataKey:key,city:r.city,unit:unit,district:r.district,unitSource:company.name?company.source:'type-district-list',listedUnits:[listed],note:unit!==listed?'本次使用文件名单位“'+unit+'”；清单单位“'+listed+'”不改。':''});
          });
          if (!byKey[key].length && !(result.unresolved||[]).length) problems.push(issue(key,'unsupported-shared-type','此共享格式不支持该成果类型，请按单地区单成果命名或人工调整。'));
        } else {
          // Filename geography wins; use folder context only when it is needed.
          var result=resolveOne(filename,key,company);
          if (result.issue && ['missing-district','ambiguous-region'].includes(result.issue.code) && context) result=resolveOne(filename+' / '+context,key,company);
          if(result.issue && ['unknown-district','missing-city-task'].includes(result.issue.code)){
            var candidate=outsideCandidate(item,key,company);
            if(candidate){
              byKey[key].push(candidate);
              if(!candidate.unit)problems.push(issue(key,'outside-missing-unit','该市 / 任务单元不在此类成果通讯录中，无法推断作业单位。请在文件名补充“_单位全称_”。',[candidate]));
              result=null;
            }
          }
          if(result){if (result.issue) problems.push(result.issue); else byKey[key].push(result.row);}
        }
      });
    }
    return reviewAssignments(item,keys,byKey,problems,company);
  }
  function inferSingleAssociation(text, dataKeys) {
    var item={file:{name:basename(text)},sourcePath:text,path:text};
    var resolved=resolveAssignments(item,dataKeys||[],[]), rows=[];
    if(!resolved.complete)return null;
    Object.keys(resolved.byKey).forEach(function(k){rows=rows.concat(resolved.byKey[k]);});
    if(!rows.length||rows.some(function(r){return r.city!==rows[0].city||r.unit!==rows[0].unit||r.district!==rows[0].district;}))return null;
    return {city:rows[0].city,unit:rows[0].unit,district:rows[0].district};
  }
  function matchingDescription(meta) {
    var a=meta && meta.assignment;
    if(!a)return '';
    if(a.issues.length)return a.issues.map(function(p){return (TYPE_LABELS[p.dataKey]?TYPE_LABELS[p.dataKey]+'：':'')+p.message;}).join('\n');
    var lines=[];
    Object.keys(a.byKey).forEach(function(key){a.byKey[key].forEach(function(r){
      var source=r.unitSource==='manual'?'人工指定':r.unitSource==='directory-evidence'?'通讯录证据订正':r.unitSource==='filename'?'文件名单位':r.unitSource==='directory'?'目录单位':'按该类成果清单匹配';
      lines.push((TYPE_LABELS[key]||key)+' · '+r.city+' / '+r.district+' → '+r.unit+'（'+source+'）'+(r.note?'；'+r.note:'')+(r.directoryRelation==='merged-member'?'；'+r.directoryMessage:''));
    });});
    return lines.join('\n');
  }

  function sharedReportTargets(fileName) {
    var router = R();
    if (router && typeof router.isSharedReport === 'function' && router.isSharedReport(fileName)) {
      return router.parseTargets(fileName) || [];
    }
    var name = stem(fileName);
    var marker = name.search(/(?:第三次全国土壤普查|三普).*成果.*(?:质控|质量控制).*报告/);
    if (marker < 0) return [];
    var prefix = name.slice(0, marker).replace(/(?:、|,|，|和|及)?市级$/, '、市级');
    return unique(prefix.split(/[、,，;；和及]+/).map(function (part) { return part.trim(); }).filter(Boolean));
  }

  function resolveShared(targets, dataKeys, fileName) {
    var router = R();
    if (!router || typeof router.resolveTargets !== 'function' || !targets.length) return {associations:[],unresolved:targets.slice()};
    var all = [];
    var unresolved = [];
    (dataKeys || []).forEach(function (key) {
      var result = router.resolveTargets(targets, key, fileName || '');
      (result.associations || []).forEach(function (association) {
        all.push({dataKey:key,city:association.city,unit:association.unit,district:association.district,target:association.target});
      });
      (result.unresolved || []).forEach(function (target) { unresolved.push(target); });
    });
    return {associations:all, unresolved:unique(unresolved)};
  }

  function classifyItem(item) {
    if (!item) return {kind:'unknown',confidence:'low',dataKeys:[],targets:[],batch:'',associations:[],unresolvedTargets:[]};
    var exact = catalogMatch(item);
    var file = item.file;
    var text = [item.sourcePath, item.path, file && file.name].filter(Boolean).join(' / ');
    var fileName = basename(file && file.name || item.path || '');
    var keys = exact ? exact.dataKeys.slice() : item.manualDataKey ? [item.manualDataKey] : inferDataKeys(text);
    var kind = exact ? exact.kind : inferKind(text, keys);
    var batch = exact ? exact.batch : (inferBatch(text) || String(item.batch && item.batch !== '管理员导入' ? item.batch : ''));
    var targets = exact ? exact.targets.slice() : [];
    if (!targets.length && kind === 'quality' && keys.indexOf('reports') < 0) {
      var company = companySignal(item), targetName = normalize(fileName);
      company.names.forEach(function(name){
        [name].concat(String(name).split(/\s*\/\s*/)).forEach(function(part){targetName=targetName.split(normalize(part)).join('');});
      });
      targetName=targetName.replace(/^[_+\s]+|[_+\s]+(?=(?:三普|第三次全国土壤普查))/g,'');
      targets = sharedReportTargets(targetName);
    }
    if (targets.length && !keys.length) keys = COMPREHENSIVE_KEYS.slice();
    if (kind === 'unknown' && currentMode()) kind = currentMode();

    var association = null;
    var shared = {associations:[], unresolved:[]};
    if (kind === 'quality' && targets.length) shared = resolveShared(targets, keys, fileName);
    else if (kind === 'quality') association = inferSingleAssociation(text, keys);
    var assignment = kind === 'quality' && !exact ? resolveAssignments(item,keys,targets) : null;
    if(assignment){
      var assigned=[];Object.keys(assignment.byKey).forEach(function(k){assigned=assigned.concat(assignment.byKey[k]);});
      association=assignment.complete && assigned.length && assigned.every(function(r){return r.city===assigned[0].city&&r.unit===assigned[0].unit&&r.district===assigned[0].district;}) ? assigned[0] : null;
      shared.associations=assigned;shared.unresolved=assignment.issues.map(function(p){return p.message;});
    }

    var result = exact || {};
    result.kind = kind || result.kind || 'unknown';
    result.confidence = result.confidence || ((keys.length || targets.length || association || inferBatch(text)) ? 'high' : 'low');
    result.catalogExact = !!result.catalogExact;
    result.catalogMatched = !!result.catalogMatched;
    result.batch = batch || result.batch || '';
    result.dataKeys = keys;
    result.targets = targets;
    result.association = association;
    result.assignment = assignment;
    result.associations = shared.associations || [];
    result.unresolvedTargets = shared.unresolved || [];
    result.expectedSha256 = String(result.expectedSha256 || '');
    result.expectedSize = Number(result.expectedSize || (file ? file.size : 0) || 0);
    result.source = result.source || 'filename-path-rules';
    return result;
  }

  function applyItemMetadata(item) {
    var meta = classifyItem(item);
    if (window.SoilBatchPolicy) window.SoilBatchPolicy.applyToItem(item, meta, Q() && Q().state && Q().state.batchSelection);
    item.autoMeta = meta;
    if (meta.batch) item.batch = meta.batch;
    if (meta.assignment) {
      // Discard stale guesses from the legacy importer; a different result type
      // must not inherit its company. Human overrides live separately.
      var manual=item.manualAssociation;
      item.city=manual?String(manual.city||''):'';item.unit=manual?String(manual.unit||''):'';item.district=manual?String(manual.district||''):'';
      var assigned=[];Object.keys(meta.assignment.byKey).forEach(function(k){assigned=assigned.concat(meta.assignment.byKey[k]);});
      if(assigned.length && !manual){
        ['city','unit','district'].forEach(function(k){if(assigned.every(function(r){return r[k]===assigned[0][k];}))item[k]=assigned[0][k];});
      }
    }
    if (meta.association) {
      item.city = meta.association.city || item.city || '';
      item.unit = meta.association.unit || item.unit || '';
      item.district = meta.association.district || item.district || '';
    }
    return meta;
  }

  function isResolved(item, meta) {
    if (!meta || meta.kind === 'unknown') return false;
    if (meta.kind !== 'quality') return true;
    if (meta.assignment) return meta.assignment.complete;
    if (!meta.dataKeys.length) return false;
    if (meta.targets.length) return meta.unresolvedTargets.length === 0;
    return !!(item && item.city && item.unit && item.district);
  }

  function selectionMetadata(files) {
    var metas = (files || []).map(applyItemMetadata);
    var knownKinds = unique(metas.map(function (meta) { return meta.kind !== 'unknown' ? meta.kind : ''; }));
    var batches = unique(metas.map(function (meta) { return meta.batch; }));
    var unresolved = metas.filter(function (meta, index) { return !isResolved(files[index], meta); }).length;
    return {
      metas:metas,
      kind:knownKinds.length === 1 ? knownKinds[0] : (knownKinds.length ? 'mixed' : 'unknown'),
      batch:batches.length === 1 ? batches[0] : '',
      unresolved:unresolved,
      catalogExact:metas.filter(function (meta) { return meta.catalogExact; }).length,
      catalogMatched:metas.filter(function (meta) { return meta.catalogMatched; }).length
    };
  }

  function setSelectValue(id, value) {
    var element = document.getElementById(id);
    if (!element || !value || element.value === value) return;
    var optionExists = Array.prototype.some.call(element.options || [], function (option) { return option.value === value; });
    if (!optionExists && id === 'adm-batch') {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      var insertBefore = Array.prototype.find.call(element.options || [], function (item) { return item.value === '__new__'; });
      element.insertBefore(option, insertBefore || null);
    }
    element.value = value;
    applyingDefaults=true;
    try { element.dispatchEvent(new Event('change', {bubbles:true})); } catch (error) {}
    finally { applyingDefaults=false; }
  }

  function typeSummary(metas) {
    var keys = unique([].concat.apply([], metas.map(function (meta) { return meta.dataKeys || []; })));
    return keys.length ? keys.map(function (key) { return TYPE_LABELS[key] || key; }).join('、') : '未识别成果类型';
  }

  function ensureStyles() {
    if (document.getElementById('admin-auto-classifier-style')) return;
    var style = document.createElement('style');
    style.id = 'admin-auto-classifier-style';
    style.textContent =
      '.auto-import-summary{margin:0 0 10px;padding:10px 12px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:.74rem;line-height:1.65}' +
      '.auto-import-summary strong{font-weight:750}.auto-import-summary .auto-import-actions{margin-top:6px}' +
      '.auto-import-summary button{padding:4px 9px;border:1px solid #93c5fd;border-radius:6px;background:#fff;color:#1d4ed8;cursor:pointer;font-size:.7rem}' +
      '.auto-import-hidden{display:none!important}.v2-row.auto-import-resolved .v2-fields{display:none!important}' +
      '.v2-row.auto-import-needs-review .v2-fields{display:grid!important}.auto-import-path{color:#1d4ed8!important;font-weight:600}';
    document.head.appendChild(style);
  }

  function fieldFor(id) {
    var node = document.getElementById(id);
    return node && node.closest ? node.closest('.adm-field') : null;
  }

  function setManualFieldsVisible(visible) {
    ['adm-kind','adm-data-key','adm-batch','adm-city','adm-unit','adm-district'].forEach(function (id) {
      var field = fieldFor(id);
      if (field) field.classList.toggle('auto-import-hidden', !visible);
    });
    var apply = document.getElementById('v2-apply');
    if (apply) apply.classList.toggle('auto-import-hidden', !visible);
    var q = Q();
    var list = document.getElementById('adm-list');
    if (!q || !q.state || !list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var item = q.state.files[Number(row.dataset.i)];
      var complete = item && isResolved(item, item.autoMeta);
      row.classList.toggle('auto-import-resolved', !visible && !!complete);
      row.classList.toggle('auto-import-needs-review', visible || !complete);
    });
  }

  function renderSummary(state) {
    var modal = document.getElementById('soilAdminImport');
    if (!modal) return;
    var summary = modal.querySelector('.auto-import-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'auto-import-summary';
      var list = document.getElementById('adm-list');
      var holder = list && list.closest ? list.closest('.adm-field') : null;
      if (holder) holder.parentNode.insertBefore(summary, holder);
      else if (modal.querySelector('.adm-grid')) modal.querySelector('.adm-grid').appendChild(summary);
    }
    if (!summary) return;
    if (!state || !state.metas.length) {
      summary.innerHTML = '<strong>自动识别已启用。</strong>公司名称可选：文件名公司优先；未写公司时按该类成果＋地区查询对照清单。原清单不修改；北部28份登记报告仍按权威索引关联。';
      setManualFieldsVisible(manualMode);
      return;
    }
    var kindText = state.kind === 'quality' ? '质控意见' : state.kind === 'reference' ? '参考资料' : state.kind === 'mixed' ? '混合类型' : '未识别';
    var matchText = state.catalogMatched ? '；' + state.catalogMatched + ' 份命中北部28份登记表' : '';
    var reviewText = state.unresolved ? '；仍有 ' + state.unresolved + ' 份需要人工检查' : '；全部已自动识别，无需手动指定';
    summary.innerHTML = '<strong>自动识别：</strong>' + kindText + (state.batch ? ' · ' + state.batch : '') + ' · ' + typeSummary(state.metas) + matchText + reviewText +
      '<div class="auto-import-actions"><button type="button" data-auto-import-toggle="1">' + (manualMode ? '恢复自动模式' : '显示人工调整') + '</button></div>';
    var button = summary.querySelector('[data-auto-import-toggle]');
    if (button) button.onclick = function () { manualMode = !manualMode; if(!manualMode){var q=Q();(q&&q.state&&q.state.files||[]).forEach(function(item){delete item.manualAssociation;delete item.manualDataKey;});} refresh(); var current=Q();if(current&&typeof current.renderPreview==='function')current.renderPreview(); };
    setManualFieldsVisible(manualMode || state.unresolved > 0 || state.kind === 'mixed');
  }

  function annotateRows() {
    var q = Q();
    var list = document.getElementById('adm-list');
    if (!q || !list || !q.state) return;
    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var item = q.state.files[Number(row.dataset.i)];
      var meta = item && item.autoMeta;
      var status = row.querySelector('.v2-file em');
      var preview = row.querySelector('.v2-file small');
      if (!item || !meta || !status) return;
      var text = '';
      var className = 'ok';
      if(meta.assignment){
        text=(meta.assignment.complete?'匹配完成：':'需要核对：')+matchingDescription(meta);
        className=meta.assignment.complete?'ok':'warn';
        if(preview)preview.textContent=(meta.batch||item.batch||'未识别批次')+' ｜ 原文件仅保存1份；按成果类型分别入库。';
        status.style.whiteSpace='pre-wrap';
      } else if (meta.kind === 'quality' && meta.targets.length && !meta.unresolvedTargets.length) {
        text = '自动关联完成：' + meta.targets.length + ' 个任务单元 × ' + meta.dataKeys.length + ' 类成果；原文件只保存1份。';
        if (preview) {
          preview.textContent = '共享质控报告 → ' + meta.targets.join('、') + ' ｜ ' + meta.dataKeys.map(function (key) { return TYPE_LABELS[key] || key; }).join('、');
          preview.classList.add('auto-import-path');
        }
      } else if (meta.kind === 'quality' && meta.association && meta.dataKeys.length) {
        text = '自动识别：' + meta.dataKeys.map(function (key) { return TYPE_LABELS[key] || key; }).join('、') + ' · ' + (meta.batch || item.batch || '未分批') + ' · ' + [item.city,item.unit,item.district].filter(Boolean).join(' / ');
      } else if (meta.kind === 'quality' && meta.dataKeys.length) {
        text = '已识别成果类型，但地区关联尚未完整匹配。请检查所属市、任务单元名称及作业单位。';
        className = 'warn';
      } else if (meta.kind === 'reference') {
        text = '自动识别为参考资料。';
      } else {
        text = '自动识别信息不足，请展开人工调整。';
        className = 'warn';
      }
      status.textContent = text;
      status.className = className;
      var assignments=meta.assignment, hasMismatch=assignments&&Object.keys(assignments.byKey).some(function(k){return assignments.byKey[k].some(function(r){return r.directoryStatus&&r.directoryStatus!=='matched';});});
      row.classList.toggle('directory-mismatch-preview',!!hasMismatch);
      if(hasMismatch)status.title='与作业单位通讯录不一致';else status.removeAttribute('title');
      var oldButton=row.querySelector('.confirm-outside-task');if(oldButton)oldButton.remove();
      if(assignments && (assignments.canConfirmOutside || assignments.hasOutside&&assignments.complete)){
        var button=document.createElement('button');button.type='button';button.className='confirm-outside-task';
        button.textContent=assignments.canConfirmOutside?'确认按文件名归档':'撤销清单外归档确认';
        button.onclick=function(){
          if(assignments.canConfirmOutside){
            var description=[];Object.keys(assignments.byKey).forEach(function(k){assignments.byKey[k].forEach(function(r){description.push((TYPE_LABELS[k]||k)+' · '+r.city+' / '+r.district+' → '+r.unit);});});
            if(!window.confirm('以下归属未列入对应成果的作业单位通讯录：\n\n'+description.join('\n')+'\n\n仅按以上信息归档，红色展示；不修改通讯录。确认继续？'))return;
            confirmOutside(item);
          }else{delete item.unlistedConfirmation;applyItemMetadata(item);}
          if(Q()&&Q().renderPreview)Q().renderPreview();
        };
        row.querySelector('.v2-file').appendChild(button);
      }
    });
  }

  function applySelectionDefaults(state) {
    if (!state || !state.metas.length) return;
    if (state.kind === 'quality' || state.kind === 'reference') setSelectValue('adm-kind', state.kind);
    if (state.batch) setSelectValue('adm-batch', state.batch);
    if (state.kind === 'quality') {
      var singletonKeys = unique(state.metas.map(function (meta) { return meta.dataKeys && meta.dataKeys.length === 1 ? meta.dataKeys[0] : ''; }));
      if (singletonKeys.length === 1 && state.metas.every(function (meta) { return meta.dataKeys.length === 1; })) setSelectValue('adm-data-key', singletonKeys[0]);
    }
  }

  // Projection only: local dropdown renders do not pass through Q.renderPreview.
  // Keep their summaries current without recursively changing form defaults.
  function renderPreviewSummary(state) {
    if (!state) return;
    annotateRows();
    renderSummary(state);
    if (window.SoilAdminAutoClassifier) window.SoilAdminAutoClassifier.lastSelection = state;
  }

  function refresh() {
    refreshQueued = false;
    ensureStyles();
    var q = Q();
    var files = q && q.state && Array.isArray(q.state.files) ? q.state.files : [];
    var state = selectionMetadata(files);
    applySelectionDefaults(state);
    renderPreviewSummary(state);
    return state;
  }

  function queueRefresh(delay) {
    if (refreshQueued && !delay) return;
    refreshQueued = true;
    setTimeout(refresh, delay || 0);
  }

  function watchStateFiles() {
    var q = Q();
    var state = q && q.state;
    if (!state || state.__autoClassifierFilesWatched) return;
    var current = Array.isArray(state.files) ? state.files : [];
    try {
      Object.defineProperty(state, 'files', {
        configurable:true,
        enumerable:true,
        get:function () { return current; },
        set:function (next) {
          current = Array.isArray(next) ? next : [];
          queueRefresh(0);
        }
      });
      state.__autoClassifierFilesWatched = true;
    } catch (error) {}
  }

  function wrapFunction(name) {
    var q = Q();
    if (!q || typeof q[name] !== 'function' || q[name].__autoClassifierWrapped) return;
    var original = q[name];
    var wrapped = function () {
      var result = original.apply(this, arguments);
      queueRefresh(0);
      return result;
    };
    wrapped.__autoClassifierWrapped = true;
    q[name] = wrapped;
  }

  function bindInputs() {
    ['adm-files','adm-folder'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input || input.__autoClassifierBound) return;
      input.addEventListener('change', function () { queueRefresh(120); });
      input.__autoClassifierBound = true;
    });
  }

  function loadCatalog() {
    return fetch(PACKAGE_URL + '?_=' + Date.now(), {cache:'no-store'})
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (payload) { registerCatalog(payload); refresh(); return payload; })
      .catch(function () { catalogLoaded = true; refresh(); return null; });
  }

  function install() {
    watchStateFiles();
    wrapFunction('renderPreview');
    wrapFunction('normalizePreparedFiles');
    wrapFunction('acceptSplitFiles');
    wrapFunction('open');
    bindInputs();
    refresh();
  }

  window.SoilAdminAutoClassifier = {
    get applyingDefaults(){return applyingDefaults;},
    comprehensiveKeys:COMPREHENSIVE_KEYS.slice(),
    typeLabels:Object.assign({}, TYPE_LABELS),
    inferBatch:inferBatch,
    inferDataKeys:inferDataKeys,
    inferKind:inferKind,
    inferSingleAssociation:inferSingleAssociation,
    unitEvidence:unitEvidence,unknownUnit:unknownUnit,
    directoryStatus:directoryStatus,directoryAttributes:directoryAttributes,confirmOutside:confirmOutside,
    cleanDirectoryMessage:cleanDirectoryMessage,mergedDirectoryRows:mergedDirectoryRows,
    listForKey:listForKey,resolveAssignments:resolveAssignments,detectCompany:detectCompany,matchingDescription:matchingDescription,isResolved:isResolved,
    classifyItem:classifyItem,
    applyItemMetadata:applyItemMetadata,
    selectionMetadata:selectionMetadata,
    loadCatalogData:function (payload) { registerCatalog(payload); return payload; },
    renderPreviewSummary:renderPreviewSummary,
    refresh:refresh,
    get lastSelection() { return this._lastSelection || null; },
    set lastSelection(value) { this._lastSelection = value; },
    isCatalogLoaded:function () { return catalogLoaded; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  [250,650,1150,1800].forEach(function (delay) { setTimeout(install, delay); });
  loadCatalog();
})();
