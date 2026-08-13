(function () {
  'use strict';

  if (window.SoilQualityFileRouting) return;

  // 北部当前收到的综合质控报告仅对应这三类主要成果。
  // 其他成果类型仍可由普通文件名规则单独识别，但不得由北部综合报告自动扩展。
  var COVERED_KEYS = ['soilType','soilAttr','farmland'];
  var ALIASES = {
    '徐水县':'徐水区',
    '满城':'满城区',
    '清苑':'清苑区',
    '高阳':'高阳县',
    '顺平':'顺平县',
    '雄安新区本级':'雄安新区',
    '雄安本级':'雄安新区',
    '承德市本级':'承德市'
  };
  var GENERIC = {'合并区':true,'市级':true,'全市':true};
  var XIONGAN_SOIL_TYPE_AGGREGATE = {'雄县':true,'安新县':true,'容城县':true,'雄安新区':true};
  var authorityExact = {};
  var authorityCanonical = {};
  var authorityPayload = null;

  function clean(value) {
    value = String(value == null ? '' : value);
    try { value = value.normalize('NFKC'); } catch (error) {}
    return value.replace(/[\u200B-\u200D\uFEFF\s]/g, '').trim();
  }

  function normalizeLabel(value) {
    var label = clean(value);
    return ALIASES[label] || label;
  }

  function basename(path) {
    var value = String(path || '').replace(/\\/g, '/');
    return value.slice(value.lastIndexOf('/') + 1);
  }

  function canonicalFilename(value) {
    var text = basename(value);
    try { text = text.normalize('NFKC'); } catch (error) {}
    return text.toLowerCase()
      .replace(/质量控制/g, '质控')
      .replace(/第三次全国土壤普查/g, '三普')
      .replace(/全国第三次土壤普查/g, '三普')
      .replace(/\.(docx?|pdf|xlsx?|pptx?|zip|rar)$/i, '')
      .replace(/[\s\u3000（）()【】\[\]{}《》<>“”"'·,，。:：;；_\-—–]+/g, '')
      .replace(/以[^为]{1,20}为例/g, '以x为例');
  }

  function cloneAssociation(item, sourceTarget) {
    return {
      city:String(item && item.city || ''),
      unit:String(item && item.unit || ''),
      district:String(item && item.district || ''),
      sourceTarget:String(sourceTarget != null ? sourceTarget : (item && item.sourceTarget || ''))
    };
  }

  function filterKeys(keys) {
    var seen = {};
    return (Array.isArray(keys) ? keys : []).filter(function (key) {
      if (COVERED_KEYS.indexOf(key) < 0 || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function scopeAuthorityDocument(doc) {
    doc = doc || {};
    var keys = filterKeys(doc.dataKeys);
    if (!keys.length) keys = COVERED_KEYS.slice();
    var associations = {};
    keys.forEach(function (key) {
      associations[key] = Array.isArray(doc.associationsByDataKey && doc.associationsByDataKey[key]) ?
        doc.associationsByDataKey[key].map(function (item) { return cloneAssociation(item); }) : [];
    });
    return Object.assign({}, doc, {
      dataKeys:keys,
      associationsByDataKey:associations
    });
  }

  function setAuthority(payload) {
    authorityPayload = payload && Array.isArray(payload.documents) ? Object.assign({}, payload, {
      activeDataKeys:COVERED_KEYS.slice(),
      documents:payload.documents.map(scopeAuthorityDocument)
    }) : null;
    authorityExact = {};
    authorityCanonical = {};
    (authorityPayload ? authorityPayload.documents : []).forEach(function (doc) {
      var name = basename(doc.filename);
      authorityExact[name] = doc;
      var canonical = canonicalFilename(name);
      if (!authorityCanonical[canonical]) authorityCanonical[canonical] = [];
      authorityCanonical[canonical].push(doc);
    });
    try {
      window.dispatchEvent(new CustomEvent('soil-north-authority-ready', {
        detail:{documentCount:authorityPayload ? authorityPayload.documents.length : 0, dataKeys:COVERED_KEYS.slice()}
      }));
    } catch (error) {}
    return authorityPayload;
  }

  function findAuthority(filename, size) {
    var name = basename(filename);
    var candidates = authorityExact[name] ? [authorityExact[name]] : (authorityCanonical[canonicalFilename(name)] || []);
    if (!candidates.length) return null;
    size = Number(size || 0);
    if (size) {
      var exactSize = candidates.filter(function (doc) { return Number(doc.size || 0) === size; })[0];
      if (exactSize) return exactSize;
    }
    return candidates[0];
  }

  function authorityAssociations(filename, dataKey, size) {
    if (COVERED_KEYS.indexOf(dataKey) < 0) return [];
    var doc = findAuthority(filename, size);
    if (!doc || !doc.associationsByDataKey || !Array.isArray(doc.associationsByDataKey[dataKey])) return [];
    return doc.associationsByDataKey[dataKey].map(function (item) { return cloneAssociation(item); });
  }

  function parseTargets(filename) {
    var authority = findAuthority(filename, 0);
    if (authority && Array.isArray(authority.targets)) return authority.targets.slice();
    var name = basename(filename).replace(/\.(docx?|pdf|xlsx?|zip|rar)$/i, '');
    var marker = name.search(/(?:第三次全国土壤普查|三普).*成果.*(?:质控|质量控制).*报告/);
    if (marker < 0) marker = name.indexOf('第三次全国土壤普查');
    if (marker < 0) return [];
    var prefix = name.slice(0, marker)
      .replace(/和市级$/,'、市级')
      .replace(/全市及([^、，,]+)/g,'全市、$1');
    return prefix.split(/[、，,]+/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function isSharedReport(filename) {
    if (findAuthority(filename, 0)) return true;
    return /(?:第三次全国土壤普查|三普).*成果.*(?:质控|质量控制).*报告/.test(basename(filename)) && parseTargets(filename).length > 0;
  }

  function listFor(dataKey) {
    var lists = window.SoilTaskUnitLists || {};
    var list = dataKey === 'soilType' ? lists.soilType : lists.other;
    if (!Array.isArray(list)) list = window.masterList || [];
    return Array.isArray(list) ? list : [];
  }

  function cityName(entry) {
    return String(entry && (entry.city || entry.name) || '');
  }

  function districtTarget(label, hintCity) {
    var normalized = normalizeLabel(label);
    if ((normalized === '市级' || normalized === '全市') && hintCity) return normalizeLabel(hintCity);
    return normalized;
  }

  function findMatches(label, dataKey, hintCity) {
    var desired = districtTarget(label, hintCity);
    var matches = [];
    listFor(dataKey).forEach(function (city) {
      var currentCity = cityName(city);
      if (hintCity && clean(currentCity) !== clean(hintCity)) return;
      (city.items || city.units || []).forEach(function (unit) {
        var unitName = String(unit.unit || unit.name || '');
        (unit.districts || []).forEach(function (district) {
          if (normalizeLabel(district) === desired) {
            matches.push({city:currentCity, unit:unitName, district:String(district)});
          }
        });
      });
    });
    return matches;
  }

  function uniqueMatch(matches) {
    var seen = {}, result = [];
    (matches || []).forEach(function (item) {
      var key = [clean(item.city),clean(item.unit),clean(item.district)].join('|');
      if (seen[key]) return;
      seen[key] = true;
      result.push(item);
    });
    return result;
  }

  function aggregateXiongan(label, dataKey) {
    var normalized = normalizeLabel(label);
    if (dataKey !== 'soilType' || !XIONGAN_SOIL_TYPE_AGGREGATE[normalized]) return [];
    return uniqueMatch(findMatches('雄安新区', 'soilType', '雄安新区'));
  }

  function nearestResolved(items, index, direction) {
    for (var i=index+direction;i>=0&&i<items.length;i+=direction) {
      if (items[i].resolved && items[i].resolved.length === 1) return items[i].resolved[0].city;
    }
    return '';
  }

  function resolveTargets(targets, dataKey, filename, size) {
    if (COVERED_KEYS.indexOf(dataKey) < 0) return {associations:[], unresolved:[], authoritative:false, ignored:true};
    var authoritative = filename ? authorityAssociations(filename, dataKey, size) : [];
    if (authoritative.length) return {associations:authoritative, unresolved:[], authoritative:true};

    var items = (targets || []).map(function (source) {
      var label = normalizeLabel(source);
      return {source:String(source), label:label, generic:!!GENERIC[label], resolved:[]};
    });

    items.forEach(function (item) {
      if (item.generic) return;
      item.resolved = aggregateXiongan(item.label, dataKey);
      if (!item.resolved.length) item.resolved = uniqueMatch(findMatches(item.label, dataKey, ''));
    });

    items.forEach(function (item, index) {
      if (!item.generic) return;
      var left = nearestResolved(items, index, -1);
      var right = nearestResolved(items, index, 1);
      var hint = '';
      if (item.label === '全市' && right) hint = right;
      else if (left && right && clean(left) === clean(right)) hint = left;
      else if (left && !right) hint = left;
      else if (right && !left) hint = right;
      else if (left && right) hint = left;
      item.resolved = uniqueMatch(findMatches(item.label, dataKey, hint));
      item.hintCity = hint;
    });

    var associations = [], unresolved = [];
    items.forEach(function (item) {
      if (item.resolved.length !== 1) {
        unresolved.push({target:item.source, normalized:item.label, matches:item.resolved.length, hintCity:item.hintCity || ''});
        return;
      }
      associations.push(cloneAssociation(item.resolved[0], item.source));
    });

    var seen = {};
    associations = associations.filter(function (item) {
      var key = [clean(item.city),clean(item.unit),clean(item.district)].join('|');
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
    return {associations:associations, unresolved:unresolved, authoritative:false};
  }

  function expandExplicit(record) {
    if (!record || !record.associationsByDataKey) return [];
    var output = [];
    var keys = filterKeys(record.dataKeys);
    if (!keys.length) keys = COVERED_KEYS.filter(function (key) { return Array.isArray(record.associationsByDataKey[key]); });
    keys.forEach(function (dataKey) {
      (record.associationsByDataKey[dataKey] || []).forEach(function (target) {
        output.push({
          kind:'quality-control',
          dataKey:dataKey,
          city:target.city,
          unit:target.unit,
          district:target.district,
          batch:record.batch || '管理员导入',
          path:record.path,
          name:record.name || basename(record.path),
          uploadedAt:record.uploadedAt || '',
          sharedSource:true,
          sourceTargets:Array.isArray(record.targets) ? record.targets.slice() : [],
          sourceTarget:target.sourceTarget || '',
          registeredOnly:!!record.registeredOnly,
          fileAvailable:record.fileAvailable !== false,
          associationStatus:record.associationStatus || ''
        });
      });
    });
    return output;
  }

  function expandRecord(record) {
    if (!record || !record.path) return [];
    var explicit = expandExplicit(record);
    if (explicit.length) return explicit;
    if (!Array.isArray(record.targets) || !record.targets.length || !Array.isArray(record.dataKeys) || !record.dataKeys.length) {
      return [record];
    }
    var output = [];
    filterKeys(record.dataKeys).forEach(function (dataKey) {
      var result = resolveTargets(record.targets, dataKey, record.name || basename(record.path), record.expectedSize || record.size || 0);
      result.associations.forEach(function (target) {
        output.push({
          kind:'quality-control',
          dataKey:dataKey,
          city:target.city,
          unit:target.unit,
          district:target.district,
          batch:record.batch || '管理员导入',
          path:record.path,
          name:record.name || basename(record.path),
          uploadedAt:record.uploadedAt || '',
          sharedSource:true,
          sourceTargets:record.targets.slice(),
          sourceTarget:target.sourceTarget || '',
          registeredOnly:!!record.registeredOnly,
          fileAvailable:record.fileAvailable !== false,
          associationStatus:record.associationStatus || ''
        });
      });
    });
    return output;
  }

  function inspectFile(filename, dataKeys, size) {
    var authority = findAuthority(filename, size);
    var targets = authority && Array.isArray(authority.targets) ? authority.targets.slice() : parseTargets(filename);
    var keys = authority && Array.isArray(authority.dataKeys) ? filterKeys(authority.dataKeys) : filterKeys(dataKeys);
    if (!keys.length) keys = COVERED_KEYS.slice();
    var byKey = {}, unresolved = [], authoritative = !!authority;
    keys.forEach(function (key) {
      var result = resolveTargets(targets, key, filename, size);
      byKey[key] = result.associations;
      result.unresolved.forEach(function (item) {
        unresolved.push({dataKey:key,target:item.target,normalized:item.normalized,matches:item.matches,hintCity:item.hintCity});
      });
    });
    return {filename:basename(filename),targets:targets,dataKeys:keys,byKey:byKey,unresolved:unresolved,authoritative:authoritative};
  }

  function safeSegment(value) {
    return String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  }

  function sharedStoragePath(filename, batch) {
    return 'data/质控意见反馈_管理员导入/北部片区共享质控/' + safeSegment(batch || '管理员导入') + '/' + safeSegment(basename(filename));
  }

  window.SoilQualityFileRouting = {
    coveredKeys:COVERED_KEYS.slice(),
    normalizeLabel:normalizeLabel,
    parseTargets:parseTargets,
    isSharedReport:isSharedReport,
    resolveTargets:resolveTargets,
    expandRecord:expandRecord,
    inspectFile:inspectFile,
    sharedStoragePath:sharedStoragePath,
    setAuthority:setAuthority,
    findAuthority:findAuthority,
    authorityAssociations:authorityAssociations,
    canonicalFilename:canonicalFilename,
    getAuthority:function () { return authorityPayload; }
  };
})();
