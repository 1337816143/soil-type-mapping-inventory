/* Read-only national inspection catalog. Deliberately independent of collection statistics. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SoilNationalInspectionCore = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  var TOPICS = [
    {id:'soilType', label:'土壤类型图'},
    {id:'soilAttr', label:'土壤属性图'},
    {id:'farmland', label:'耕地质量等级评价'},
    {id:'degradation', label:'土壤退化与障碍分析'},
    {id:'specialty', label:'土特产品土壤适宜性评价'},
    {id:'agriSuitability', label:'土壤农业利用适宜性评价'},
    {id:'landUse', label:'土壤资源评价与利用报告'},
    {id:'reports', label:'总体、工作、数据报告'}
  ];
  var COUNTIES = [
    {id:'jinzhou', label:'晋州', cityId:'shijiazhuang', city:'石家庄'},
    {id:'shexian', label:'涉县', cityId:'handan', city:'邯郸'},
    {id:'ningjin', label:'宁晋', cityId:'xingtai', city:'邢台'},
    {id:'bazhou', label:'霸州', cityId:'langfang', city:'廊坊'}
  ];
  var KINDS = [{id:'quality', label:'质控材料'}, {id:'scoring', label:'评分材料'}];
  var FILE_ROOT = 'national-inspection-files/';
  function find(list, id) { return list.find(function (entry) { return entry.id === id; }); }
  function fail(message) { throw new Error('国家抽查清单：' + message); }
  function identifier(value, label) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value)) fail(label + '缺少稳定 ID');
    return value;
  }
  function text(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\u0000-\u001f\u007f]/.test(value)) fail(label + '无效');
    return value.trim();
  }
  function filePath(value) {
    if (typeof value !== 'string' || value.indexOf(FILE_ROOT) !== 0 || value.length > 1024 || /[\\%?#:\u0000-\u001f\u007f]/.test(value)) fail('文件路径必须位于独立国家抽查材料目录');
    var parts = value.split('/');
    if (parts.some(function (part) { return !part || part === '.' || part === '..' || part.trim() !== part; })) fail('文件路径包含非法片段');
    if (!/\.(pdf|docx?|xlsx?|pptx?|zip|txt|csv|png|jpe?g|webp)$/i.test(value)) fail('文件格式不受支持');
    return value;
  }
  function catalog(input) {
    if (!input || input.schemaVersion !== 1 || !Array.isArray(input.batches) || !Array.isArray(input.materials)) fail('版本或结构无效');
    var batchIds = new Set(), materialIds = new Set(), relations = new Set();
    var batches = input.batches.map(function (entry) {
      if (!entry || typeof entry !== 'object') fail('批次无效');
      var id = identifier(entry.id, '批次');
      if (batchIds.has(id)) fail('批次 ID 重复');
      batchIds.add(id);
      return {id:id, label:text(entry.label, '批次名称')};
    });
    var materials = input.materials.map(function (entry) {
      if (!entry || typeof entry !== 'object') fail('材料无效');
      var id = identifier(entry.id, '材料');
      if (materialIds.has(id)) fail('材料 ID 重复');
      materialIds.add(id);
      if (!find(TOPICS, entry.topicId)) fail('专题不在当前专题清单中');
      var county = find(COUNTIES, entry.countyId);
      if (!county || county.cityId !== entry.cityId) fail('区县与所属市不匹配');
      if (!find(KINDS, entry.materialType)) fail('材料类别必须为质控或评分');
      if (!batchIds.has(entry.batchId)) fail('材料未关联已登记的真实批次');
      var path = filePath(entry.path), name = text(entry.name, '文件名称');
      if (name !== path.slice(path.lastIndexOf('/') + 1)) fail('文件名称必须与原文件路径末段一致');
      var relation = [entry.topicId, entry.countyId, entry.materialType, entry.batchId, path].join('|');
      if (relations.has(relation)) fail('相同材料关联重复');
      relations.add(relation);
      return {id:id, topicId:entry.topicId, countyId:entry.countyId, cityId:entry.cityId, materialType:entry.materialType, batchId:entry.batchId, path:path, name:name};
    });
    batches.forEach(function (batch) {
      if (!materials.some(function (entry) { return entry.batchId === batch.id; })) fail('不得登记没有真实材料的空批次');
    });
    return {schemaVersion:1, batches:batches, materials:materials};
  }
  function query(data, filters) {
    filters = filters || {};
    var search = String(filters.search || '').trim().toLocaleLowerCase();
    return data.materials.filter(function (entry) {
      if (filters.topicId && entry.topicId !== filters.topicId) return false;
      if (filters.countyId && entry.countyId !== filters.countyId) return false;
      if (filters.batchId && entry.batchId !== filters.batchId) return false;
      var county = find(COUNTIES, entry.countyId), batch = find(data.batches, entry.batchId);
      return !search || [entry.name, county.city, county.label, batch.label, find(KINDS, entry.materialType).label].join(' ').toLocaleLowerCase().includes(search);
    });
  }
  function uniqueFiles(materials) {
    var paths = new Set();
    return materials.filter(function (entry) { if (paths.has(entry.path)) return false; paths.add(entry.path); return true; });
  }
  function summary(materials) {
    return {files:uniqueFiles(materials).length, batches:new Set(materials.map(function (entry) { return entry.batchId; })).size};
  }
  function sourceUrl(path) { return './' + filePath(path).split('/').map(encodeURIComponent).join('/'); }
  return {topics:TOPICS, counties:COUNTIES, kinds:KINDS, fileRoot:FILE_ROOT, catalog:catalog, query:query, uniqueFiles:uniqueFiles, summary:summary, sourceUrl:sourceUrl};
});
