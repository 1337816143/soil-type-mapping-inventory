(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SoilWorkRecordsCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var MAX_FILE = 95 * 1024 * 1024;
  var ALLOWED = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|md|zip|rar|7z|png|jpe?g|webp|gif|avif|bmp|mp4|mov)$/i;
  function id() { return 'wr-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,12)); }
  function text(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (x) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]; }); }
  function safeName(v) { return text(v, 160).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/,'') || '附件'; }
  function isImage(v) { return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(String(v || '')); }
  function validateFile(file) {
    if (!file || !ALLOWED.test(file.name || '')) throw new Error('不支持此附件格式：' + (file && file.name || '未知文件'));
    if (file.size > MAX_FILE) throw new Error('单个附件不能超过 95 MiB：' + file.name);
    if (file.size <= 0) throw new Error('附件为空：' + file.name);
    return true;
  }
  function normalize(record) {
    record = record || {};
    return {id:text(record.id || id(),80), revision:Number(record.revision || 0), title:text(record.title,300), time:text(record.time,32), location:text(record.location,500), people:text(record.people,1000), notes:text(record.notes,20000), attachments:Array.isArray(record.attachments) ? record.attachments.slice() : [], createdAt:text(record.createdAt,40), updatedAt:text(record.updatedAt,40)};
  }
  function validate(record) {
    if (!/^wr-[a-zA-Z0-9-]{8,75}$/.test(record.id || '')) throw new Error('记录编号无效');
    if (!record.title || !record.title.trim()) throw new Error('请填写事项。');
    var parts=String(record.time||'').match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/);
    if (!parts) throw new Error('请填写有效的时间。');
    var value=new Date(Number(parts[1]),Number(parts[2])-1,Number(parts[3]),Number(parts[4]),Number(parts[5]));
    if (value.getFullYear()!==Number(parts[1]) || value.getMonth()+1!==Number(parts[2]) || value.getDate()!==Number(parts[3]) || value.getHours()!==Number(parts[4]) || value.getMinutes()!==Number(parts[5])) throw new Error('请填写有效的时间。');
    if ((record.attachments || []).length > 30) throw new Error('每条记录最多上传 30 个附件。');
    return true;
  }
  function matches(record, query, from, to) {
    var terms = String(query || '').normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    var haystack = [record.title,record.time,record.location,record.people,record.notes].concat((record.attachments || []).map(function (a) { return a.name; })).join(' ').normalize('NFKC').toLowerCase();
    var day = String(record.time || '').slice(0,10);
    return terms.every(function (term) { return haystack.includes(term); }) && (!from || day >= from) && (!to || day <= to);
  }
  function visible(records, query, from, to) { return (records || []).filter(function (r) { return matches(r,query,from,to); }).sort(function (a,b) { return b.time.localeCompare(a.time) || b.id.localeCompare(a.id); }); }
  function draftKey(record) { return 'draft:' + record.id; }
  function bytes(size) { return size >= 1048576 ? (size/1048576).toFixed(1)+' MiB' : Math.ceil(size/1024)+' KiB'; }
  return {id:id, esc:esc, safeName:safeName, isImage:isImage, normalize:normalize, validate:validate, validateFile:validateFile, visible:visible, matches:matches, draftKey:draftKey, bytes:bytes, maxFile:MAX_FILE};
});
