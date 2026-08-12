(function () {
  'use strict';

  if (window.__soilHybridStagedUploadInstalled) return;
  window.__soilHybridStagedUploadInstalled = true;

  var OWNER = '1337816143';
  var REPO = 'soil-type-mapping-inventory';
  var API_ROOT = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
  var STAGE_ROOT = '.soil-upload';
  var SINGLE_BLOB_LIMIT = 39 * 1024 * 1024;
  var CHUNK_SIZE = 39 * 1024 * 1024;
  var busy = false;

  function A() { return window.SoilRepoAdmin; }
  function Q() { return window.SoilAdminImport; }
  function R() { return window.SoilQualityFileRouting; }
  function C() { return window.SoilAdminAutoClassifier; }
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
      var retryable = !error.status || error.status === 408 || error.status === 409 ||
        error.status === 429 || error.status >= 500;
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

  function itemMetadata(item) {
    var classifier = C();
    if (item && item.autoMeta) return item.autoMeta;
    if (classifier && typeof classifier.applyItemMetadata === 'function') return classifier.applyItemMetadata(item);
    return null;
  }

  function itemDataKeys(item, fallback) {
    var meta = itemMetadata(item);
    var keys = meta && Array.isArray(meta.dataKeys) ? meta.dataKeys.filter(Boolean) : [];
    if (!keys.length && fallback) keys = [fallback];
    return keys;
  }

  function safeSegment(value) {
    return String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  }

  function qualityRoot() {
    var a = A();
    var select = document.getElementById('adm-directory');
    var root = select && select.value ? select.value : 'data/质控意见反馈_管理员导入';
    var extra = document.getElementById('adm-new-directory');
    if (extra && extra.value.trim()) root += '/' + extra.value.trim();
    return a.clean(root);
  }

  function automaticQualityPath(item, dataKeys) {
    var q = Q();
    var a = A();
    if (!item || !item.file) return q.destinationFor(item);
    if (dataKeys.length !== 1) {
      return a.clean(qualityRoot() + '/多成果共享质控/' + safeSegment(item.batch || '管理员导入') + '/' + safeSegment(item.file.name));
    }
    var label = q.types()[dataKeys[0]] || dataKeys[0];
    return a.clean([qualityRoot(), label, item.batch || '未分批', item.city || '未分类市', item.unit || '未分类单位', item.district || '未分类任务单元', item.path].join('/'));
  }

  function sharedInspection(item, dataKeys) {
    var router = R();
    if (!router || !item || !item.file || !router.isSharedReport(item.file.name)) return null;
    var inspection = router.inspectFile(item.file.name, dataKeys && dataKeys.length ? dataKeys : router.coveredKeys);
    if (!inspection.targets.length) return null;
    if (inspection.unresolved.length) {
      var first = inspection.unresolved[0];
      throw new Error('北部共享质控文件自动匹配失败：' + first.target + '（' + first.dataKey + '）。请检查文件名或任务单元清单。');
    }
    return inspection;
  }

  function buildManifest(files, baseCommit, uploadId) {
    var q = Q();
    var a = A();
    var router = R();
    var classifier = C();
    var selection = classifier && typeof classifier.selectionMetadata === 'function' ? classifier.selectionMetadata(files) : null;
    if (selection && selection.kind === 'mixed') throw new Error('一次导入中同时包含质控意见和参考资料，请分两次选择；其余信息均可自动匹配。');
    var detectedKind = selection && (selection.kind === 'quality' || selection.kind === 'reference') ? selection.kind : '';
    var kind = detectedKind || document.getElementById('adm-kind').value;
    var dataKey = document.getElementById('adm-data-key').value;
    var used = existingPaths();
    var createdAt = new Date().toISOString();
    return {
      schemaVersion: 3,
      uploadId: uploadId,
      sourceBranch: 'soil-upload-' + uploadId,
      targetBranch: String(window.SOIL_HYBRID_UPLOAD_TARGET_BRANCH || 'main'),
      kind: kind,
      dataKey: kind === 'quality' ? dataKey : '',
      createdAt: createdAt,
      baseCommit: baseCommit,
      referenceRoot: a.referenceRoot,
      indexPath: a.indexPath,
      singleBlobLimit: SINGLE_BLOB_LIMIT,
      chunkSize: CHUNK_SIZE,
      files: files.map(function (item, index) {
        if (!item.file || typeof item.file.slice !== 'function') {
          throw new Error('文件预览数据不完整：' + item.path);
        }
        if (item.file.size > q.MAX) {
          throw new Error('文件超过 95 MB，须先按原格式拆分：' + item.path);
        }

        var meta = itemMetadata(item);
        var dataKeys = kind === 'quality' ? itemDataKeys(item, dataKey) : [];
        var shared = kind === 'quality' ? sharedInspection(item, dataKeys) : null;
        var targetPath = shared && router ?
          uniquePath(router.sharedStoragePath(item.file.name, item.batch || '管理员导入'), used) :
          uniquePath(kind === 'quality' && meta && meta.dataKeys && meta.dataKeys.length ? automaticQualityPath(item, dataKeys) : q.destinationFor(item), used);
        var record = {
          targetPath: targetPath,
          sourcePath: item.sourcePath || item.path,
          originalName: item.file.name,
          size: item.file.size,
          mimeType: item.file.type || 'application/octet-stream',
          order: index + 1,
          storage: item.file.size <= SINGLE_BLOB_LIMIT ? 'whole' : 'chunked'
        };
        if (meta && meta.catalogExact && meta.expectedSha256) {
          record.expectedSha256 = String(meta.expectedSha256).toLowerCase();
          record.expectedSize = Number(meta.expectedSize || item.file.size);
        }
        if (kind === 'quality') {
          if (shared) {
            record.quality = {
              kind: 'quality-control',
              shared: true,
              dataKeys: shared.dataKeys.slice(),
              targets: shared.targets.slice(),
              batch: item.batch || '管理员导入',
              complete: true
            };
          } else {
            record.quality = {
              kind: 'quality-control',
              dataKey: dataKeys[0] || dataKey,
              dataKeys: dataKeys.slice(),
              city: item.city || '',
              unit: item.unit || '',
              district: item.district || '',
              batch: item.batch || '管理员导入',
              complete: !!(item.city && item.unit && item.district)
            };
          }
        }
        return record;
      })
    };
  }

  function stageWholeFile(file, record, fileIndex, manifest, entries) {
    var path = STAGE_ROOT + '/' + manifest.uploadId + '/whole/' +
      String(fileIndex + 1).padStart(4, '0') + '.bin';
    return file.arrayBuffer().then(bytesToBase64).then(function (content) {
      return createBlob(content, 'base64');
    }).then(function (blob) {
      entries.push({path: path, mode: '100644', type: 'blob', sha: blob.sha});
      record.whole = {path: path, size: file.size};
    });
  }

  function stageChunkedFile(file, record, fileIndex, manifest, entries, onChunk) {
    var count = Math.ceil(file.size / CHUNK_SIZE);
    record.chunks = [];
    var indexes = Array.from({length: count}, function (_, index) { return index; });
    return indexes.reduce(function (chain, chunkIndex) {
      return chain.then(function () {
        var start = chunkIndex * CHUNK_SIZE;
        var end = Math.min(file.size, start + CHUNK_SIZE);
        var chunk = file.slice(start, end);
        var path = STAGE_ROOT + '/' + manifest.uploadId + '/chunks/' +
          String(fileIndex + 1).padStart(4, '0') + '/' +
          String(chunkIndex + 1).padStart(3, '0') + '.part';
        onChunk(chunkIndex, count, chunk.size);
        return chunk.arrayBuffer().then(bytesToBase64).then(function (content) {
          return createBlob(content, 'base64');
        }).then(function (blob) {
          entries.push({path: path, mode: '100644', type: 'blob', sha: blob.sha});
          record.chunks.push({path: path, size: chunk.size});
          return sleep(160);
        });
      });
    }, Promise.resolve());
  }

  function stageFiles(files, manifest, entries) {
    var totalBytes = files.reduce(function (sum, item) { return sum + item.file.size; }, 0) || 1;
    var completedBytes = 0;
    return files.reduce(function (chain, item, fileIndex) {
      return chain.then(function () {
        var file = item.file;
        var record = manifest.files[fileIndex];
        var basePercent = 5 + Math.round(completedBytes / totalBytes * 76);
        if (record.storage === 'whole') {
          progress('正在整文件上传 ' + (fileIndex + 1) + ' / ' + files.length +
            '（不分块）：' + file.name, basePercent);
          return stageWholeFile(file, record, fileIndex, manifest, entries).then(function () {
            completedBytes += file.size;
            return sleep(160);
          });
        }
        return stageChunkedFile(file, record, fileIndex, manifest, entries, function (chunkIndex, count) {
          var percent = 5 + Math.round((completedBytes + chunkIndex * CHUNK_SIZE) / totalBytes * 76);
          progress('正在上传超限文件 ' + (fileIndex + 1) + ' / ' + files.length + '：' + file.name +
            '\n39 MiB 分块 ' + (chunkIndex + 1) + ' / ' + count, percent);
        }).then(function () {
          completedBytes += file.size;
        });
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
            reject(new Error('文件已写入临时分支，但 GitHub Actions 归档超过等待时间。临时分支：soil-upload-' + uploadId));
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

  function isSharedItem(item) {
    var router = R();
    return !!(router && item && item.file && router.isSharedReport(item.file.name));
  }

  function startHybridUpload() {
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
    var classifier = C();
    var selection = classifier && typeof classifier.selectionMetadata === 'function' ? classifier.selectionMetadata(files) : null;
    if (selection && selection.kind === 'mixed') {
      progress('一次导入中同时包含质控意见和参考资料，请分两次选择；成果类型、批次和任务单元仍会自动匹配。', 0);
      return;
    }
    var kind = selection && (selection.kind === 'quality' || selection.kind === 'reference') ? selection.kind : document.getElementById('adm-kind').value;
    if (kind === 'quality') {
      var fallbackDataKey = document.getElementById('adm-data-key').value;
      var incomplete = files.filter(function (item) {
        return !isSharedItem(item) && (!itemDataKeys(item, fallbackDataKey).length || !item.city || !item.unit || !item.district);
      });
      if (incomplete.length && !confirm('有 ' + incomplete.length + ' 个文件归档信息不完整，仍会上传但不计入统计。是否继续？')) return;
      try {
        files.forEach(function (item) { if (isSharedItem(item)) sharedInspection(item, itemDataKeys(item, fallbackDataKey)); });
      } catch (error) {
        progress(error.message, 0);
        return;
      }
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
        var sharedCount = manifest.files.filter(function (item) { return item.quality && item.quality.shared; }).length;
        var autoTypedCount = manifest.files.filter(function (item) { return item.quality && Array.isArray(item.quality.dataKeys) && item.quality.dataKeys.length; }).length;
        if (sharedCount) {
          progress('已识别 ' + sharedCount + ' 份北部共享质控报告：每份文件只上传一次，并自动关联地区、成果类型和批次。', 4);
        } else if (kind === 'quality' && autoTypedCount) {
          progress('已自动识别 ' + autoTypedCount + ' 份质控文件的成果类型、批次和任务单元，无需手动指定。', 4);
        }
        return stageFiles(files, manifest, entries);
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
          schemaVersion: 3,
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
            message: 'stage: hybrid upload ' + uploadId,
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
        progress('上传完成，GitHub Actions 正在还原文件并一次性提交到 main……', 94);
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
    var text = '导入时自动识别导入类型、成果类型、批次和任务单元；只有无法识别的项目才需要人工调整。39 MiB 及以下整文件上传，超过39 MiB按块暂存；北部共享报告始终只保存一份原文件。';
    if (tip && tip.textContent !== text) tip.textContent = text;
    var button = document.getElementById('adm-ok');
    if (button && button.textContent !== '开始上传') button.textContent = '开始上传';
  }

  function wrapOpen() {
    var q = Q();
    if (!q || q.__hybridOpenWrapped || typeof q.open !== 'function') return;
    var original = q.open;
    q.open = function () {
      var result = original.apply(this, arguments);
      setTimeout(updateModeTip, 0);
      return result;
    };
    q.__hybridOpenWrapped = true;
    window.openSoilAdminImport = q.open;
  }

  function intercept(event) {
    var button = event.target && event.target.closest && event.target.closest('#adm-ok');
    if (!button || button.dataset.splitV2 !== '1' || busy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startHybridUpload();
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
