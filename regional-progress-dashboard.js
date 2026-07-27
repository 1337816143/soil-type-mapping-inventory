(function () {
  'use strict';

  if (window.__soilRegionalProgressInstalled) return;
  window.__soilRegionalProgressInstalled = true;

  var SOUTH_CITIES = ['石家庄市','邢台市','沧州市','衡水市','邯郸市','辛集市'];
  var REGION_ORDER = ['north','south'];
  var REGION_NAMES = {north:'河北省北部片区', south:'河北省南部片区'};

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
      '.regional-progress-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:9px}' +
      '.regional-progress-section{min-width:0;border:1px solid #ead8a5;border-radius:9px;background:#fff;overflow:hidden}' +
      '.regional-progress-section>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;cursor:pointer;list-style:none;background:#fff8df;color:#78350f}' +
      '.regional-progress-section>summary::-webkit-details-marker{display:none}' +
      '.regional-progress-section>summary:after{content:"展开 ▾";font-size:.72rem;font-weight:700;white-space:nowrap;color:#a16207}' +
      '.regional-progress-section[open]>summary:after{content:"收起 ▴"}' +
      '.regional-progress-name{font-weight:800}' +
      '.regional-progress-brief{font-size:.74rem;color:#92400e;text-align:right}' +
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
      '@media(max-width:1100px){.regional-progress-grid{grid-template-columns:1fr}}' +
      '@media(max-width:600px){.regional-progress-section>summary{align-items:flex-start}.regional-progress-brief{text-align:left}.regional-progress-table{font-size:.7rem!important}.regional-progress-table th,.regional-progress-table td{padding:5px 3px!important}}';
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

  function renderRegion(regionKey, progress) {
    var cities = progress.cities.filter(function (city) { return city.region === regionKey; });
    var totals = progress.regions[regionKey];
    return '<details class="regional-progress-section" data-region="' + regionKey + '">' +
      '<summary><span class="regional-progress-name">' + REGION_NAMES[regionKey] + '</span>' +
      '<span class="regional-progress-brief">任务单元 ' + totals.totalTasks + ' / ' + totals.expTasks +
      '　市级 ' + totals.totalMunicipal + ' / ' + totals.expMunicipal + '　缺失 ' + totals.missingTasks + '</span></summary>' +
      '<div class="regional-progress-body">' + renderCityTable(cities, totals) + renderMissingList(cities) + '</div></details>';
  }

  function renderMissingBanner(dataKey) {
    var banner = document.getElementById('missingBanner');
    if (!banner) return;
    if (dataKey === 'references') {
      banner.style.display = 'none';
      return;
    }

    var names = {soilType:'土壤类型图', soilAttr:'土壤属性图', farmland:'耕地质量评价'};
    var progress = calculateProgress(dataKey);
    banner.style.display = 'block';
    // 河北省整体数据仅保留在页面上方的 summary-bar；此处只展示南北片区，避免重复。
    banner.innerHTML = '<h3>' + esc(names[dataKey] || dataKey) + ' 分片区收缴进度</h3>' +
      '<div class="regional-progress-grid">' +
      REGION_ORDER.map(function (key) { return renderRegion(key, progress); }).join('') + '</div>';
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

    window.SoilRegionalProgress = {
      southCities:SOUTH_CITIES.slice(),
      calculate:calculateProgress,
      regionForCity:regionForCity,
      refresh:refreshActiveProgress
    };

    // 页面上方四张总览卡和南北片区共用同一个实时计算入口。
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
