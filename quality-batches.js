(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SoilQualityBatches = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  // Legacy identifiers stay on disk. Only labels and matching keys are normalized.
  var YEAR = 2026;
  var NUM = '[一二三四五六七八九十百零〇两0-9]+';
  function number(value) {
    var text = String(value || '');
    if (/^\d+$/.test(text)) return Number(text);
    var digits = {'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
    if (text === '十') return 10;
    if (text.indexOf('十') >= 0) { var p = text.split('十'); return (p[0] ? digits[p[0]] : 1) * 10 + (digits[p[1]] || 0); }
    return digits[text] || 0;
  }
  function chinese(n) {
    var d = '零一二三四五六七八九';
    return n < 10 ? d[n] : n < 20 ? '十' + (n % 10 ? d[n % 10] : '') : n < 100 ? d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '') : String(n);
  }
  function parse(raw, defaults) {
    defaults = defaults || {};
    var s = String(raw == null ? '' : raw).normalize('NFKC').replace(/\s/g, '').replace(/第三次全国土壤普查|全国第三次土壤普查/g, '');
    var year = s.match(/(20\d{2})年?/);
    var round = s.match(new RegExp('第(' + NUM + ')(?:次(?:质控)?|轮(?:质控)?)'));
    var batch = s.match(new RegExp('第(' + NUM + ')批'));
    var onlyFirstRound = !batch && /^第[一1]轮(?:质控)?$/.test(s);
    var result = {
      year: year ? Number(year[1]) : Number(defaults.year || YEAR),
      round: round ? number(round[1]) : Number(defaults.round || 1),
      batch: batch ? number(batch[1]) : onlyFirstRound ? 1 : Number(defaults.batch || 0),
      supplement: /补充/.test(s),
      raw: String(raw || ''),
      explicitRound: !!round,
      explicitYear: !!year,
      recognized: !!(batch || round || /未分批|未标批次|管理员导入/.test(s) || !s)
    };
    if (result.year < 2000 || result.year > 2099 || result.round < 1 || result.round > 99 || result.batch < 0 || result.batch > 99) result.recognized = false;
    return result;
  }
  function label(raw, defaults) {
    var p = typeof raw === 'object' && raw ? raw : parse(raw, defaults);
    if (p.recognized === false) return p.raw || '未标批次';
    return p.year + '年第' + chinese(p.round) + '次' + (p.batch ? '第' + p.batch + '批' : '（未标批次）') + (p.supplement ? '（补充）' : '');
  }
  function key(raw) {
    var p = parse(raw);
    if (!p.recognized) return 'custom:' + p.raw.normalize('NFKC').replace(/\s/g, '');
    return [p.year, p.round, p.batch, p.supplement ? 'supplement' : 'main'].join(':');
  }
  function fromText(text) {
    var s = String(text || '').normalize('NFKC');
    var has = new RegExp('第' + NUM + '(次|轮|批)').test(s);
    if (!has) return '';
    return label(parse(s));
  }
  function choose(raw, text, explicit) {
    var p = parse(raw || fromText(text));
    if (explicit) {
      p.year = Number(explicit.year); p.round = Number(explicit.round);
      if (explicit.batch != null) p.batch = Number(explicit.batch);
      if (explicit.supplement != null) p.supplement = !!explicit.supplement;
      p.recognized = true;
    } else {
      var context = parse(text || '');
      if (context.explicitYear) p.year = context.year;
      if (context.explicitRound) p.round = context.round;
    }
    return label(p);
  }
  function unique(values) {
    var seen = new Set();
    return (values || []).filter(function (v) { var k = key(v); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  return {parse:parse, label:label, key:key, choose:choose, fromText:fromText, unique:unique, number:number, defaultYear:YEAR};
});
