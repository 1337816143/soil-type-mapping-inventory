(function () {
  'use strict';

  var TOKEN_KEY = 'soilGithubUploadTokenV2';
  var scheduled = false;

  function migrateCredentialStorage() {
    var token = '';
    try {
      token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
    } catch (error) {}

    var defaultToken = String(window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN || '').trim();
    // 内置 Token 是项目所有者明确要求的默认凭证，不得在增强脚本中删除或置空。
    window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN = defaultToken;
    window.SOIL_GITHUB_UPLOAD_TOKEN = String(
      token || window.SOIL_GITHUB_UPLOAD_TOKEN || defaultToken
    ).trim();
  }

  function secureCredentialDialog() {
    var modal = document.getElementById('soilCredentialModal');
    if (!modal) return;

    var remember = modal.querySelector('#credRemember');
    if (remember) {
      remember.checked = false;
      remember.disabled = true;
      remember.setAttribute('aria-describedby', 'credStorageHint');
      var label = remember.closest('label');
      if (label) {
        Array.prototype.forEach.call(label.childNodes, function (node) {
          var text = ' 仅在当前浏览器会话中临时覆盖';
          if (node.nodeType === 3 && node.textContent !== text) node.textContent = text;
        });
      }
    }

    var storageMessage = '项目已内置默认Token；管理员在此输入的Token仅作为当前浏览器会话的临时覆盖。';
    Array.prototype.forEach.call(modal.querySelectorAll('p'), function (paragraph) {
      if (paragraph.id === 'credStorageHint' || paragraph.textContent.indexOf('Token只保存在当前浏览器') >= 0 || paragraph.textContent.indexOf('项目已内置默认Token') >= 0) {
        paragraph.id = 'credStorageHint';
        // 只在内容确实变化时改写，避免 MutationObserver 被自身写入反复触发。
        if (paragraph.textContent !== storageMessage) paragraph.textContent = storageMessage;
      }
    });
  }

  function syncTabs() {
    var list = document.querySelector('.tabs');
    if (!list) return;
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', '成果类型');

    var tabs = Array.prototype.slice.call(list.querySelectorAll('.tab'));
    tabs.forEach(function (tab, index) {
      var key = tab.getAttribute('data-tab') || String(index);
      var panel = document.getElementById('tab-' + key);
      var active = tab.classList.contains('active');
      tab.id = tab.id || 'tab-control-' + key;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
      if (panel) {
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      }
    });

    if (!list.__soilKeyboardBound) {
      list.__soilKeyboardBound = true;
      list.addEventListener('keydown', function (event) {
        var current = event.target && event.target.closest && event.target.closest('.tab');
        if (!current) return;
        var items = Array.prototype.slice.call(list.querySelectorAll('.tab'));
        var index = items.indexOf(current);
        var target = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = items[(index + 1) % items.length];
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = items[(index - 1 + items.length) % items.length];
        else if (event.key === 'Home') target = items[0];
        else if (event.key === 'End') target = items[items.length - 1];
        else if (event.key === 'Enter' || event.key === ' ') target = current;
        if (!target) return;
        event.preventDefault();
        target.focus();
        target.click();
        setTimeout(syncTabs, 0);
      });
      list.addEventListener('click', function () { setTimeout(syncTabs, 0); });
      var observer = new MutationObserver(syncTabs);
      observer.observe(list, {attributes:true, subtree:true, attributeFilter:['class']});
    }
  }

  function enhanceInteractiveElements() {
    Array.prototype.forEach.call(document.querySelectorAll('.upload-btn,.replace-btn,.group-label,.file-drop'), function (node) {
      if (!node.hasAttribute('role')) node.setAttribute('role', 'button');
      if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '0');
      if (node.__soilKeyboardBound) return;
      node.__soilKeyboardBound = true;
      node.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        node.click();
      });
    });
  }

  function enhanceDialogs() {
    var selectors = ['.upload-modal', '.cred-mask', '.adm-mask', '.delete-mask'];
    Array.prototype.forEach.call(document.querySelectorAll(selectors.join(',')), function (mask, index) {
      var dialog = mask.querySelector('.upload-modal-content,.cred-card,.adm-card,.delete-card') || mask;
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      var heading = dialog.querySelector('h2,h3');
      if (heading) {
        heading.id = heading.id || 'soil-dialog-title-' + index + '-' + Date.now();
        dialog.setAttribute('aria-labelledby', heading.id);
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('.delete-close,.adm-close'), function (button) {
      if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', '关闭对话框');
    });

    Array.prototype.forEach.call(document.querySelectorAll('#toast,.cred-status,.delete-status,.adm-status,.upload-progress-status,.upload-progress-detail'), function (node) {
      node.setAttribute('aria-live', 'polite');
      if (node.id === 'toast') node.setAttribute('role', 'status');
    });
  }

  function enhanceLinksAndTables() {
    Array.prototype.forEach.call(document.querySelectorAll('a[target="_blank"]'), function (link) {
      link.setAttribute('rel', 'noopener noreferrer');
    });
    Array.prototype.forEach.call(document.querySelectorAll('thead th'), function (cell) {
      if (!cell.hasAttribute('scope')) cell.setAttribute('scope', 'col');
    });
  }

  function runEnhancements() {
    scheduled = false;
    secureCredentialDialog();
    syncTabs();
    enhanceInteractiveElements();
    enhanceDialogs();
    enhanceLinksAndTables();
  }

  function scheduleEnhancements() {
    if (scheduled) return;
    scheduled = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(runEnhancements);
    else setTimeout(runEnhancements, 0);
  }

  function install() {
    migrateCredentialStorage();
    scheduleEnhancements();

    // 管理员临时覆盖凭证时仅保存到当前会话；内置 Token 始终保留为默认值。
    document.addEventListener('click', function (event) {
      var save = event.target && event.target.closest && event.target.closest('#credSave');
      if (save) {
        var remember = document.getElementById('credRemember');
        if (remember) remember.checked = false;
      }
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var masks = Array.prototype.slice.call(document.querySelectorAll('.upload-modal.show,.cred-mask.show,.adm-mask.show,.delete-mask.show'));
      var top = masks[masks.length - 1];
      if (!top) return;
      var close = top.querySelector('#credCancel,.adm-close,.delete-close,.upload-modal-actions .btn-secondary');
      if (close) {
        event.preventDefault();
        close.click();
      }
    });

    var observer = new MutationObserver(scheduleEnhancements);
    observer.observe(document.documentElement, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
