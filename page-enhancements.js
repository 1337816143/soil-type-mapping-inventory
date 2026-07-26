(function() {
  var SOIL_SURVEY_LOGO = './assets/soil-survey-logo.svg';

  function addStyles() {
    if (document.getElementById('page-enhancements-style')) return;
    var style = document.createElement('style');
    style.id = 'page-enhancements-style';
    style.textContent =
      '.container{max-width:none!important;width:100%;padding-left:4px!important;padding-right:4px!important}' +
      '.city-section h2{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.city-section h2 .badge{margin-left:0;white-space:nowrap;flex:0 0 auto}' +
      '.city-section .table-wrap{overflow:visible!important;width:100%}' +
      '.city-section table{width:100%!important;min-width:0!important;table-layout:fixed!important}' +
      '.city-section thead th,.city-section tbody td{box-sizing:border-box;padding-left:7px!important;padding-right:7px!important;vertical-align:middle}' +
      '.city-section thead th{white-space:nowrap}' +
      '.city-section thead th:first-child,.city-section tbody td:first-child{width:20%!important}' +
      '.city-section thead th:nth-child(2),.city-section tbody td:nth-child(2){width:35%!important}' +
      '.city-section thead th:nth-child(3),.city-section tbody td:nth-child(3){width:9%!important}' +
      '.city-section thead th:last-child,.city-section tbody td:last-child{width:36%!important}' +
      '.city-section tbody td:first-child{white-space:normal;overflow-wrap:anywhere;word-break:break-word}' +
      '.district-list{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0}' +
      '.district-link,.district-group{flex:0 0 auto;white-space:nowrap;max-width:100%}' +
      '.batch-tag{display:inline-flex;white-space:nowrap;margin:2px 3px 2px 0}' +
      '.reply-cell{min-width:0!important;white-space:normal}' +
      '.reply-list{display:flex;flex-wrap:wrap;align-items:center;gap:5px 10px;min-width:0}' +
      '.reply-item{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;flex:0 0 auto;max-width:100%}' +
      '.reply-file{display:inline-flex!important;align-items:center!important;gap:5px!important;flex-wrap:wrap!important;white-space:normal}' +
      '.reply-file .time,.upload-btn,.replace-btn{white-space:nowrap}' +
      '.reply-label{font-size:.76rem;color:var(--muted);font-weight:500}' +
      '.reply-label.merged{color:#2563eb;font-weight:650}' +
      '.reply-label.municipal{color:#1e3a8a;font-weight:700}' +
      '.district-link.merged-link,.district-group.merged .group-label{background:#3b82f6;color:#fff;border-color:#2563eb;font-weight:600}' +
      '.district-link.merged-link:hover,.district-group.merged .group-label:hover{background:#2563eb;color:#fff;border-color:#1d4ed8}' +
      '.district-link.municipal-link,.district-group.municipal .group-label{background:#1e40af;color:#fff;border-color:#1e3a8a;font-weight:600}' +
      '.district-link.municipal-link:hover,.district-group.municipal .group-label:hover{background:#172554;color:#fff;border-color:#172554}' +
      '.footer-brands{display:flex;justify-content:center;align-items:center;gap:52px;flex-wrap:wrap}' +
      '.footer-brand{display:flex;align-items:center;gap:12px;color:var(--ink);font-size:.95rem;font-weight:600;flex:0 0 auto}' +
      '.footer-brand img{display:block;height:58px;max-height:58px;width:auto;object-fit:contain;flex:0 0 auto}' +
      '.footer-brand.survey img{width:58px;height:58px;min-width:58px;max-width:58px;min-height:58px;max-height:58px;aspect-ratio:1/1;object-fit:contain;border-radius:0;flex:0 0 58px}' +
      '.missing-layout{display:grid;grid-template-columns:minmax(500px,1.35fr) minmax(300px,.65fr);gap:18px;align-items:stretch}' +
      '.missing-stats-panel,.missing-details-panel{min-width:0}' +
      '.missing-panel-title{font-size:.82rem;font-weight:700;color:#92400e;margin-bottom:7px}' +
      '.missing-stat-table{width:100%!important;min-width:0!important;table-layout:auto!important;border-collapse:collapse!important;font-size:.82rem!important;margin:0!important}' +
      '.missing-stat-table th,.missing-stat-table td{min-width:0!important}' +
      '.missing-stat-table th:first-child,.missing-stat-table td:first-child{width:40%!important}' +
      '.missing-stat-table th:nth-child(2),.missing-stat-table td:nth-child(2),.missing-stat-table th:nth-child(3),.missing-stat-table td:nth-child(3),.missing-stat-table th:nth-child(4),.missing-stat-table td:nth-child(4){width:20%!important}' +
      '.missing-details-panel{border-left:1px solid #fde68a;padding-left:16px}' +
      '.missing-details-panel .missing-list{display:flex;flex-direction:column;align-items:stretch;gap:6px;line-height:1.5}' +
      '.missing-details-panel .missing-item{white-space:normal;width:100%}' +
      '@media(max-width:1200px){.city-section thead th,.city-section tbody td{padding-left:5px!important;padding-right:5px!important}.city-section thead th:first-child,.city-section tbody td:first-child{width:21%!important}.city-section thead th:nth-child(2),.city-section tbody td:nth-child(2){width:34%!important}.city-section thead th:nth-child(3),.city-section tbody td:nth-child(3){width:10%!important}.city-section thead th:last-child,.city-section tbody td:last-child{width:35%!important}}' +
      '@media(max-width:980px){.missing-layout{grid-template-columns:1fr}.missing-details-panel{border-left:0;border-top:1px solid #fde68a;padding-left:0;padding-top:12px}}' +
      '@media(max-width:760px){.container{padding-left:8px!important;padding-right:8px!important}.city-section h2 .badge{white-space:normal}.city-section thead th,.city-section tbody td{padding-left:4px!important;padding-right:4px!important}.city-section thead th:first-child,.city-section tbody td:first-child{width:24%!important}.city-section thead th:nth-child(2),.city-section tbody td:nth-child(2){width:31%!important}.city-section thead th:nth-child(3),.city-section tbody td:nth-child(3){width:12%!important}.city-section thead th:last-child,.city-section tbody td:last-child{width:33%!important}.reply-item{white-space:normal;flex-wrap:wrap}}' +
      '@media(max-width:640px){.footer-brands{gap:24px}.footer-brand{font-size:.86rem}.footer-brand img{height:50px;max-height:50px}.footer-brand.survey img{width:50px;height:50px;min-width:50px;max-width:50px;min-height:50px;max-height:50px;flex-basis:50px}}';
    document.head.appendChild(style);
  }

  function enhanceFooter() {
    var container = document.querySelector('footer .container');
    if (!container || container.querySelector('.footer-brands')) return;
    var oldLogo = container.querySelector('img');
    var cauSrc = oldLogo ? oldLogo.getAttribute('src') : './assets/logo.jpg';
    container.innerHTML = '<div class="footer-brands">' +
      '<div class="footer-brand survey"><img src="' + SOIL_SURVEY_LOGO + '" alt="第三次全国土壤普查"><span>第三次全国土壤普查</span></div>' +
      '<div class="footer-brand cau"><img src="' + cauSrc + '" alt="中国农业大学"></div>' +
      '</div>';
  }

  function splitMissingBanner() {
    var banner = document.getElementById('missingBanner');
    if (!banner || banner.querySelector('.missing-layout')) return;
    var table = banner.querySelector(':scope > table');
    if (!table) return;
    table.classList.add('missing-stat-table');
    var list = banner.querySelector(':scope > .missing-list');
    var layout = document.createElement('div');
    layout.className = 'missing-layout';
    var stats = document.createElement('section');
    stats.className = 'missing-stats-panel';
    stats.innerHTML = '<div class="missing-panel-title">收缴统计</div>';
    stats.appendChild(table);
    var details = document.createElement('aside');
    details.className = 'missing-details-panel';
    details.innerHTML = '<div class="missing-panel-title">缺失成果</div>';
    if (list) details.appendChild(list);
    else details.insertAdjacentHTML('beforeend', '<div class="missing-empty">暂无缺失成果</div>');
    layout.appendChild(stats);
    layout.appendChild(details);
    banner.appendChild(layout);
  }

  function install() {
    if (!window.masterList || !window.renderCities || !window.calculateDashboardStats) return;
    addStyles();
    enhanceFooter();

    var cangzhou = null;
    for (var i = 0; i < window.masterList.length; i++) {
      if (window.masterList[i].city === '沧州市') { cangzhou = window.masterList[i]; break; }
    }
    if (cangzhou) {
      var exists = cangzhou.items.some(function(item) { return item.unit === '沧州华江工程勘察设计有限公司'; });
      if (!exists) cangzhou.items.push({unit:'沧州华江工程勘察设计有限公司', contact:'', phone:'', districts:['合并区']});
    }
    if (window.mergeSubDistricts) window.mergeSubDistricts['沧州市'] = ['运河区','新华区'];

    window.renderCities = function(cities, dataKey) {
      var s = window.calculateDashboardStats(dataKey);
      var html = '<div class="summary-bar">';
      html += '<div class="summary-card"><div class="num">' + s.totalDistricts + ' / ' + s.expDistricts + '</div><div class="label">区县（含合并区）</div></div>';
      html += '<div class="summary-card"><div class="num">' + s.totalMunicipal + ' / ' + s.expMunicipal + '</div><div class="label">市级</div></div>';
      html += '<div class="summary-card"><div class="num">' + s.totalUnits + ' / ' + s.expUnits + '</div><div class="label">作业单位</div></div>';
      html += '<div class="summary-card"><div class="num">' + (s.totalDistricts+s.totalMunicipal) + ' / ' + (s.expDistricts+s.expMunicipal) + '</div><div class="label">任务单元</div></div></div>';
      cities.forEach(function(city) {
        var units=0, districts=0, municipal=0;
        city.units.forEach(function(unit){var ds=unit.districts||[];if(ds.length)units++;ds.forEach(function(d){if(window.isMunicipalTask(d.label,city.name))municipal++;else districts++;});});
        html += '<section class="city-section"><h2>' + city.name + ' <span class="badge">' + units + ' 家单位 · ' + (districts+municipal) + ' 成果：' + municipal + ' 市级 | ' + districts + ' 区县（含合并区）</span></h2>';
        html += '<div class="table-wrap"><table><thead><tr><th>作业单位</th><th>成果</th><th>批次</th><th>整改答复</th></tr></thead><tbody>';
        city.units.forEach(function(unit){
          var outcomes=unit.districts||[];if(!outcomes.length)return;var batches=[];
          outcomes.forEach(function(d){(d.docs||[]).forEach(function(doc){if(batches.indexOf(doc.batch)<0)batches.push(doc.batch);});});
          html += '<tr><td>'+unit.name+'</td><td><div class="district-list">';
          outcomes.forEach(function(d){
            var isM=window.isMunicipalTask(d.label,city.name), isG=!isM&&String(d.label||'').indexOf('合并区')>=0;
            var link='district-link'+(isM?' municipal-link':(isG?' merged-link':''));
            var group='district-group'+(isM?' municipal':(isG?' merged':''));var docs=d.docs||[];
            if(docs.length===1){html+='<a class="'+link+'" href="'+window.BASE+'/'+docs[0].file+'" target="_blank">'+d.label+' '+window.PDF_ICON+'</a>';}
            else if(docs.length>1){html+='<div class="'+group+'"><span class="group-label">'+d.label+' ▾</span><div class="doc-btns">';docs.forEach(function(doc){html+='<a class="doc-btn" href="'+window.BASE+'/'+doc.file+'" target="_blank">'+window.PDF_ICON+' '+doc.batch+'</a>';});html+='</div></div>';}
            else html+='<span class="'+link+'">'+d.label+'</span>';
          });
          html+='</div></td><td>';batches.forEach(function(b){html+='<span class="batch-tag '+(window.batchClass[b]||'')+'">'+b+'</span>';});
          html+='</td><td class="reply-cell"><div class="reply-list">';
          outcomes.forEach(function(d){var isM=window.isMunicipalTask(d.label,city.name),isG=!isM&&String(d.label||'').indexOf('合并区')>=0;html+='<div class="reply-item"><span class="reply-label'+(isM?' municipal':(isG?' merged':''))+'">'+d.label+':</span>'+window.renderReplyCell(city.name,unit.name,d.label)+'</div>';});
          html+='</div></td></tr>';
        });
        html+='</tbody></table></div></section>';
      });
      return html;
    };

    if (!window.__missingBannerWrapped && window.renderMissingBanner) {
      var originalMissing = window.renderMissingBanner;
      window.renderMissingBanner = function(dataKey) { originalMissing(dataKey); splitMissingBanner(); };
      window.__missingBannerWrapped = true;
    }
    if (window.refreshAllTabs) window.refreshAllTabs();
    var active = document.querySelector('.tab.active');
    if (active && window.renderMissingBanner) window.renderMissingBanner(active.getAttribute('data-tab'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
