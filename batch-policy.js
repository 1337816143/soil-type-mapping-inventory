(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SoilBatchPolicy = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var digits = '零一二三四五六七八九';
  function number(value) {
    if (/^\d+$/.test(String(value))) return Number(value);
    var s = String(value || '').replace(/两/g, '二');
    if (s === '十') return 10;
    if (s.indexOf('十') >= 0) {
      var p = s.split('十');
      return (p[0] ? digits.indexOf(p[0]) : 1) * 10 + (p[1] ? digits.indexOf(p[1]) : 0);
    }
    return digits.indexOf(s);
  }
  function chinese(n) {
    n = Number(n);
    if (n < 10) return digits[n];
    if (n < 100) return (n < 20 ? '' : digits[Math.floor(n / 10)]) + '十' + (n % 10 ? digits[n % 10] : '');
    return String(n);
  }
  function validate(p) {
    if (!p || !Number.isInteger(+p.year) || +p.year < 2000 || +p.year > 2100 ||
        !Number.isInteger(+p.round) || +p.round < 1 || +p.round > 99 ||
        !Number.isInteger(+p.batch) || +p.batch < 1 || +p.batch > 999) throw new Error('请填写有效年份、质控轮次和反馈批次');
    return {year:+p.year, round:+p.round, batch:+p.batch, supplement:!!p.supplement};
  }
  // Only recognized historical names inherit 2026/round 1. Unknown labels are not reassigned.
  function parse(value) {
    var s = String(value || '').normalize('NFKC').replace(/\s+/g, '').replace(/[()]/g,'')
      .replace(/第三次全国土壤普查|全国第三次土壤普查/g,'三普');
    var year = s.match(/(20\d{2})年/);
    var round = s.match(/第([一二三四五六七八九十两\d]+)(?:次(?:质控)?|轮)/);
    var batch = s.match(/第([一二三四五六七八九十两\d]+)批/);
    if (!batch && !round && !/首轮/.test(s)) return null;
    try {
      return Object.assign(validate({year:year ? +year[1] : 2026, round:round ? number(round[1]) : 1,
        batch:batch ? number(batch[1]) : 1, supplement:/第[一二三四五六七八九十两\d]+批补充/.test(s)}),
        {explicit:!!(year && round), raw:String(value || '')});
    } catch (error) { return null; }
  }
  function format(value) {
    var p = typeof value === 'object' && value ? validate(value) : parse(value);
    return p ? p.year + '年第' + chinese(p.round) + '次第' + p.batch + '批' + (p.supplement ? '补充' : '') : String(value || '');
  }
  function identity(value) {
    var p = parse(value);
    return p ? [p.year, p.round, p.batch, p.supplement ? 1 : 0].join(':') : String(value || '').replace(/\s+/g, '');
  }
  function applyToItem(item, meta, selection) {
    if (!item || !meta || meta.kind !== 'quality') return meta;
    var chosen = item.manualBatch || (selection && format(selection)) || meta.batch || item.batch;
    var p = parse(chosen);
    if (p) {
      if (meta.catalogMatched && (p.year !== 2026 || p.round !== 1)) { meta.expectedSha256 = ''; meta.catalogExact = false; }
      meta.batch = item.batch = format(p);
      item.qcYear = p.year; item.qcRound = p.round; item.feedbackBatch = p.batch;
      item.batchSupplement = p.supplement;
    }
    return meta;
  }
  return {parse:parse, format:format, identity:identity, validate:validate, applyToItem:applyToItem};
});
