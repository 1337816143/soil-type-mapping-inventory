(function () {
  'use strict';

  if (window.__soilNorthQualityUploadAdapterInstalled) return;
  window.__soilNorthQualityUploadAdapterInstalled = true;

  function Q() { return window.SoilAdminImport; }
  function R() { return window.SoilQualityFileRouting; }

  function ensureFirstRoundOption() {
    var select = document.getElementById('adm-batch');
    if (!select || Array.prototype.some.call(select.options, function (option) { return option.value === '第一轮'; })) return;
    var option = document.createElement('option');
    option.value = '第一轮';
    option.textContent = '第一轮';
    var insertBefore = Array.prototype.find.call(select.options, function (item) {
      return item.value === '第一批' || item.value === '__new__';
    });
    select.insertBefore(option, insertBefore || null);
  }

  function targetCount(inspection) {
    var seen = {};
    Object.keys(inspection.byKey || {}).forEach(function (dataKey) {
      (inspection.byKey[dataKey] || []).forEach(function (item) {
        seen[[item.city,item.unit,item.district].join('|')] = true;
      });
    });
    return Object.keys(seen).length;
  }

  function annotateRows() {
    var q = Q();
    var router = R();
    var list = document.getElementById('adm-list');
    if (!q || !router || !list || !q.state || !Array.isArray(q.state.files)) return;

    Array.prototype.forEach.call(list.querySelectorAll('.v2-row'), function (row) {
      var index = Number(row.dataset.i);
      var item = q.state.files[index];
      var file = item && item.file;
      if (!file || !router.isSharedReport(file.name)) return;
      var inspection = router.inspectFile(file.name, router.coveredKeys);
      var status = row.querySelector('.v2-file em');
      var destination = row.querySelector('.v2-file small');
      if (inspection.unresolved.length) {
        if (status) {
          status.className = 'warn';
          status.textContent = '北部共享质控：有 ' + inspection.unresolved.length + ' 个自动匹配项需要检查，暂不允许上传。';
        }
        return;
      }
      if (destination) {
        destination.textContent = router.sharedStoragePath(file.name, item.batch || '管理员导入');
      }
      if (status) {
        status.className = 'ok';
        status.textContent = '北部共享质控：1份原文件 → ' + targetCount(inspection) +
          ' 个任务单元 × 6类成果；仓库仅保存1份，统计自动关联。';
      }
    });
  }

  function addGuide() {
    var modal = document.getElementById('soilAdminImport');
    if (!modal || modal.querySelector('.north-quality-guide')) return;
    var guide = modal.querySelector('.adm-name-guide');
    if (!guide) return;
    var note = document.createElement('div');
    note.className = 'north-quality-guide';
    note.style.marginTop = '6px';
    note.style.color = '#1d4ed8';
    note.innerHTML = '<strong>北部片区共享质控：</strong>文件名在“第三次全国土壤普查成果质控报告”前列出的多个地区，会自动关联到同一份质控报告；原文件只上传1份。当前此类综合报告自动覆盖土壤类型图、土壤属性图、耕地质量等级评价、土壤退化与障碍分析、土特产品土壤适宜性评价、土壤农业利用适宜性评价6类成果。';
    guide.appendChild(note);
  }

  function refresh() {
    ensureFirstRoundOption();
    addGuide();
    annotateRows();
  }

  function install() {
    refresh();
    var list = document.getElementById('adm-list');
    if (list && !list.__northQualityObserver) {
      var observer = new MutationObserver(function () { setTimeout(refresh, 0); });
      observer.observe(list, {childList:true, subtree:true});
      list.__northQualityObserver = observer;
    }
    var batch = document.getElementById('adm-batch');
    if (batch && !batch.__northQualityBound) {
      batch.addEventListener('change', function () { setTimeout(annotateRows, 0); });
      batch.__northQualityBound = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(install, 700);
  setTimeout(install, 1600);
})();
