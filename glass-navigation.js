/* Presentation only: move original nodes, never replace a tab or its handlers. */
(function () {
  'use strict';
  if (window.SoilGlassNavigation) return;
  function install() {
    var host = document.querySelector('header .container');
    var tabs = host && host.querySelector('.tabs');
    var title = host && host.querySelector('h1');
    if (!tabs || !title || host.querySelector('.glass-nav-frame')) return;
    var top = document.createElement('div');
    top.className = 'glass-header-top';
    host.insertBefore(top, title);
    top.appendChild(title);
    var tools = host.querySelector('.glass-controls');
    if (tools) { tools.setAttribute('aria-label', '显示设置'); top.appendChild(tools); }
    var frame = document.createElement('div');
    frame.className = 'glass-nav-frame';
    tabs.parentNode.insertBefore(frame, tabs);
    frame.appendChild(tabs);
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '成果类型与协作功能');
    tabs.setAttribute('aria-orientation', 'horizontal');
    var nodes = Array.from(tabs.querySelectorAll('.tab'));
    nodes.forEach(function (tab) {
      var key = tab.dataset.tab, panel = document.getElementById('tab-' + key);
      tab.id = tab.id || 'glass-tab-' + key;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'tab-' + key);
      if (panel) { panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id); }
    });
    function arrow(direction, label) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'glass-nav-arrow ' + direction;
      b.setAttribute('aria-label', label); b.title = label;
      b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="' + (direction === 'prev' ? 'M14 5l-7 7 7 7' : 'M10 5l7 7-7 7') + '"/></svg>';
      frame.appendChild(b); return b;
    }
    var prev = arrow('prev', '向左查看更多标签'), next = arrow('next', '向右查看更多标签');
    var hint = document.createElement('span'); hint.className = 'glass-nav-hint';
    hint.textContent = '左右滑动查看全部标签'; frame.appendChild(hint);
    var pending = 0;
    function reduced() { return document.documentElement.classList.contains('glass-lite') || matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function edges() {
      pending = 0;
      var first = nodes[0].getBoundingClientRect(), last = nodes[nodes.length - 1].getBoundingClientRect();
      var needed = last.right - first.left + 18;
      var overflow = needed > frame.clientWidth + 1;
      frame.classList.toggle('is-overflowing', overflow);
      prev.hidden = next.hidden = hint.hidden = !overflow;
      prev.disabled = tabs.scrollLeft <= 2;
      next.disabled = tabs.scrollLeft >= tabs.scrollWidth - tabs.clientWidth - 2;
    }
    function queueEdges() { if (!pending) pending = requestAnimationFrame(edges); }
    function scrollToTab(tab) {
      if (!tab) return;
      var r = tab.getBoundingClientRect(), v = tabs.getBoundingClientRect(), pad = 8;
      var delta = r.left < v.left + pad ? r.left - v.left - pad : r.right > v.right - pad ? r.right - v.right + pad : 0;
      if (delta) tabs.scrollTo({left: tabs.scrollLeft + delta, behavior: reduced() ? 'auto' : 'smooth'});
    }
    function sync(reveal) {
      nodes.forEach(function (tab) {
        var active = tab.classList.contains('active');
        tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      });
      if (reveal) scrollToTab(tabs.querySelector('.tab.active'));
      queueEdges();
    }
    function move(direction) { tabs.scrollTo({left: tabs.scrollLeft + direction * tabs.clientWidth * .7, behavior: reduced() ? 'auto' : 'smooth'}); }
    prev.onclick = function () { move(-1); }; next.onclick = function () { move(1); };
    // Capture sees the work-record tab even though its original handler stops bubbling.
    tabs.addEventListener('click', function (event) {
      if (event.target.closest('.tab')) requestAnimationFrame(function () { sync(true); });
    }, true);
    tabs.addEventListener('keydown', function (event) {
      var tab = event.target.closest('.tab'), i = nodes.indexOf(tab), target;
      if (i < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') target = nodes[(i + 1) % nodes.length];
      else if (event.key === 'ArrowLeft') target = nodes[(i - 1 + nodes.length) % nodes.length];
      else if (event.key === 'Home') target = nodes[0];
      else if (event.key === 'End') target = nodes[nodes.length - 1];
      else if (event.key === 'Enter' || event.key === ' ') target = tab;
      else return;
      event.preventDefault(); event.stopImmediatePropagation();
      target.focus({preventScroll:true}); target.click();
    }, true);
    tabs.addEventListener('scroll', queueEdges, {passive:true});
    window.addEventListener('resize', function () { sync(true); }, {passive:true});
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { sync(false); });
    sync(false);
    window.SoilGlassNavigation.refresh = function () { sync(true); };
  }
  window.SoilGlassNavigation = {install:install};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
