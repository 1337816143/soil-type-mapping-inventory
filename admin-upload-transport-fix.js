(function () {
  'use strict';

  if (window.__soilAdminUploadTransportFixInstalled) return;
  window.__soilAdminUploadTransportFixInstalled = true;

  var API_ROOT = 'https://api.github.com/repos/1337816143/soil-type-mapping-inventory';
  var TOKEN_KEY = 'soilGithubUploadTokenV2';
  var CHUNK_SIZE = 39 * 1024 * 1024;
  var nativeFetch = window.fetch.bind(window);
  var activeCredential = '';
  var credentialReadyUntil = 0;
  var tracked = {text: '', percent: 0, pulse: null, originalProgress: null};

  function admin() { return window.SoilAdminImport; }
  function embeddedToken() { return String(window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN || '').trim(); }
  function currentToken() { return String(window.SOIL_GITHUB_UPLOAD_TOKEN || embeddedToken()).trim(); }

  function uniqueTokens() {
    var seen = {};
    return [currentToken(), embeddedToken()].filter(function (value) {
      value = String(value || '').trim();
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function clearStoredOverride() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } catch (error) {}
    window.SOIL_GITHUB_UPLOAD_TOKEN = embeddedToken();
  }

  function messageFrom(text, status) {
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (error) {}
    var message = data.message || ('GitHub API HTTP ' + status);
    if (status === 401 || /Bad credentials/i.test(message)) {
      return 'GitHub 上传凭证无效或已被撤销。内置 Token 没有被删除；请点击“更新GitHub上传凭证”，设置新的有效 Fine-grained PAT。';
    }
    if (status === 403 && /Resource not accessible|permission/i.test(message)) {
      return 'GitHub 上传凭证有效，但缺少本仓库 Contents 读写权限。请更新具有 Contents: Read and write 权限的 Fine-grained PAT。';
    }
    return message;
  }

  function validateToken(token) {
    return nativeFetch(API_ROOT + '/git/ref/heads/main', {
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }).then(function (response) {
      return response.text().then(function (text) {
        if (!response.ok) {
          var error = new Error(messageFrom(text, response.status));
          error.status = response.status;
          throw error;
        }
        return token;
      });
    });
  }

  function resolveCredential() {
    if (activeCredential && Date.now() < credentialReadyUntil) return Promise.resolve(activeCredential);
    var tokens = uniqueTokens();
    if (!tokens.length) return Promise.reject(new Error('页面未配置 GitHub 上传凭证。'));
    var index = 0;
    function next() {
      var candidate = tokens[index++];
      return validateToken(candidate).then(function () {
        activeCredential = candidate;
        credentialReadyUntil = Date.now() + 10 * 60 * 1000;
        window.SOIL_GITHUB_UPLOAD_TOKEN = candidate;
        if (candidate === embeddedToken()) clearStoredOverride();
        return candidate;
      }).catch(function (error) {
        if ((error.status === 401 || /凭证无效|Bad credentials/i.test(error.message || '')) && index < tokens.length) {
          clearStoredOverride();
          return next();
        }
        throw error;
      });
    }
    return next();
  }

  function stopPulse() {
    if (tracked.pulse) clearInterval(tracked.pulse);
    tracked.pulse = null;
  }

  function isFileStage(text) {
    return /正在整文件上传|正在上传超限文件/.test(String(text || ''));
  }

  function emit(text, percent) {
    tracked.text = String(text || tracked.text || '');
    tracked.percent = Math.max(tracked.percent || 0, Number(percent) || 0);
    if (tracked.originalProgress) tracked.originalProgress(tracked.text, tracked.percent, true);
  }

  function startEncodingPulse() {
    stopPulse();
    var ceiling = Math.min(79, Math.max(tracked.percent + 7, tracked.percent));
    tracked.pulse = setInterval(function () {
      if (tracked.percent >= ceiling) return;
      emit(tracked.text + '\n正在读取并编码本地文件…', tracked.percent + 1);
    }, 650);
  }

  function installProgressTracking() {
    var q = admin();
    if (!q || typeof q.progress !== 'function' || q.progress.__adminTransportTracked) return;
    var original = q.progress.bind(q);
    tracked.originalProgress = original;
    q.progress = function (text, percent) {
      tracked.text = String(text || '');
      tracked.percent = Number(percent) || 0;
      if (isFileStage(tracked.text)) startEncodingPulse();
      else stopPulse();
      return original.apply(q, arguments);
    };
    q.progress.__adminTransportTracked = true;
  }

  function fileRangeFromProgress() {
    var q = admin();
    var files = q && q.state && Array.isArray(q.state.files) ? q.state.files : [];
    var text = tracked.text || '';
    var start = Number(tracked.percent) || 0;
    var end = Math.min(81, start + 5);
    var total = files.reduce(function (sum, item) {
      return sum + Number(item && item.file && item.file.size || 0);
    }, 0) || 1;

    var whole = text.match(/正在整文件上传\s+(\d+)\s*\/\s*(\d+)/);
    var chunked = text.match(/正在上传超限文件\s+(\d+)\s*\/\s*(\d+)[\s\S]*?39 MiB 分块\s+(\d+)\s*\/\s*(\d+)/);
    if (whole) {
      var fileIndex = Math.max(0, Number(whole[1]) - 1);
      var before = files.slice(0, fileIndex).reduce(function (sum, item) {
        return sum + Number(item && item.file && item.file.size || 0);
      }, 0);
      var size = Number(files[fileIndex] && files[fileIndex].file && files[fileIndex].file.size || 0);
      start = 5 + Math.round(before / total * 76);
      end = 5 + Math.round((before + size) / total * 76);
    } else if (chunked) {
      var selectedIndex = Math.max(0, Number(chunked[1]) - 1);
      var chunkIndex = Math.max(0, Number(chunked[3]) - 1);
      var prior = files.slice(0, selectedIndex).reduce(function (sum, item) {
        return sum + Number(item && item.file && item.file.size || 0);
      }, 0);
      var fileSize = Number(files[selectedIndex] && files[selectedIndex].file && files[selectedIndex].file.size || 0);
      var chunkStart = Math.min(fileSize, chunkIndex * CHUNK_SIZE);
      var chunkEnd = Math.min(fileSize, (chunkIndex + 1) * CHUNK_SIZE);
      start = 5 + Math.round((prior + chunkStart) / total * 76);
      end = 5 + Math.round((prior + chunkEnd) / total * 76);
    }
    return {start: start, end: Math.max(start + 1, end)};
  }

  function responseLike(xhr) {
    return {
      ok: xhr.status >= 200 && xhr.status < 300,
      status: xhr.status,
      statusText: xhr.statusText,
      url: xhr.responseURL,
      text: function () {
        if (xhr.status === 401 || /Bad credentials/i.test(xhr.responseText || '')) {
          return Promise.resolve(JSON.stringify({message: messageFrom(xhr.responseText, xhr.status)}));
        }
        return Promise.resolve(xhr.responseText || '');
      },
      json: function () {
        return this.text().then(function (text) { return text ? JSON.parse(text) : {}; });
      }
    };
  }

  function uploadBlobWithProgress(url, options) {
    return new Promise(function (resolve, reject) {
      stopPulse();
      var range = fileRangeFromProgress();
      var displayed = range.start;
      var gotNative = false;
      var xhr = new XMLHttpRequest();
      var pulse = null;

      function finishPulse() {
        if (pulse) clearInterval(pulse);
        pulse = null;
      }
      function update(ratio, detail, nativeProgress) {
        ratio = Math.max(0, Math.min(1, Number(ratio) || 0));
        var calculated = range.start + Math.round((range.end - range.start) * ratio);
        displayed = Math.max(displayed, calculated);
        if (nativeProgress) gotNative = true;
        emit((tracked.text || '正在上传文件') + '\n' + detail, displayed);
      }

      xhr.open(options.method || 'POST', url, true);
      xhr.timeout = 240000;
      var headers = new Headers(options.headers || {});
      headers.set('Authorization', 'Bearer ' + activeCredential);
      headers.forEach(function (value, name) { xhr.setRequestHeader(name, value); });
      if (!headers.has('content-type')) xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.upload.onloadstart = function () {
        update(0.02, '正在建立 GitHub 上传连接…', false);
        pulse = setInterval(function () {
          if (gotNative || displayed >= range.start + Math.floor((range.end - range.start) * 0.9)) return;
          displayed += 1;
          emit((tracked.text || '正在上传文件') + '\n正在上传，等待浏览器返回实时字节…', displayed);
        }, 650);
      };
      xhr.upload.onprogress = function (event) {
        if (!event.lengthComputable || !event.total) return;
        update(event.loaded / event.total,
          '正在传输：' + Math.round(event.loaded / 1024) + ' KiB / ' + Math.round(event.total / 1024) + ' KiB', true);
      };
      xhr.upload.onload = function () {
        finishPulse();
        update(0.98, '文件已发送，等待 GitHub 确认写入…', true);
      };
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 2) update(0.985, 'GitHub 已响应，正在确认结果…', true);
        else if (xhr.readyState === 3) update(0.99, '正在接收 GitHub 返回结果…', true);
      };
      xhr.onload = function () {
        finishPulse();
        if (xhr.status >= 200 && xhr.status < 300) update(1, 'GitHub 已确认写入。', true);
        resolve(responseLike(xhr));
      };
      xhr.onerror = function () {
        finishPulse();
        reject(new TypeError('连接 GitHub 失败'));
      };
      xhr.ontimeout = function () {
        finishPulse();
        reject(new TypeError('连接 GitHub 超时'));
      };
      xhr.send(options.body || null);
    });
  }

  window.fetch = function (input, options) {
    var url = typeof input === 'string' ? input : String(input && input.url || input);
    options = options || {};
    if (activeCredential && url.indexOf(API_ROOT) === 0) {
      var headers = new Headers(options.headers || {});
      headers.set('Authorization', 'Bearer ' + activeCredential);
      options = Object.assign({}, options, {headers: headers});
      if (/\/git\/blobs(?:\?|$)/.test(url) && String(options.method || 'GET').toUpperCase() === 'POST') {
        return uploadBlobWithProgress(url, options);
      }
    }
    return nativeFetch(input, options);
  };

  function armButton() {
    installProgressTracking();
    var button = document.getElementById('adm-ok');
    if (!button) return;
    button.dataset.authReady = '1';
    button.dataset.transportFix = '1';
  }

  function intercept(event) {
    var button = event.target && event.target.closest && event.target.closest('#adm-ok');
    if (!button || button.dataset.transportFix !== '1') return;
    if (button.dataset.transportCredentialReady === '1') {
      button.dataset.transportCredentialReady = '0';
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    installProgressTracking();
    var q = admin();
    if (q && document.getElementById('adm-pass') && document.getElementById('adm-pass').value !== q.PASS) {
      if (q.progress) q.progress('管理员密码错误。', 0, true);
      return;
    }
    if (q && q.progress) q.progress('正在验证 GitHub 上传凭证……', 1, true);
    resolveCredential().then(function () {
      if (q && q.progress) q.progress('凭证有效，正在准备上传……', 2, true);
      button.dataset.authReady = '1';
      button.dataset.transportCredentialReady = '1';
      button.click();
    }).catch(function (error) {
      activeCredential = '';
      credentialReadyUntil = 0;
      if (q && q.progress) q.progress('上传失败：' + error.message, 0, true);
    });
  }

  document.addEventListener('click', intercept, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armButton);
  else armButton();
  var observer = new MutationObserver(armButton);
  observer.observe(document.documentElement, {childList: true, subtree: true});
  setTimeout(armButton, 500);
  setTimeout(armButton, 1500);
})();
