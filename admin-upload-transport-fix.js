(function () {
  'use strict';

  if (window.__soilAdminUploadStatusFixInstalled) return;
  window.__soilAdminUploadStatusFixInstalled = true;

  var tracked = {
    stage: '',
    percent: 0,
    ceiling: 0,
    pulse: null,
    originalProgress: null
  };

  function admin() {
    return window.SoilAdminImport;
  }

  function normalizeStage(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean)
      .join(' · ');
  }

  function isUploadStage(text) {
    return /正在整文件上传|正在上传超限文件/.test(String(text || ''));
  }

  function stopPulse() {
    if (tracked.pulse) clearInterval(tracked.pulse);
    tracked.pulse = null;
  }

  function renderUploadStatus() {
    if (!tracked.originalProgress || !tracked.stage) return;
    tracked.originalProgress(
      tracked.stage + '\n上传进度：' + Math.round(tracked.percent) + '%（正在等待 GitHub 返回）',
      tracked.percent,
      true
    );
  }

  function startPulse(startPercent) {
    stopPulse();
    tracked.percent = Math.max(1, Number(startPercent) || 1);
    tracked.ceiling = Math.max(tracked.percent + 1, 80);
    renderUploadStatus();
    tracked.pulse = setInterval(function () {
      if (tracked.percent >= tracked.ceiling) return;
      var remaining = tracked.ceiling - tracked.percent;
      var step = remaining > 24 ? 2 : 1;
      tracked.percent = Math.min(tracked.ceiling, tracked.percent + step);
      renderUploadStatus();
    }, 850);
  }

  function installProgressTracking() {
    var q = admin();
    if (!q || typeof q.progress !== 'function' || q.__soilAdminStatusInPlaceInstalled) return;

    // 标记放在 SoilAdminImport 对象上，而不是只放在当前函数上。后续成功提示脚本
    // 可能会在外层再包一层 progress；对象级标记可阻止两个观察器相互反复包裹，
    // 从根源上避免 Maximum call stack size exceeded。
    q.__soilAdminStatusInPlaceInstalled = true;
    var original = q.progress.bind(q);
    tracked.originalProgress = original;

    var wrapped = function (text, percent, visible) {
      var normalized = normalizeStage(text);
      if (isUploadStage(normalized)) {
        tracked.stage = normalized;
        startPulse(percent);
        return;
      }

      stopPulse();
      tracked.stage = normalized;
      tracked.percent = Number(percent) || 0;
      return original(normalized, percent, visible);
    };
    wrapped.__soilAdminStatusInPlace = true;
    q.progress = wrapped;
  }

  function armAdminUpload() {
    installProgressTracking();
    var button = document.getElementById('adm-ok');
    if (!button) return false;

    // 保留已经验证可用的原始 fetch + Bearer / Git Data API 上传链路，
    // 但不再把 authReady 永久置为 1。authReady=1 会绕过 upload-auth-reply-batch.js
    // 的凭证校验与失效凭证恢复，最终把旧 Token 直接发给 GitHub 并得到 Bad credentials。
    // 这里只负责上传状态展示；凭证校验仍由统一认证拦截器接管。
    if (button.dataset.authReady === '1') delete button.dataset.authReady;
    button.dataset.adminStatusInPlace = '1';
    return true;
  }

  function installWhenReady(attempt) {
    if (armAdminUpload()) return;
    if (attempt < 20) setTimeout(function () { installWhenReady(attempt + 1); }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { installWhenReady(0); }, {once:true});
  } else {
    installWhenReady(0);
  }
})();
