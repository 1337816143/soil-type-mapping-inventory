(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SoilReplyWorkflow = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function cleanText(value) {
    var output = String(value == null ? '' : value);
    if (typeof output.normalize === 'function') output = output.normalize('NFKC');
    return output.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  }

  function canonical(value) {
    return cleanText(value)
      .replace(/\s+/g, '')
      .replace(/\(市级\)/g, '');
  }

  function replyKey(city, unit, district, batch) {
    var base = [city, unit, district].map(canonical).join('_');
    return batch ? base + '_批次-' + canonical(batch) : base;
  }

  function keyFromBase(base, batch) {
    var normalized = canonical(base);
    return batch ? normalized + '_批次-' + canonical(batch) : normalized;
  }

  function basename(path) {
    var value = String(path || '').replace(/\\/g, '/');
    return value.slice(value.lastIndexOf('/') + 1);
  }

  function parseReplyFilename(path) {
    var name = basename(path);
    var current = name.match(/^(.+)_批次-(.+)_整改答复_([0-9]+)\.([a-z0-9]+)$/i);
    if (current) {
      return {
        key: keyFromBase(current[1], current[2]),
        batch: cleanText(current[2]),
        time: current[3],
        extension: current[4].toLowerCase(),
        file: String(path || name),
        legacy: false
      };
    }

    var legacy = name.match(/^(.*)_整改答复_([0-9]+)\.([a-z0-9]+)$/i);
    if (legacy) {
      return {
        key: keyFromBase(legacy[1], ''),
        batch: '',
        time: legacy[2],
        extension: legacy[3].toLowerCase(),
        file: String(path || name),
        legacy: true
      };
    }

    return null;
  }

  function buildIndex(files) {
    var index = {};
    (files || []).forEach(function (item) {
      var file = typeof item === 'string' ? item : String(item && (item.name || item.path) || '');
      var parsed = parseReplyFilename(file);
      if (!parsed) return;
      var old = index[parsed.key];
      if (!old || parsed.time > old.time) {
        index[parsed.key] = {
          file: parsed.file,
          time: parsed.time,
          batch: parsed.batch,
          legacy: parsed.legacy
        };
      }
    });
    return index;
  }

  return {
    cleanText: cleanText,
    canonical: canonical,
    replyKey: replyKey,
    parseReplyFilename: parseReplyFilename,
    buildIndex: buildIndex
  };
});
