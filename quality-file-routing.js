(function () {
  'use strict';

  if (window.SoilQualityFileRouting) return;

  var COVERED_KEYS = ['soilType','soilAttr','farmland','degradation','specialty','agriSuitability'];
  var ALIASES = {
    '徐水县':'徐水区',
    '满城':'满城区',
    '清苑':'清苑区',
    '高阳':'高阳县',
    '顺平':'顺平县',
    '雄安新区本级':'雄安新区',
    '承德市本级':'承德市'
  };
  var GENERIC = {'合并区':true,'市级':true,'全市':true};

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

  function parseTargets(filename) {
    var name = basename(filename).replace(/\.(docx?|pdf|xlsx?|zip|rar)$/i, '');
    var marker = '第三次全国土壤普查成果质控报告';
    var cut = name.indexOf(marker);
    if (cut < 0) cut = name.indexOf('第三次全国土壤普查');
    if (cut < 0) return [];
    var prefix = name.slice(0, cut)
      .replace(/和市级$/,'、市级')
      .replace(/全市及([^、，,]+)/g,'全市、$1');
    return prefix.split(/[、，,]+/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function isSharedReport(filename) {
    return /第三次全国土壤普查\s*成果质控报告/.test(basename(filename)) && parseTargets(filename).length > 0;
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

  function nearestResolved(items, index, direction) {
    for (var i=index+direction;i>=0&&i<items.length;i+=direction) {
      if (items[i].resolved && items[i].resolved.length === 1) return items[i].resolved[0].city;
    }
    return '';
  }

  function resolveTargets(targets, dataKey) {
    var items = (targets || []).map(function (source) {
      var label = normalizeLabel(source);
      return {source:String(source), label:label, generic:!!GENERIC[label], resolved:[]};
    });

    items.forEach(function (item) {
      if (!item.generic) item.resolved = uniqueMatch(findMatches(item.label, dataKey, ''));
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
      associations.push(item.resolved[0]);
    });

    var seen = {};
    associations = associations.filter(function (item) {
      var key = [clean(item.city),clean(item.unit),clean(item.district)].join('|');
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
    return {associations:associations, unresolved:unresolved};
  }

  function expandRecord(record) {
    if (!record || !record.path) return [];
    if (!Array.isArray(record.targets) || !record.targets.length || !Array.isArray(record.dataKeys) || !record.dataKeys.length) {
      return [record];
    }
    var output = [];
    record.dataKeys.forEach(function (dataKey) {
      var result = resolveTargets(record.targets, dataKey);
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
          sourceTargets:record.targets.slice()
        });
      });
    });
    return output;
  }

  function inspectFile(filename, dataKeys) {
    var targets = parseTargets(filename);
    var keys = Array.isArray(dataKeys) && dataKeys.length ? dataKeys : COVERED_KEYS;
    var byKey = {}, unresolved = [];
    keys.forEach(function (key) {
      var result = resolveTargets(targets, key);
      byKey[key] = result.associations;
      result.unresolved.forEach(function (item) {
        unresolved.push({dataKey:key,target:item.target,normalized:item.normalized,matches:item.matches,hintCity:item.hintCity});
      });
    });
    return {filename:basename(filename),targets:targets,dataKeys:keys,byKey:byKey,unresolved:unresolved};
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
    sharedStoragePath:sharedStoragePath
  };
})();
