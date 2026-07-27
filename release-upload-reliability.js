(function () {
  'use strict';

  if (window.__soilReleaseUploadReliabilityInstalled) return;
  window.__soilReleaseUploadReliabilityInstalled = true;

  var OWNER = '1337816143';
  var REPO = 'soil-type-mapping-inventory';
  var API_ROOT = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
  var UPLOAD_PATTERN = new RegExp(
    '^https://uploads\\.github\\.com/repos/' + OWNER + '/' + REPO + '/releases/(\\d+)/assets(?:\\?|$)'
  );
  var nativeFetch = window.fetch.bind(window);
  var MAX_ATTEMPTS = 4;
  var RETRY_DELAYS = [0, 1800, 4500, 9000];
  var BETWEEN_FILES_DELAY = 1400;

  function sleep(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
  }

  function headerValue(headers, name) {
    if (!headers) return '';
    if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name) || '';
    if (Array.isArray(headers)) {
      for (var i = 0; i < headers.length; i++) {
        if (String(headers[i][0] || '').toLowerCase() === name.toLowerCase()) return String(headers[i][1] || '');
      }
      return '';
    }
    var keys = Object.keys(headers);
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].toLowerCase() === name.toLowerCase()) return String(headers[keys[j]] || '');
    }
    return '';
  }

  function requestHeaders(input, init) {
    if (init && init.headers) return init.headers;
    if (typeof Request !== 'undefined' && input instanceof Request) return input.headers;
    return null;
  }

  function requestMethod(input, init) {
    if (init && init.method) return String(init.method).toUpperCase();
    if (typeof Request !== 'undefined' && input instanceof Request) return String(input.method || 'GET').toUpperCase();
    return 'GET';
  }

  function requestUrl(input) {
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    return String(input || '');
  }

  function api(path, token, options) {
    options = options || {};
    var headers = Object.assign({
      'Authorization': token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, options.headers || {});
    return nativeFetch(API_ROOT + path, Object.assign({}, options, {
      cache: 'no-store',
      headers: headers
    })).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        if (text) {
          try { data = JSON.parse(text); } catch (error) { data = null; }
        }
        if (!response.ok) {
          var failure = new Error((data && data.message) || ('GitHub API ' + response.status));
          failure.status = response.status;
          throw failure;
        }
        return data;
      });
    });
  }

  function listAssets(releaseId, token, page, collected) {
    page = page || 1;
    collected = collected || [];
    return api('/releases/' + releaseId + '/assets?per_page=100&page=' + page, token).then(function (assets) {
      assets = Array.isArray(assets) ? assets : [];
      collected = collected.concat(assets);
      if (assets.length === 100 && page < 10) return listAssets(releaseId, token, page + 1, collected);
      return collected;
    });
  }

  function deleteAsset(asset, token) {
    if (!asset || !asset.id) return Promise.resolve();
    return api('/releases/assets/' + asset.id, token, {method: 'DELETE'}).catch(function () {});
  }

  function inspectExisting(releaseId, name, expectedSize, token) {
    return listAssets(releaseId, token).then(function (assets) {
      var asset = assets.find(function (item) { return item && item.name === name; });
      if (!asset) return null;
      var complete = asset.state === 'uploaded' && Number(asset.size) === Number(expectedSize);
      if (complete) return asset;
      return deleteAsset(asset, token).then(function () { return null; });
    }).catch(function () {
      return null;
    });
  }

  function responseFromAsset(asset) {
    return new Response(JSON.stringify(asset || {}), {
      status: 201,
      headers: {'Content-Type': 'application/json'}
    });
  }

  function xhrUpload(url, init) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.timeout = 20 * 60 * 1000;

      var headers = requestHeaders(url, init);
      if (headers instanceof Headers) {
        headers.forEach(function (value, key) { xhr.setRequestHeader(key, value); });
      } else if (Array.isArray(headers)) {
        headers.forEach(function (entry) { xhr.setRequestHeader(entry[0], entry[1]); });
      } else if (headers) {
        Object.keys(headers).forEach(function (key) { xhr.setRequestHeader(key, headers[key]); });
      }

      xhr.onload = function () {
        resolve(new Response(xhr.responseText || '', {
          status: xhr.status,
          statusText: xhr.statusText || '',
          headers: {'Content-Type': xhr.getResponseHeader('Content-Type') || 'application/json'}
        }));
      };
      xhr.onerror = function () { reject(new TypeError('Release 上传连接中断')); };
      xhr.ontimeout = function () { reject(new TypeError('Release 上传超时')); };
      xhr.onabort = function () { reject(new TypeError('Release 上传被中止')); };
      xhr.send(init && init.body != null ? init.body : null);
    });
  }

  function shouldRetryStatus(status) {
    return status === 408 || status === 409 || status === 422 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }

  function reliableUpload(url, init, releaseId, name, expectedSize, token) {
    function attempt(number) {
      var delay = RETRY_DELAYS[Math.min(number - 1, RETRY_DELAYS.length - 1)];
      return sleep(delay).then(function () {
        return xhrUpload(url, init);
      }).then(function (response) {
        if (response.ok) return sleep(BETWEEN_FILES_DELAY).then(function () { return response; });
        if (!shouldRetryStatus(response.status)) return response;
        return inspectExisting(releaseId, name, expectedSize, token).then(function (asset) {
          if (asset) return sleep(BETWEEN_FILES_DELAY).then(function () { return responseFromAsset(asset); });
          if (number >= MAX_ATTEMPTS) return response;
          return attempt(number + 1);
        });
      }).catch(function (error) {
        return inspectExisting(releaseId, name, expectedSize, token).then(function (asset) {
          if (asset) return sleep(BETWEEN_FILES_DELAY).then(function () { return responseFromAsset(asset); });
          if (number < MAX_ATTEMPTS) return attempt(number + 1);
          var failure = new Error(
            '上传“' + name + '”时与 uploads.github.com 的连接中断，已自动重试 ' + MAX_ATTEMPTS + ' 次。' +
            '请确认代理或防火墙允许访问 uploads.github.com。原始错误：' + (error && error.message ? error.message : 'Failed to fetch')
          );
          failure.cause = error;
          throw failure;
        });
      });
    }
    return attempt(1);
  }

  window.fetch = function (input, init) {
    var url = requestUrl(input);
    var match = url.match(UPLOAD_PATTERN);
    if (!match || requestMethod(input, init) !== 'POST' || !init || !(init.body instanceof Blob)) {
      return nativeFetch(input, init);
    }

    var parsed = new URL(url);
    var name = parsed.searchParams.get('name') || '未命名文件';
    var releaseId = match[1];
    var authorization = headerValue(requestHeaders(input, init), 'Authorization');
    return reliableUpload(url, init, releaseId, name, init.body.size, authorization);
  };
})();
