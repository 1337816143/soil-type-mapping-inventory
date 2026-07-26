(function () {
  'use strict';

  var OWNER = '1337816143';
  var REPO = 'soil-type-mapping-inventory';
  var MANIFEST_ASSET = 'soil-import-manifest.json';
  var busy = false;

  function A() { return window.SoilRepoAdmin; }
  function Q() { return window.SoilAdminImport; }
  function token() { return String(window.SOIL_GITHUB_UPLOAD_TOKEN || '').trim(); }

  function api(path, options) {
    options = options || {};
    var headers = Object.assign({
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, options.headers || {});
    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + path, Object.assign({}, options, {headers: headers})).then(function (response) {
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
    });
  }

  function uploadAsset(release, name, blob) {
    var uploadUrl = String(release.upload_url || '').replace(/\{.*$/, '');
    if (!uploadUrl) throw new Error('GitHub 未返回 Release 上传地址。');
    return fetch(uploadUrl + '?name=' + encodeURIComponent(name), {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token(),
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': blob.type || 'application/octet-stream'
      },
      body: blob
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = {};
        if (text) {
          try { data = JSON.parse(text); } catch (error) { data = {message: text}; }
        }
        if (!response.ok) {
          var failure = new Error(data.message || ('Release 文件上传失败：HTTP ' + response.status));
          failure.status = response.status;
          throw failure;
        }
        return data;
      });
    });
  }

  function sha256(file) {
    if (!window.crypto || !window.crypto.subtle || typeof file.arrayBuffer !== 'function') {
      return Promise.resolve('');
    }
    return file.arrayBuffer().then(function (buffer) {
      return crypto.subtle.digest('SHA-256', buffer);
    }).then(function (hash) {
      return Array.prototype.map.call(new Uint8Array(hash), function (value) {
        return value.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function extension(path) {
    var name = String(path || '').slice(String(path || '').lastIndexOf('/') + 1);
    var index = name.lastIndexOf('.');
    if (index <= 0 || index === name.length - 1) return '.bin';
    return name.slice(index).replace(/[^.a-z0-9_-]/gi, '').slice(0, 18) || '.bin';
  }

  function makeId() {
    var date = new Date();
    function p(value) { return String(value).padStart(2, '0'); }
    var stamp = date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate()) + p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds());
    var random = Math.random().toString(36).slice(2, 8);
    return stamp + '-' + random;
  }

  function progress(text, percent) {
    var q = Q();
    if (q && typeof q.progress === 'function') q.progress(text, percent, true);
  }

  function updateModeTip() {
    var modal = document.getElementById('soilAdminImport');
    if (!modal) return;
    var tip = modal.querySelector('.adm-tip');
    if (tip) {
      tip.textContent = '文件将以原始二进制暂存到 GitHub 临时 Release，不经过 Base64；随后由 GitHub Actions 按预览目录一次性归档到 main。单文件仍须小于 95 MB，超限 PPTX会先按连续幻灯片拆分。';
    }
    var button = document.getElementById('adm-ok');
    if (button) button.textContent = '开始上传';
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
    var index = 2;
    var candidate = '';
    do {
      candidate = folder + stem + '_第' + index + '份' + suffix;
      index += 1;
    } while (used[candidate]);
    used[candidate] = true;
    return candidate;
  }

  function buildManifest(files, baseCommit, importId) {
    var q = Q();
    var a = A();
    var kind = document.getElementById('adm-kind').value;
    var dataKey = document.getElementById('adm-data-key').value;
    var used = existingPaths();
    var createdAt = new Date().toISOString();
    var records = files.map(function (item, index) {
      if (!item.file || typeof item.file.arrayBuffer !== 'function') {
        throw new Error('文件预览数据不完整：' + item.path);
      }
      if (item.file.size > q.MAX) {
        throw new Error('文件超过 95 MB，无法写入普通 Git 仓库：' + item.path);
      }
      var targetPath = uniquePath(q.destinationFor(item), used);
      var assetName = 'asset-' + String(index + 1).padStart(4, '0') + extension(item.path || item.file.name);
      var record = {
        assetName: assetName,
        targetPath: targetPath,
        sourcePath: item.sourcePath || item.path,
        originalName: item.file.name,
        size: item.file.size,
        mimeType: item.file.type || 'application/octet-stream',
        order: index + 1
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
    });
    return {
      schemaVersion: 1,
      importId: importId,
      kind: kind,
      dataKey: kind === 'quality' ? dataKey : '',
      createdAt: createdAt,
      baseCommit: baseCommit,
      referenceRoot: a.referenceRoot,
      indexPath: a.indexPath,
      files: records
    };
  }

  function cleanupDraft(release) {
    if (!release || !release.id) return Promise.resolve();
    return api('/releases/' + release.id, {method: 'DELETE'}).catch(function () {});
  }

  function pollMain(baseCommit, deadline) {
    return new Promise(function (resolve, reject) {
      function check() {
        api('/git/ref/heads/main', {cache: 'no-store'}).then(function (ref) {
          var current = ref && ref.object && ref.object.sha;
          if (current && current !== baseCommit) {
            resolve(current);
            return;
          }
          if (Date.now() >= deadline) {
            reject(new Error('文件已上传到临时 Release，但后台归档超过等待时间。可稍后刷新页面查看。'));
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

  function startStagedUpload() {
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
    var release = null;
    var published = false;
    var importId = makeId();
    var tag = 'soil-import-' + importId;
    var baseCommit = '';
    var manifest = null;

    busy = true;
    q.state.busy = true;
    button.disabled = true;
    progress('正在读取 main 分支状态……', 1);

    a.loadTree(false).catch(function () { return []; })
      .then(function () { return api('/git/ref/heads/main', {cache: 'no-store'}); })
      .then(function (ref) {
        baseCommit = ref.object.sha;
        manifest = buildManifest(files, baseCommit, importId);
        progress('正在创建临时上传批次……', 3);
        return api('/releases', {
          method: 'POST',
          body: JSON.stringify({
            tag_name: tag,
            target_commitish: 'main',
            name: '[临时导入] ' + importId,
            body: '由管理员导入页面创建。文件上传完成后将由 GitHub Actions 自动归档并删除此临时 Release。',
            draft: true,
            prerelease: true
          })
        });
      })
      .then(function (created) {
        release = created;
        return manifest.files.reduce(function (chain, record, index) {
          return chain.then(function () {
            var item = files[index];
            var start = 5 + Math.round(index / files.length * 78);
            progress('正在校验并上传 ' + (index + 1) + ' / ' + files.length + '：' + a.base(record.targetPath), start);
            return sha256(item.file).then(function (hash) {
              record.sha256 = hash;
              return uploadAsset(release, record.assetName, item.file);
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        progress('正在上传归档清单……', 86);
        var manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {type: 'application/json'});
        return uploadAsset(release, MANIFEST_ASSET, manifestBlob);
      })
      .then(function () {
        progress('原始文件上传完成，正在启动 GitHub Actions 归档……', 90);
        return api('/releases/' + release.id, {
          method: 'PATCH',
          body: JSON.stringify({draft: false, prerelease: true, name: '[自动归档中] ' + importId})
        });
      })
      .then(function () {
        published = true;
        progress('GitHub Actions 正在恢复目录并一次性提交到 main，请保持页面打开……', 96);
        return pollMain(baseCommit, Date.now() + 12 * 60 * 1000);
      })
      .then(function () { return refreshAfterImport(kind); })
      .then(function () {
        progress('归档完成。文件已按预览目录写入 main；GitHub Pages 正在自动更新。', 100);
        setTimeout(function () {
          busy = false;
          q.state.busy = false;
          button.disabled = false;
          q.close();
          if (kind === 'reference') {
            var tab = document.querySelector('[data-tab="references"]');
            if (tab) tab.click();
          }
        }, 1800);
      })
      .catch(function (error) {
        var finish = published ? Promise.resolve() : cleanupDraft(release);
        finish.finally(function () {
          busy = false;
          q.state.busy = false;
          button.disabled = false;
          progress('上传失败：' + error.message, 0);
        });
      });
  }

  function intercept(event) {
    var button = event.target && event.target.closest && event.target.closest('#adm-ok');
    if (!button || button.dataset.splitV2 !== '1' || busy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startStagedUpload();
  }

  function install() {
    updateModeTip();
    var observer = new MutationObserver(updateModeTip);
    observer.observe(document.body, {childList: true, subtree: true});
  }

  document.addEventListener('click', intercept, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(updateModeTip, 1000);
  setTimeout(updateModeTip, 2000);
})();