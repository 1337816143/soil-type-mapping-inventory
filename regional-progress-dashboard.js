(function () {
  'use strict';

  if (window.__soilRegionalProgressInstalled) return;
  window.__soilRegionalProgressInstalled = true;

  var SOUTH_CITIES = ['石家庄市','邢台市','沧州市','衡水市','邯郸市','辛集市'];
  var REGION_ORDER = ['north','south'];
  var REGION_NAMES = {north:'河北省北部片区', south:'河北省南部片区'};
  var RESULT_NAMES = {
    soilType:'土壤类型图',
    soilAttr:'土壤属性图',
    farmland:'耕地质量等级评价',
    degradation:'土壤退化与障碍分析',
    specialty:'土特产品适宜性评价',
    agriSuitability:'土壤农业利用适宜性评价',
    landUse:'土地资源评价与利用报告'
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function installStyles() {
    if (document.getElementById('regional-progress-style')) return;
    var style = document.createElement('style');
    style.id = 'regional-progress-style';
    style.textContent =
      '.missing-banner>h3{margin-bottom:12px!important;font-size:1rem!important;font-weight:750!important}' +
      '.progress-overview-summary{display:grid!important;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px!important;margin:0 0 12px!important}' +
      '.progress-overview-summary .summary-card{position:relative;overflow:hidden;min-width:0;padding:12px 14px!important;border:1px solid #e5eaf2;border-radius:8px!important;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%)!important;box-shadow:0 1px 3px rgba(15,23,42,.05);text-align:left!important}' +
      '.progress-overview-summary .summary-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#3b82f6}' +
      '.progress-overview-summary .summary-card .num{font-size:1.32rem!important;line-height:1.2;color:#1d4ed8!important;letter-spacing:.01em}' +
      '.progress-overview-summary .summary-card .label{margin-top:4px!important;font-size:.74rem!important;color:#64748b!important}' +
      '.regional-progress-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:0}' +
      '.regional-progress-section{min-width:0;border:1px solid #ead8a5;border-radius:9px;background:#fff;overflow:hidden;box-shadow:0 1px 2px rgba(120,53,15,.04)}' +
      '.regional-progress-section>summary{display:grid;grid-template-columns:minmax(125px,.55fr) minmax(330px,1.45fr) auto;align-items:center;gap:12px;padding:11px 13px;cursor:pointer;list-style:none;background:#fffaf0;color:#78350f}' +
      '.regional-progress-section>summary::-webkit-details-marker{display:none}' +
      '.regional-progress-section>summary:after{content:"展开 ▾";font-size:.72rem;font-weight:700;white-space:nowrap;color:#a16207}' +
      '.regional-progress-section[open]>summary:after{content:"收起 ▴"}' +
      '.regional-progress-name{font-size:.95rem;font-weight:800;white-space:nowrap}' +
      '.regional-progress-brief{display:grid;grid-template-columns:repeat(3,minmax(86px,1fr));gap:6px;min-width:0}' +
      '.regional-progress-chip{display:flex;align-items:baseline;justify-content:center;gap:5px;min-width:0;padding:5px 8px;border:1px solid #eadfbe;border-radius:6px;background:rgba(255,255,255,.82);color:#92400e;white-space:nowrap}' +
      '.regional-progress-chip span{font-size:.68rem;color:#a16207}' +
      '.regional-progress-chip strong{font-size:.82rem;color:#78350f;font-weight:800}' +
      '.regional-progress-chip.missing{border-color:#fecaca;background:#fff7f7}' +
      '.regional-progress-chip.missing span,.regional-progress-chip.missing strong{color:#b91c1c}' +
      '.regional-progress-chip.complete{border-color:#bbf7d0;background:#f7fff9}' +
      '.regional-progress-chip.complete span,.regional-progress-chip.complete strong{color:#15803d}' +
      '.regional-progress-body{padding:10px 12px 12px;border-top:1px solid #f3e4b7}' +
      '.regional-progress-table{width:100%!important;min-width:0!important;border-collapse:collapse!important;table-layout:auto!important;font-size:.78rem!important;margin:0!important}' +
      '.regional-progress-table th{padding:7px 6px!important;background:#f5f7fa!important;border-bottom:2px solid #e2e8f0!important;text-align:center!important;white-space:normal!important}' +
      '.regional-progress-table th:first-child{text-align:left!important}' +
      '.regional-progress-table td{padding:6px!important;border-bottom:1px solid #e2e8f0!important;text-align:center!important}' +
      '.regional-progress-table td:first-child{text-align:left!important;font-weight:650}' +
      '.regional-progress-table tfoot td{font-weight:800;background:#f8fafc;border-top:2px solid #e2e8f0!important}' +
      '.regional-missing-title{margin:10px 0 6px;font-size:.76rem;font-weight:800;color:#92400e}' +
      '.regional-missing-list{display:flex;flex-direction:column;gap:5px}' +
      '.regional-missing-item{padding:5px 7px;border-radius:5px;background:#fff5cc;font-size:.72rem;line-height:1.45;color:#92400e;overflow-wrap:anywhere}' +
      '.regional-missing-empty{padding:7px;text-align:center;color:#15803d;font-size:.75rem;background:#f0fdf4;border-radius:6px}' +
      '.municipal-progress-missing{color:#dc2626;font-weight:800}.municipal-progress-complete{color:#16a34a;font-weight:800}' +
      '@media(max-width:1150px){.regional-progress-grid{grid-template-columns:1fr}.regional-progress-section>summary{grid-template-columns:minmax(135px,.55fr) minmax(330px,1.45fr) auto}}' +
      '@media(max-width:760px){.progress-overview-summary{grid-template-columns:repeat(2,minmax(120px,1fr))}.regional-progress-section>summary{grid-template-columns:1fr auto}.regional-progress-brief{grid-column:1/-1;grid-row:2}.regional-progress-section>summary:after{grid-column:2;grid-row:1}.regional-progress-name{grid-column:1;grid-row:1}}' +
      '@media(max-width:480px){.progress-overview-summary{grid-template-columns:1fr 1fr;gap:7px!important}.progress-overview-summary .summary-card{padding:10px 11px!important}.regional-progress-brief{grid-template-columns:1fr}.regional-progress-chip{justify-content:space-between}.regional-progress-table{font-size:.7rem!important}.regional-progress-table th,.regional-progress-table td{padding:5px 3px!important}}';
    document.head.appendChild(style);
  }

  function ensureShijiazhuangMunicipalTask() {
    var lists = window.SoilTaskUnitLists;
    var soil = lists && lists.soilType;
    if (!Array.isArray(soil)) return;
    var city = soil.find(function (entry) { return entry.city === '石家庄市'; });
    if (!city) return;
    var unit = city.items.find(function (entry) { return entry.unit === '河北高翔地理信息技术服务有限公司'; });
    if (!unit) return;
    var label = '石家庄市（市级）';
    if (unit.districts.indexOf(label) < 0) unit.districts.push(label);
  }

  function masterFor(dataKey) {
    var lists = window.SoilTaskUnitLists || {};
    return dataKey === 'soilType' ? (lists.soilType || window.masterList || []) : (lists.other || window.masterList || []);
  }

  function regionForCity(city) {
    return SOUTH_CITIES.indexOf(city) >= 0 ? 'south' : 'north';
  }

  function emptyTotals() {
    return {
      totalUnits:0, expUnits:0,
      totalDistricts:0, expDistricts:0,
      totalMunicipal:0, expMunicipal:0,
      totalTasks:0, expTasks:0,
      missingTasks:0, cities:0
    };
  }

  function addTotals(target, source) {
    ['totalUnits','expUnits','totalDistricts','expDistricts','totalMunicipal','expMunicipal','totalTasks','expTasks','missingTasks','cities']
      .forEach(function (key) { target[key] += source[key] || 0; });
    return target;
  }

  // 每次调用都从当前 tabData 和管理员导入索引已合并的数据重新统计，不缓存实际数量。
  function calculateProgress(dataKey) {
    var submitted = window.collectSubmittedDistricts(dataKey);
    var cities = [];

    masterFor(dataKey).forEach(function (city) {
      var stats = emptyTotals();
      stats.city = city.city;
      stats.region = regionForCity(city.city);
      stats.cities = 1;
      stats.missing = [];

      city.items.forEach(function (work) {
        var expectedNonMunicipal = false;
        var matchedNonMunicipal = false;
        work.districts.forEach(function (district) {
          var municipal = window.isMunicipalTask(district, city.city);
          var matched = window.isDistrictMatched(district, city.city, submitted);
          stats.expTasks++;
          if (matched) stats.totalTasks++;

          if (municipal) {
            stats.expMunicipal++;
            if (matched) stats.totalMunicipal++;
          } else {
            stats.expDistricts++;
            expectedNonMunicipal = true;
            if (matched) {
              stats.totalDistricts++;
              matchedNonMunicipal = true;
            }
          }

          if (!matched) {
            stats.missing.push({
              city:city.city, district:district, unit:work.unit,
              contact:work.contact || '', phone:work.phone || '', municipal:municipal
            });
          }
        });
        if (expectedNonMunicipal) stats.expUnits++;
        if (matchedNonMunicipal) stats.totalUnits++;
      });

      stats.missingTasks = stats.expTasks - stats.totalTasks;
      cities.push(stats);
    });

    var regions = {north:emptyTotals(), south:emptyTotals()};
    var overall = emptyTotals();
    cities.forEach(function (city) {
      addTotals(regions[city.region], city);
      addTotals(overall, city);
    });
    return {cities:cities, regions:regions, overall:overall};
  }

  function summaryCard(label, actual, expected) {
    return '<div class="summary-card"><div class="num">' + actual + ' / ' + expected +
      '</div><div class="label">' + esc(label) + '</div></div>';
  }

  function renderOverallSummary(total) {
    return '<div class="summary-bar progress-overview-summary">' +
      summaryCard('区县（含合并区）', total.totalDistricts, total.expDistricts) +
      summaryCard('市级', total.totalMunicipal, total.expMunicipal) +
      summaryCard('作业单位', total.totalUnits, total.expUnits) +
      summaryCard('任务单元', total.totalTasks, total.expTasks) +
      '</div>';
  }

  function renderCityTable(cities, totals) {
    var html = '<table class="regional-progress-table"><thead><tr>' +
      '<th>市（区）</th><th>任务单元<br>应有</th><th>任务单元<br>已收</th><th>任务单元<br>缺失</th><th>市级进度<br>已收 / 应有</th>' +
      '</tr></thead><tbody>';
    cities.forEach(function (city) {
      var municipalClass = city.totalMunicipal < city.expMunicipal ? 'municipal-progress-missing' : 'municipal-progress-complete';
      html += '<tr><td>' + esc(city.city) + '</td><td>' + city.expTasks + '</td><td>' + city.totalTasks +
        '</td><td style="color:' + (city.missingTasks ? '#dc2626' : '#16a34a') + ';font-weight:800">' + city.missingTasks +
        '</td><td class="' + municipalClass + '">' + city.totalMunicipal + ' / ' + city.expMunicipal + '</td></tr>';
    });
    html += '</tbody><tfoot><tr><td>片区合计</td><td>' + totals.expTasks + '</td><td>' + totals.totalTasks +
      '</td><td>' + totals.missingTasks + '</td><td>' + totals.totalMunicipal + ' / ' + totals.expMunicipal +
      '</td></tr></tfoot></table>';
    return html;
  }

  function renderMissingList(cities) {
    var missing = [];
    cities.forEach(function (city) { missing = missing.concat(city.missing); });
    if (!missing.length) return '<div class="regional-missing-empty">该片区已全部收缴</div>';
    var html = '<div class="regional-missing-title">缺失成果</div><div class="regional-missing-list">';
    missing.forEach(function (item) {
      html += '<div class="regional-missing-item"><strong>' + esc(item.city) + '</strong>｜' +
        esc(item.district) + (item.municipal ? '（市级）' : '') + '｜' + esc(item.unit) +
        (item.contact || item.phone ? '｜' + esc((item.contact + ' ' + item.phone).trim()) : '') + '</div>';
    });
    return html + '</div>';
  }

  function progressChip(label, value, className) {
    return '<span class="regional-progress-chip ' + (className || '') + '"><span>' + esc(label) +
      '</span><strong>' + value + '</strong></span>';
  }

  function renderRegion(regionKey, progress) {
    var cities = progress.cities.filter(function (city) { return city.region === regionKey; });
    var totals = progress.regions[regionKey];
    var missingClass = totals.missingTasks ? 'missing' : 'complete';
    return '<details class="regional-progress-section" data-region="' + regionKey + '">' +
      '<summary><span class="regional-progress-name">' + REGION_NAMES[regionKey] + '</span>' +
      '<span class="regional-progress-brief">' +
      progressChip('任务单元', totals.totalTasks + ' / ' + totals.expTasks, '') +
      progressChip('市级', totals.totalMunicipal + ' / ' + totals.expMunicipal, '') +
      progressChip('缺失', totals.missingTasks, missingClass) +
      '</span></summary>' +
      '<div class="regional-progress-body">' + renderCityTable(cities, totals) + renderMissingList(cities) + '</div></details>';
  }

  function renderMissingBanner(dataKey) {
    var banner = document.getElementById('missingBanner');
    if (!banner) return;
    if (dataKey === 'references') {
      banner.style.display = 'none';
      return;
    }

    var progress = calculateProgress(dataKey);
    var name = RESULT_NAMES[dataKey] || dataKey;
    banner.style.display = 'block';
    banner.innerHTML = '<h3>' + esc(name) + '收缴进度</h3>' +
      renderOverallSummary(progress.overall) +
      '<div class="regional-progress-grid">' +
      REGION_ORDER.map(function (key) { return renderRegion(key, progress); }).join('') + '</div>';
  }

  function removeCitySummaryBar() {
    if (typeof window.renderCities !== 'function' || window.renderCities.__regionalSummaryMoved) return;
    var original = window.renderCities;
    window.renderCities = function () {
      var html = original.apply(this, arguments);
      var holder = document.createElement('div');
      holder.innerHTML = html;
      var summary = holder.querySelector(':scope > .summary-bar');
      if (summary) summary.remove();
      return holder.innerHTML;
    };
    window.renderCities.__regionalSummaryMoved = true;
  }

  function refreshActiveProgress() {
    if (typeof window.refreshAllTabs === 'function') window.refreshAllTabs();
    var active = document.querySelector('.tab.active');
    var key = active && active.getAttribute('data-tab');
    if (key) renderMissingBanner(key);
  }

  function install() {
    if (!window.SoilTaskUnitLists || typeof window.collectSubmittedDistricts !== 'function' ||
        typeof window.isMunicipalTask !== 'function' || typeof window.isDistrictMatched !== 'function') return;
    installStyles();
    ensureShijiazhuangMunicipalTask();
    removeCitySummaryBar();

    window.SoilRegionalProgress = {
      southCities:SOUTH_CITIES.slice(),
      calculate:calculateProgress,
      regionForCity:regionForCity,
      refresh:refreshActiveProgress
    };

    // 页面整体统计和南北片区共用同一个实时计算入口。
    window.calculateDashboardStats = function (dataKey) {
      var total = calculateProgress(dataKey).overall;
      return {
        totalUnits:total.totalUnits, expUnits:total.expUnits,
        totalDistricts:total.totalDistricts, expDistricts:total.expDistricts,
        totalMunicipal:total.totalMunicipal, expMunicipal:total.expMunicipal,
        expCities:total.cities
      };
    };
    window.renderMissingBanner = renderMissingBanner;

    refreshActiveProgress();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
