(function () {
  'use strict';

  var VERSION = '1.0.9';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('脚本加载失败：' + src)); };
      document.head.appendChild(script);
    });
  }

  function whenDomReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', resolve, {once:true});
    });
  }

  function loadLogoWithoutObserverLoop(src) {
    return whenDomReady().then(function () {
      // 旧Logo脚本只需执行一次。加载时临时禁用其全页面观察器，避免自触发循环。
      var NativeMutationObserver = window.MutationObserver;
      function OneShotObserver() {}
      OneShotObserver.prototype.observe = function () {};
      OneShotObserver.prototype.disconnect = function () {};
      OneShotObserver.prototype.takeRecords = function () { return []; };

      window.MutationObserver = OneShotObserver;
      return loadScript(src)
        .then(function () {
          window.MutationObserver = NativeMutationObserver;
        }, function (error) {
          window.MutationObserver = NativeMutationObserver;
          throw error;
        });
    });
  }

  function emit(name, detail) {
    var event;
    try {
      event = new CustomEvent(name, {detail: detail || {}});
    } catch (error) {
      event = document.createEvent('CustomEvent');
      event.initCustomEvent(name, false, false, detail || {});
    }
    window.dispatchEvent(event);
  }

  function updateBoot(index, total, name) {
    if (typeof window.updateSoilBootStatus === 'function') {
      window.updateSoilBootStatus('正在加载功能模块 ' + index + ' / ' + total + '：' + name);
    }
  }

  var modules = [
    {name:'页面基础增强', src:'./page-enhancements-core.js?v=1.0.9'},
    {name:'任务单位映射', src:'./task-unit-mappings.js?v=1.0.9'},
    {name:'片区进度统计', src:'./regional-progress-dashboard.js?v=1.0.9'},
    {name:'成果分类扩展', src:'./dashboard-extension.js?v=1.0.9'},
    {name:'参考文件目录', src:'./reference-library.js?v=1.0.9'},
    {name:'仓库目录清单', src:'./repository-manifest-loader.js?v=1.0.9'},
    {name:'版本界面', src:'./app-release-ui.js?v=1.0.9'},
    {name:'三普标识', src:'./soil-survey-logo-v1.0.2.js?v=1.0.9', logo:true},
    {name:'版本一致性', src:'./app-version-guard.js?v=1.0.9'},
    {name:'质控导入界面', src:'./admin-quality-ui.js?v=1.0.9'},
    {name:'质控文件上传', src:'./admin-quality-upload.js?v=1.0.9'},
    {name:'管理员导入', src:'./admin-import-v2.js?v=1.0.9'},
    {name:'导入数据桥接', src:'./admin-import-v2-bridge.js?v=1.0.9'},
    {name:'参考资料导入', src:'./reference-import-mode.js?v=1.0.9'},
    {name:'上传凭证兼容', src:'./upload-token-default.js?v=1.0.9'},
    {name:'答复匹配核心', src:'./reply-workflow-core.js?v=1.0.9'},
    {name:'整改答复批次', src:'./upload-auth-reply-batch.js?v=1.0.9'},
    {name:'整改答复实时进度', src:'./reply-upload-progress.js?v=1.0.9'},
    {name:'管理员删除', src:'./admin-delete-manager.js?v=1.0.9'},
    {name:'PPTX自动拆分', src:'./pptx-auto-split.js?v=1.0.9'},
    {name:'管理员上传状态修复', src:'./admin-upload-transport-fix.js?v=1.0.9'},
    {name:'大文件混合上传', src:'./hybrid-staged-upload.js?v=1.0.9'},
    {name:'统一成功提示', src:'./upload-success-notice.js?v=1.0.9'}
  ];

  var chain = modules.reduce(function (promise, module, index) {
    return promise.then(function () {
      updateBoot(index + 1, modules.length, module.name);
      return module.logo ? loadLogoWithoutObserverLoop(module.src) : loadScript(module.src);
    });
  }, Promise.resolve());

  window.SOIL_ENHANCEMENTS_READY = chain
    .then(whenDomReady)
    .then(function () {
      if (typeof window.updateSoilBootStatus === 'function') {
        window.updateSoilBootStatus('正在完成最终渲染…');
      }
      if (typeof window.refreshAllTabs === 'function') window.refreshAllTabs();
      if (window.SoilRegionalProgress && typeof window.SoilRegionalProgress.refresh === 'function') {
        window.SoilRegionalProgress.refresh();
      }
      return new Promise(function (resolve) { setTimeout(resolve, 120); });
    })
    .then(function () {
      return new Promise(function (resolve) {
        if (!window.requestAnimationFrame) {
          setTimeout(resolve, 0);
          return;
        }
        requestAnimationFrame(function () {
          requestAnimationFrame(resolve);
        });
      });
    })
    .then(function () {
      document.documentElement.setAttribute('data-soil-enhancements-ready', 'true');
      emit('soil-app-ready', {version:'v' + VERSION});
      return true;
    })
    .catch(function (error) {
      console.error(error);
      emit('soil-app-error', {version:'v' + VERSION, message:error && error.message});
      throw error;
    });
})();
