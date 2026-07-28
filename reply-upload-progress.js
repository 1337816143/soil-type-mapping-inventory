(function () {
  'use strict';

  if (window.__soilReplyUploadProgressV2Installed) return;
  window.__soilReplyUploadProgressV2Installed = true;

  var OWNER = '1337816143';
  var REPO = 'soil-type-mapping-inventory';
  var SUCCESS_NOTICE = '上传成功！稍等3~5分钟刷新网站即可查看新上传的文件。';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function formatBytes(value) {
    value = Math.max(0, Number(value) || 0);
    if (value >= 1024 * 1024) return (value / 1024 / 1024).toFixed(2) + ' MB';
    if (value >= 1024) return (value / 1024).toFixed(1) + ' KB';
    return Math.round(value) + ' B';
  }

  function setProgress(element, percent, file, status, detail) {
    percent = clamp(percent, 0, 100);
    if (typeof window.updateUploadProgress === 'function') {
      window.updateUploadProgress(element, percent, file.size, status, status === 'error' ? detail : undefined);
    }
    if (element && element.querySelector && detail) {
      var detailElement = element.querySelector('.upload-progress-detail,#upload-progress-detail');
      if (detailElement) detailElement.textContent = detail;
    }
  }

  function safe(value) {
    return String(value || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  }

  function filenameBase(city, unit, district) {
    return [city, unit, district].map(safe).join('_');
  }

  function timestamp() {
    var date = new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
      pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
  }

  function replyKey(city, unit, district, batch) {
    if (typeof window.getReplyKey === 'function') {
      return window.getReplyKey(city, unit, district, batch);
    }
    var base = [city, unit, district].map(function (value) {
      return String(value || '').replace(/[\u200B-\u200D\uFEFF\s]/g, '').replace(/[（(]市级[）)]/g, '');
    }).join('_');
    return batch ? base + '_批次-' + String(batch || '').replace(/\s/g, '') : base;
  }

  function uploadToken() {
    return String(
      window.SOIL_GITHUB_UPLOAD_TOKEN ||
      window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN ||
      ''
    ).trim();
  }

  function finishSuccess(progressElement, file, current, batch, filename, time) {
    var key = replyKey(current.city, current.unit, current.district, batch);
    window.replyIndex = window.replyIndex || {};
    window.replyIndex[key] = {file: filename, time: time, batch: batch, legacy: false};

    setProgress(progressElement, 100, file, 'success', SUCCESS_NOTICE);
    if (typeof window.showToast === 'function') window.showToast(SUCCESS_NOTICE);

    var admin = window.SoilRepoAdmin;
    if (admin) admin.tree = null;

    // 先让用户看见100%完成状态，再把原位置更新为“查看 / 替换”。
    setTimeout(function () {
      if (typeof window.refreshAllTabs === 'function') window.refreshAllTabs();
    }, 700);

    setTimeout(function () {
      if (typeof window.reloadReplyIndex === 'function') {
        Promise.resolve(window.reloadReplyIndex()).catch(function () {});
      }
    }, 1500);
  }

  function fail(progressElement, file, message) {
    var text = '上传失败：' + String(message || '未知错误');
    setProgress(progressElement, 0, file, 'error', text);
    if (typeof window.showToast === 'function') window.showToast(text, true);
    if (typeof window.removeUploadProgress === 'function') {
      window.removeUploadProgress(progressElement, 5000);
    }
  }

  function install() {
    if (typeof window.confirmUploadFile !== 'function') return;
    if (window.confirmUploadFile.__replyProgressV2) return;

    window.confirmUploadFile = function () {
      if (!window.selectedFile || !window.currentUpload) return;

      var file = window.selectedFile;
      var current = window.currentUpload;
      var batch = String(current.batch || '').trim();
      if (!batch) {
        if (typeof window.showToast === 'function') {
          window.showToast('未找到对应质控批次，不能上传整改答复。', true);
        }
        return;
      }

      var token = uploadToken();
      if (!token) {
        if (typeof window.showToast === 'function') window.showToast('未配置GitHub上传凭证。', true);
        return;
      }

      var extension = (file.name.split('.').pop() || 'bin').toLowerCase();
      var time = timestamp();
      var base = filenameBase(current.city, current.unit, current.district);
      var filename = base + '_批次-' + safe(batch) + '_整改答复_' + time + '.' + extension;
      var progressElement;
      var displayedPercent = 2;
      var pulseTimer = null;
      var finished = false;

      if (typeof window.closeUploadModal === 'function') window.closeUploadModal();
      progressElement = window.showUploadProgress(base, current.district + ' · ' + batch, file);
      setProgress(progressElement, displayedPercent, file, null, '正在读取本地文件…');

      function stopPulse() {
        if (pulseTimer) clearInterval(pulseTimer);
        pulseTimer = null;
      }

      function startPulse() {
        stopPulse();
        pulseTimer = setInterval(function () {
          if (finished || displayedPercent >= 90) return;
          displayedPercent += displayedPercent < 60 ? 2 : 1;
          setProgress(progressElement, displayedPercent, file, null, '正在上传，等待网络进度…');
        }, 700);
      }

      var reader = new FileReader();
      reader.onloadstart = function () {
        displayedPercent = 3;
        setProgress(progressElement, displayedPercent, file, null, '正在读取本地文件…');
      };
      reader.onprogress = function (event) {
        if (!event.lengthComputable) return;
        displayedPercent = 3 + Math.round(event.loaded / event.total * 9);
        setProgress(
          progressElement,
          displayedPercent,
          file,
          null,
          '正在读取：' + formatBytes(event.loaded) + ' / ' + formatBytes(event.total)
        );
      };
      reader.onerror = function () {
        finished = true;
        stopPulse();
        fail(progressElement, file, '无法读取本地文件');
      };
      reader.onload = function (event) {
        var base64 = String(event.target && event.target.result || '').split(',')[1] || '';
        if (!base64) {
          finished = true;
          fail(progressElement, file, '文件编码失败');
          return;
        }

        displayedPercent = 15;
        setProgress(progressElement, displayedPercent, file, null, '文件读取完成，正在建立上传连接…');
        startPulse();

        var url = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/replies/' + encodeURIComponent(filename);
        var body = JSON.stringify({
          message: '整改答复：' + batch,
          content: base64,
          branch: 'main'
        });
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.timeout = 180000;
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.setRequestHeader('Accept', 'application/vnd.github+json');
        xhr.setRequestHeader('X-GitHub-Api-Version', '2022-11-28');
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.upload.addEventListener('progress', function (uploadEvent) {
          if (!uploadEvent.lengthComputable) return;
          var ratio = clamp(uploadEvent.loaded / uploadEvent.total, 0, 1);
          displayedPercent = 15 + Math.round(ratio * 80);
          setProgress(
            progressElement,
            displayedPercent,
            file,
            null,
            '正在上传：' + formatBytes(file.size * ratio) + ' / ' + formatBytes(file.size)
          );
        });
        xhr.upload.addEventListener('load', function () {
          displayedPercent = Math.max(displayedPercent, 96);
          setProgress(progressElement, displayedPercent, file, null, '文件已发送，等待 GitHub 确认写入…');
        });
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 2 && !finished) {
            displayedPercent = Math.max(displayedPercent, 97);
            setProgress(progressElement, displayedPercent, file, null, 'GitHub 已响应，正在确认结果…');
          } else if (xhr.readyState === 3 && !finished) {
            displayedPercent = Math.max(displayedPercent, 98);
            setProgress(progressElement, displayedPercent, file, null, '正在接收 GitHub 返回结果…');
          }
        };
        xhr.onload = function () {
          finished = true;
          stopPulse();
          var result = {};
          try { result = JSON.parse(xhr.responseText || '{}'); } catch (error) {}
          if (xhr.status >= 200 && xhr.status < 300) {
            finishSuccess(progressElement, file, current, batch, filename, time);
          } else {
            fail(progressElement, file, result.message || ('GitHub 返回 HTTP ' + xhr.status));
          }
        };
        xhr.onerror = function () {
          finished = true;
          stopPulse();
          fail(progressElement, file, '连接 GitHub 失败');
        };
        xhr.ontimeout = function () {
          finished = true;
          stopPulse();
          fail(progressElement, file, '连接 GitHub 超时');
        };
        xhr.send(body);
      };

      reader.readAsDataURL(file);
    };

    // 保留原批次补丁标记，避免旧观察器再次覆盖本实现。
    window.confirmUploadFile.__batch = true;
    window.confirmUploadFile.__replyProgressV2 = true;
  }

  window.SoilReplyUploadProgress = {
    install: install,
    formatBytes: formatBytes
  };

  install();
  setTimeout(install, 500);
  setTimeout(install, 1500);
})();
