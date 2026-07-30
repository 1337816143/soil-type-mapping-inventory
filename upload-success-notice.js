(function () {
  'use strict';

  var NOTICE = '上传成功！稍等3~5分钟刷新网站即可查看新上传的文件。';

  function needsNotice(text) {
    text = String(text || '');
    return /(上传成功|导入完成|归档完成)/.test(text) && text.indexOf('3~5分钟') < 0;
  }

  function appendNotice(text) {
    text = String(text || '').trim();
    if (!needsNotice(text)) return text;
    return text ? text + ' ' + NOTICE : NOTICE;
  }

  function patchToast() {
    if (typeof window.showToast !== 'function' || window.showToast.__successNoticePatched) return;
    var original = window.showToast;
    window.showToast = function (message, isError) {
      return original.call(this, isError ? message : appendNotice(message), isError);
    };
    window.showToast.__successNoticePatched = true;
  }

  function patchUploadProgress() {
    if (typeof window.updateUploadProgress !== 'function' || window.updateUploadProgress.__successNoticePatched) return;
    var original = window.updateUploadProgress;
    window.updateUploadProgress = function (element, percent, loaded, status) {
      var result = original.apply(this, arguments);
      if (status === 'success' && element && element.querySelector) {
        var detail = element.querySelector('.upload-progress-detail,#upload-progress-detail');
        if (detail) detail.textContent = NOTICE;
      }
      return result;
    };
    window.updateUploadProgress.__successNoticePatched = true;
  }

  function patchAdminProgress() {
    var admin = window.SoilAdminImport;
    if (!admin || typeof admin.progress !== 'function' || admin.__successNoticeProgressPatched) return;

    // 使用对象级标记保证只包裹一次。管理员原位进度脚本也会包装 progress；若两个
    // 脚本只检查函数属性，MutationObserver 会交替重新包裹，最终造成调用栈溢出。
    admin.__successNoticeProgressPatched = true;
    var original = admin.progress;
    var wrapped = function (message, percent) {
      if (Number(percent) >= 100) message = appendNotice(message);
      return original.apply(this, [message].concat(Array.prototype.slice.call(arguments, 1)));
    };
    wrapped.__successNoticePatched = true;
    if (original.__soilAdminStatusInPlace) wrapped.__soilAdminStatusInPlace = true;
    admin.progress = wrapped;
  }

  function refreshVisibleMessages() {
    Array.prototype.forEach.call(document.querySelectorAll('.upload-progress-detail,.adm-status,#toast'), function (node) {
      if (needsNotice(node.textContent)) node.textContent = appendNotice(node.textContent);
    });
  }

  function install() {
    patchToast();
    patchUploadProgress();
    patchAdminProgress();
    refreshVisibleMessages();
  }

  window.SOIL_UPLOAD_SUCCESS_NOTICE = NOTICE;
  install();
  setTimeout(install, 500);
  setTimeout(install, 1500);

  if (!document.documentElement.__soilSuccessNoticeObserver) {
    document.documentElement.__soilSuccessNoticeObserver = true;
    var observer = new MutationObserver(install);
    observer.observe(document.body, {childList: true, subtree: true});
  }
})();