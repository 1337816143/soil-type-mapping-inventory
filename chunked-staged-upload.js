(function () {
  'use strict';

  if (window.__soilChunkedStagedUploadInstalled) return;
  window.__soilChunkedStagedUploadInstalled = true;

  var OWNER = '1337816143';
  var REPO = 'soil-type-mapping-inventory';
  var API_ROOT = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
  var STAGE_ROOT = '.soil-upload';
  var CHUNK_SIZE = 2 * 1024 * 1024;
  var busy = false;

  function A() { return window.SoilRepoAdmin; }
  function Q() { return window.SoilAdminImport; }
  function token() { return String(window.SOIL_GITHUB_UPLOAD_TOKEN || '').trim(); }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function progress(text, percent) {
    var q = Q();
    if (q && typeof q.progress === 'function') q.progress(text, percent, true);
  }

  function api(path, options, attempt) {
    options = options || {};
    attempt = attempt || 1;
    var headers = Object.assign({
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, options.headers || {});
    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(API_ROOT + path, Object.assign({}, options, {
      cache: 'no-store',
      headers: headers
    })).then(function (response) {
      return response.text().then(function (text) {
        var data = {};
        if (text) {
          try { data = JSON.parse(text); } catch (error) { data = {message: text}; }
        }
        if (!response.ok) {
          var failure = new Error(data.message || ('GitHub API ' + response.status));
          failure.status = response.status;
          throw failure;
        }
        return data;
      });
    }).catch(function (error) {
      var retryable = !error.status || error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
      if (retryable && attempt < 4) {
        return sleep([0, 1200, 3000, 6500][attempt]).then(function () {
          return api(path, options, attempt + 1);
        });
      }
      throw error;
    });
  }

  function bytesToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var output = '';
    var block = 0x8000;
    for (var i = 0; i < bytes.length; i += block) {
      output += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + block, bytes.length)));
    }
    return btoa(output);
  }

  function createBlob(content, encoding) {
    return api('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({content: content, encoding: encoding || 'utf-8'})
    });
  }

  function makeId() {
    var date = new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
      pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds()) + '-' +
      Math.random().toString(36).slice(2, 8);
  }

  function currentFiles() {
    var q = Q();
    return q && q.state && Array.isArray(q.state.files) ? q.state.files.slice() : [];
  }

  function existingPaths() {
    var a = A();
    var used = {};
    (a && Array.isArray(a.tree) ? a.tree : []).forEach(function (entry) {
      if (entry && entry.type === 'blob' && entry.path) used[entry.path] = true;
    });
    return used;
  }

  function uniquePath(path, used) {
    if (!used[path]) {
      used[path] = true;
      return path;
    }
    var slash = path.lastIndexOf('/');
    var folder = slash >= 0 ? path.slice(0, slash + 1) : '';
    var file = slash >= 0 ? path.slice(slash + 1) : path;
    var dot = file.lastIndexOf('.');
    var stem = dot > 0 ? file.slice(0, dot) : file;
    var suffix = dot > 0 ? file.slice(dot) : '';
    var number = 2;
    var candidate;
    do {
      candidate = folder + stem + '_第' + number + '份' + suffix;
      number += 1;
    } while (used[candidate]);
    used[candidate] = true;
    return candidate;
  }

  function buildManifest(files, baseCommit, uploadId) {
    var q = Q();
    var a = A();
    var kind = document.getElementById('adm-kind').value;
    var dataKey = document.getElementById('adm-data-key').value;
    var used = existingPaths();
    var createdAt = new Date().toISOString();
    return {
      schemaVersion: 2,
      uploadId: uploadId,
      sourceBranch: 'soil-upload-' + uploadId,
      targetBranch: String(window.SOIL_CHUNK_UPLOAD_TARGET_BRANCH || 'main'),
      kind: kind,
      dataKey: kind === 'quality' ? dataKey : '',
      createdAt: createdAt,
      baseCommit: baseCommit,
      referenceRoot: a.referenceRoot,
      indexPath: a.indexPath,
      chunkSize: CHUNK_SIZE,
      files: files.map(function (item, index) {
        if (!item.file || typeof item.file.slice !== 'function') {
          throw new Error('文件预览数据不完整：' + item.path);
        }
        if (item.file.size > q.MAX) {
          throw new Error('文件超过 95 MB，无法写入普通 Git 仓库：' + item.path);
        }
        var targetPath = uniquePath(q.destinationFor(item), used);
        var record = {
          targetPath: targetPath,
          sourcePath: item.sourcePath || item.path,
          originalName: item.file.name,
          size: item.file.size,
          mimeType: item.file.type || 'application/octet-stream',
          order: index + 1,
          chunks: []
        };
        if (kind === 'quality') {
          record.quality = {
            kind: 'quality-control',
            dataKey: dataKey,
            city: item.city || '',
            unit: item.unit || '',
            district: item.district || '',
            batch: item.batch || '管理员导入',
            complete: !!(item.city && item.unit && item.district)
          };
        }
        return record;
      })
    };
  }

  function uploadChunks(files, manifest, entries) {
    var totalBytes = files.reduce(function (sum, item) { return sum + item.file.size; }, 0) || 1;
    var uploadedBytes = 0;
    return files.reduce(function (fileChain, item, fileIndex) {
      return fileChain.then(function () {
        var file = item.file;
        var count = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
        var record = manifest.files[fileIndex];
        var indexes = Array.from({length: count}, function (_, index) { return index; });
        return indexes.reduce(function (chunkChain, chunkIndex) {
          return chunkChain.then(function () {
            var start = chunkIndex * CHUNK_SIZE;
            var end = Math.min(file.size, start + CHUNK_SIZE);
            var chunk = file.slice(start, end);
            var chunkPath = STAGE_ROOT + '/' + manifest.uploadId + '/chunks/' +
              String(fileIndex + 1).padStart(4, '0') + '/' + String(chunkIndex + 1).padStart(5, '0') + '.part';
            var percent = 5 + Math.round(uploadedBytes / totalBytes * 76);
            progress('正在分块上传 ' + (fileIndex + 1) + ' / ' + files.length +
              '：' + item.file.name + '\n分块 ' + (chunkIndex + 1) + ' / ' + count, percent);
            return chunk.arrayBuffer().then(bytesToBase64).then(function (content) {
              return createBlob(content, 'base64');
            }).then(function (blob) {
              entries.push({path: chunkPath, mode: '100644', type: 'blob', sha: blob.sha});
              record.chunks.push({path: chunkPath, size: chunk.size});
              uploadedBytes += chunk.size;
              return sleep(120);
            });
          });
        }, Promise.resolve());
      });
    }, Promise.resolve());
  }

  function pollCompletion(uploadId, targetBranch, deadline) {
    return new Promise(function (resolve, reject) {
      function check() {
        api('/commits?sha=' + encodeURIComponent(targetBranch) + '&per_page=20').then(function (commits) {
          var found = (Array.isArray(commits) ? commits : []).find(function (entry) {
            var message = entry && entry.commit && entry.commit.message;
            return String(message || '').indexOf(uploadId) >= 0;
          });
          if (found) {
            resolve(found.sha);
            return;
          }
          if (Date.now() >= deadline) {
            reject(new Error('分块已写入临时分支，但 GitHub Actions 归档超过等待时间。临时分支：soil-upload-' + uploadId));
            return;
          }
          setTimeout(check, 5000);
        }).catch(function (error) {
          if (Date.now() >= deadline) reject(error);
          else setTimeout(check, 5000);
        });
      }
      check();
    });
  }

  function refreshAfterImport(kind) {
    var a = A();
    var q = Q();
    a.tree = null;
    if (kind !== 'quality') return Promise.resolve();
    return fetch(a.raw(a.indexPath) + '?_=' + Date.now(), {cache: 'no-store'}).then(function (response) {
      return response.ok ? response.json() : [];
    }).then(function (index) {
      if (q && q.state) q.state.index = Array.isArray(index) ? index : [];
      if (typeof window.applyAdminQualityIndex === 'function') {
        window.applyAdminQualityIndex(Array.isArray(index) ? index : []);
      }
    }).catch(function () {});
  }

  function startChunkedUpload() {
    var q = Q();
    var a = A();
    if (!q || !a || !q.state || q.state.busy || busy) return;
    if (document.getElementById('adm-pass').value !== q.PASS) {
      progress('管理员密码错误。', 0);
      return;
    }
    if (!token()) {
      progress('页面未配置 GitHub 上传凭证。', 0);
      return;
    }
    var files = currentFiles();
    if (!files.length) {
      progress('请先选择文件。', 0);
      return;
    }
    var kind = document.getElementById('adm-kind').value;
    if (kind === 'quality') {
      var incomplete = files.filter(function (item) { return !item.city || !item.unit || !item.district; });
      if (incomplete.length && !confirm('有 ' + incomplete.length + ' 个文件归档信息不完整，仍会上传但不计入统计。是否继续？')) return;
    }

    var button = document.getElementById('adm-ok');
    var uploadId = makeId();
    var branch = 'soil-upload-' + uploadId;
    var baseCommit = '';
    var baseTree = '';
    var manifest;
    var entries = [];

    busy = true;
    q.state.busy = true;
    button.disabled = true;
    progress('正在读取 main 分支状态……', 1);

    a.loadTree(false).catch(function () { return []; })
      .then(function () { return api('/git/ref/heads/main'); })
      .then(function (ref) {
        baseCommit = ref.object.sha;
        return api('/git/commits/' + baseCommit);
      })
      .then(function (commit) {
        baseTree = commit.tree.sha;
        manifest = buildManifest(files, baseCommit, uploadId);
        return uploadChunks(files, manifest, entries);
      })
      .then(function () {
        progress('正在生成临时分支清单……', 83);
        return createBlob(JSON.stringify(manifest, null, 2), 'utf-8');
      })
      .then(function (blob) {
        entries.push({
          path: STAGE_ROOT + '/' + uploadId + '/manifest.json',
          mode: '100644', type: 'blob', sha: blob.sha
        });
        return createBlob(JSON.stringify({
          schemaVersion: 2,
          uploadId: uploadId,
          manifestPath: STAGE_ROOT + '/' + uploadId + '/manifest.json'
        }, null, 2), 'utf-8');
      })
      .then(function (blob) {
        entries.push({path: STAGE_ROOT + '/ready.json', mode: '100644', type: 'blob', sha: blob.sha});
        progress('正在创建临时分支……', 87);
        return api('/git/trees', {
          method: 'POST',
          body: JSON.stringify({base_tree: baseTree, tree: entries})
        });
      })
      .then(function (tree) {
        return api('/git/commits', {
          method: 'POST',
          body: JSON.stringify({
            message: 'stage: chunked upload ' + uploadId,
            tree: tree.sha,
            parents: [baseCommit]
          })
        });
      })
      .then(function (commit) {
        return api('/git/refs', {
          method: 'POST',
          body: JSON.stringify({ref: 'refs/heads/' + branch, sha: commit.sha})
        });
      })
      .then(function () {
        progress('分块上传完成，GitHub Actions 正在还原文件并一次性提交到 main……', 94);
        return pollCompletion(uploadId, manifest.targetBranch, Date.now() + 15 * 60 * 1000);
      })
      .then(function () { return refreshAfterImport(kind); })
      .then(function () {
        progress('归档完成。文件已写入 main，GitHub Pages 正在自动更新。', 100);
        setTimeout(function () {
          busy = false;
          q.state.busy = false;
          button.disabled = false;
          q.close();
          if (kind === 'reference') {
            var tab = document.querySelector('[data-tab="references"]');
            if (tab) tab.click();
          }
        }, 1600);
      })
      .catch(function (error) {
        busy = false;
        q.state.busy = false;
        button.disabled = false;
        progress('上传失败：' + error.message, 0);
      });
  }

  function updateModeTip() {
    var modal = document.getElementById('soilAdminImport');
    if (!modal) return;
    var tip = modal.querySelector('.adm-tip');
    var text = '文件将通过 api.github.com 按 2 MB 小块写入临时分支，再由 GitHub Actions 还原并一次性归档到 main；不再访问 uploads.github.com。';
    if (tip && tip.textContent !== text) tip.textContent = text;
    var button = document.getElementById('adm-ok');
    if (button && button.textContent !== '开始上传') button.textContent = '开始上传';
  }

  function wrapOpen() {
    var q = Q();
    if (!q || q.__chunkedOpenWrapped || typeof q.open !== 'function') return;
    var original = q.open;
    q.open = function () {
      var result = original.apply(this, arguments);
      setTimeout(updateModeTip, 0);
      return result;
    };
    q.__chunkedOpenWrapped = true;
    window.openSoilAdminImport = q.open;
  }

  function intercept(event) {
    var button = event.target && event.target.closest && event.target.closest('#adm-ok');
    if (!button || button.dataset.splitV2 !== '1' || busy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startChunkedUpload();
  }

  function install() {
    wrapOpen();
    updateModeTip();
  }

  document.addEventListener('click', intercept, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(install, 700);
  setTimeout(install, 1600);
})();
