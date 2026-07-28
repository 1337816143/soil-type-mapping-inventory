(function () {
  'use strict';

  var OWNER = '1337816143';
  var REPO = 'soil-type-mapping-inventory';
  var TOKEN_KEY = 'soilGithubUploadTokenV2';
  var SUCCESS_NOTICE = '上传成功！稍等3~5分钟刷新网站即可查看新上传的文件。';
  var validating = null;
  var validated = '';
  var validatedAt = 0;
  var renderKey = '';

  function core() {
    return window.SoilReplyWorkflow;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function defaultToken() {
    return String(window.SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN || '').trim();
  }

  function storedToken() {
    try {
      return String(
        sessionStorage.getItem(TOKEN_KEY) ||
        localStorage.getItem(TOKEN_KEY) ||
        defaultToken()
      ).trim();
    } catch (error) {
      return defaultToken();
    }
  }

  function activateToken(token, remember) {
    token = String(token || defaultToken()).trim();
    window.SOIL_GITHUB_UPLOAD_TOKEN = token;
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (token && token !== defaultToken()) {
        (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
      }
    } catch (error) {}
    return token;
  }

  function resetToDefaultToken() {
    validated = '';
    validatedAt = 0;
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } catch (error) {}
    window.SOIL_GITHUB_UPLOAD_TOKEN = defaultToken();
  }

  function badCredentialMessage() {
    return 'GitHub上传凭证已失效或被撤销，请更新有效的Fine-grained PAT。';
  }

  function checkToken(token) {
    return fetch('https://api.github.com/user', {
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }).then(function (response) {
      if (response.status === 401) throw new Error(badCredentialMessage());
      if (!response.ok) throw new Error('GitHub凭证校验失败：HTTP ' + response.status);
      return token;
    });
  }

  function installStyles() {
    if (document.getElementById('uploadAuthBatchStyle')) return;
    var style = document.createElement('style');
    style.id = 'uploadAuthBatchStyle';
    style.textContent =
      '.cred-mask{display:none;position:fixed;inset:0;z-index:16000;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.58)}' +
      '.cred-mask.show{display:flex}.cred-card{width:min(520px,96vw);padding:22px;background:#fff;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.28)}' +
      '.cred-card h3{margin:0 0 10px;color:#1e3a8a}.cred-card p{font-size:.76rem;line-height:1.65;color:#475569}' +
      '.cred-card label{display:flex;flex-direction:column;gap:5px;margin-top:11px;font-size:.78rem;font-weight:650}' +
      '.cred-card input[type=password]{padding:9px 10px;border:1px solid #cbd5e1;border-radius:7px;font:inherit}' +
      '.cred-card .remember{display:flex;flex-direction:row;align-items:center;font-weight:500}' +
      '.cred-status{min-height:24px;margin-top:8px;color:#b91c1c;font-size:.76rem}' +
      '.cred-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.cred-actions button{padding:8px 15px;border:0;border-radius:7px;cursor:pointer}' +
      '.cred-save{background:#2563eb;color:#fff;font-weight:650}.credential-tools{display:flex;justify-content:flex-end;margin:5px 0}' +
      '.credential-tools button{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:6px;padding:5px 9px;font-size:.72rem;cursor:pointer}' +
      '.reply-batch-line{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:3px 0}.reply-batch-tag{font-size:.68rem;padding:1px 6px;border-radius:10px;background:#e0e7ff;color:#3730a3}' +
      '.reply-batch-line .upload-btn,.reply-batch-line .replace-btn,.reply-batch-line .reply-view-btn{display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;line-height:1.35;padding:2px 7px;border-radius:5px;text-decoration:none;cursor:pointer}' +
      '.reply-view-btn{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8}' +
      '.reply-batch-note{margin-top:7px;padding:7px 9px;border:1px solid #c7d2fe;border-radius:6px;background:#eef2ff;color:#3730a3;font-size:.76rem}';
    document.head.appendChild(style);
  }

  function credentialModal(reason) {
    return new Promise(function (resolve, reject) {
      var old = document.getElementById('soilCredentialModal');
      if (old) old.remove();

      var modal = document.createElement('div');
      modal.id = 'soilCredentialModal';
      modal.className = 'cred-mask show';
      modal.innerHTML =
        '<div class="cred-card"><h3>更新GitHub上传凭证</h3><p>' + esc(reason || badCredentialMessage()) + '</p>' +
        '<label>管理员密码<input id="credPass" type="password" autocomplete="off"></label>' +
        '<label>新的Fine-grained PAT<input id="credToken" type="password" autocomplete="off" placeholder="github_pat_…"></label>' +
        '<label class="remember"><input id="credRemember" type="checkbox">仅在当前浏览器会话中临时覆盖</label>' +
        '<p id="credStorageHint">项目已内置默认Token；此处只用于管理员临时更换凭证。</p>' +
        '<div id="credStatus" class="cred-status"></div><div class="cred-actions">' +
        '<button id="credCancel" type="button">取消</button><button id="credSave" class="cred-save" type="button">校验并保存</button>' +
        '</div></div>';
      document.body.appendChild(modal);

      var status = modal.querySelector('#credStatus');
      var save = modal.querySelector('#credSave');
      modal.querySelector('#credCancel').onclick = function () {
        modal.remove();
        reject(new Error('已取消设置上传凭证。'));
      };
      save.onclick = function () {
        var password = modal.querySelector('#credPass').value;
        var token = modal.querySelector('#credToken').value.trim();
        if (password !== '478666') {
          status.textContent = '管理员密码错误。';
          return;
        }
        if (!token) {
          status.textContent = '请输入新的GitHub Token。';
          return;
        }
        save.disabled = true;
        status.textContent = '正在校验凭证……';
        checkToken(token).then(function () {
          activateToken(token, false);
          validated = token;
          validatedAt = Date.now();
          status.textContent = '凭证有效，已在当前会话中启用。';
          setTimeout(function () {
            modal.remove();
            resolve(token);
          }, 300);
        }).catch(function (error) {
          resetToDefaultToken();
          save.disabled = false;
          status.textContent = error.message;
        });
      };
    });
  }

  function ensureAdminToken(forceDialog) {
    if (validating) return validating;
    var token = forceDialog ? '' : (String(window.SOIL_GITHUB_UPLOAD_TOKEN || '').trim() || storedToken());
    if (!forceDialog && token && token === validated && Date.now() - validatedAt < 300000) {
      return Promise.resolve(token);
    }

    validating = (token ? checkToken(token).then(function () {
      activateToken(token, false);
      validated = token;
      validatedAt = Date.now();
      return token;
    }).catch(function () {
      resetToDefaultToken();
      return credentialModal(badCredentialMessage());
    }) : credentialModal('尚未配置有效的GitHub上传凭证。')).finally(function () {
      validating = null;
    });
    return validating;
  }

  window.openSoilCredentialDialog = function () {
    return ensureAdminToken(true);
  };

  function addCredentialButton() {
    var modal = document.getElementById('soilAdminImport');
    if (!modal || modal.querySelector('.credential-tools')) return;
    var heading = modal.querySelector('.adm-head');
    if (!heading) return;
    var tools = document.createElement('div');
    tools.className = 'credential-tools';
    tools.innerHTML = '<button type="button">更新GitHub上传凭证</button>';
    heading.insertAdjacentElement('afterend', tools);
    tools.querySelector('button').onclick = function () {
      ensureAdminToken(true).catch(function () {});
    };
  }

  function interceptAdminImport(event) {
    var button = event.target && event.target.closest && event.target.closest('#adm-ok');
    if (!button || button.dataset.authReady === '1') return;
    var password = document.getElementById('adm-pass');
    if (password && password.value !== '478666') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    ensureAdminToken(false).then(function () {
      button.dataset.authReady = '1';
      button.click();
      setTimeout(function () { delete button.dataset.authReady; }, 0);
    }).catch(function (error) {
      if (window.SoilAdminImport) SoilAdminImport.progress(error.message, 0, true);
    });
  }

  function wrapRepositoryRequests() {
    var admin = window.SoilRepoAdmin;
    if (!admin || admin.__authWrapped || typeof admin.req !== 'function') return;
    admin.__authWrapped = true;
    var original = admin.req;
    admin.req = function (path, options) {
      return original.call(admin, path, options).catch(function (error) {
        if (error && (error.status === 401 || /Bad credentials/i.test(error.message || ''))) {
          resetToDefaultToken();
          throw new Error(badCredentialMessage());
        }
        throw error;
      });
    };
  }

  function normalized(value) {
    var workflow = core();
    return workflow ? workflow.canonical(value) : String(value || '').replace(/[\u200B-\u200D\uFEFF\s]/g, '').replace(/[（(]市级[）)]/g, '');
  }

  function same(left, right) {
    return normalized(left) === normalized(right);
  }

  function unique(values) {
    var seen = {};
    return (values || []).filter(function (value) {
      value = String(value || '').trim();
      var key = normalized(value);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function batches(dataKey, city, unit, district) {
    var result = [];
    var cities = (window.tabData && tabData[dataKey]) || [];
    cities.forEach(function (cityData) {
      if (!same(cityData.name, city)) return;
      (cityData.units || []).forEach(function (unitData) {
        if (!same(unitData.name, unit)) return;
        (unitData.districts || []).forEach(function (districtData) {
          if (!same(districtData.label, district)) return;
          (districtData.docs || []).forEach(function (doc) {
            if (doc.batch) result.push(doc.batch);
          });
        });
      });
    });

    var quality = window.SoilAdminImport;
    var index = quality && quality.state && Array.isArray(quality.state.index) ? quality.state.index : [];
    index.forEach(function (entry) {
      if (entry.kind === 'quality-control' && entry.dataKey === dataKey &&
          same(entry.city, city) && same(entry.unit, unit) && same(entry.district, district) && entry.batch) {
        result.push(entry.batch);
      }
    });
    return unique(result);
  }

  function replyKey(city, unit, district, batch) {
    var workflow = core();
    if (workflow) return workflow.replyKey(city, unit, district, batch);
    var base = [city, unit, district].map(normalized).join('_');
    return batch ? base + '_批次-' + normalized(batch) : base;
  }

  function applyReplyFiles(files) {
    var workflow = core();
    var index = workflow ? workflow.buildIndex(files) : {};
    window.replyIndex = index;
    if (window.refreshAllTabs) refreshAllTabs();
    return index;
  }

  function filesFromTree(tree) {
    return (tree || []).filter(function (entry) {
      return entry && entry.type === 'blob' && String(entry.path || '').indexOf('replies/') === 0;
    }).map(function (entry) {
      return String(entry.path || '').slice('replies/'.length);
    });
  }

  function loadReplies(force) {
    var admin = window.SoilRepoAdmin;
    if (admin && typeof admin.loadTree === 'function') {
      if (force) admin.tree = null;
      return admin.loadTree(!!force).then(function (tree) {
        return applyReplyFiles(filesFromTree(tree));
      }).catch(function (error) {
        console.error('整改答复索引加载失败：', error);
        return applyReplyFiles([]);
      });
    }

    return fetch('./data/repository-tree.json?v=' + encodeURIComponent(String(window.SOIL_RELEASE_VERSION || window.SOIL_APP_VERSION || '')), {
      cache: force ? 'no-store' : 'default',
      credentials: 'same-origin'
    }).then(function (response) {
      if (!response.ok) throw new Error('静态目录清单 HTTP ' + response.status);
      return response.json();
    }).then(function (payload) {
      var tree = Array.isArray(payload) ? payload : payload && payload.tree;
      return applyReplyFiles(filesFromTree(tree));
    }).catch(function (error) {
      console.error('整改答复索引加载失败：', error);
      return applyReplyFiles([]);
    });
  }

  window.reloadReplyIndex = function () {
    return loadReplies(true);
  };

  function replyHref(file) {
    return './replies/' + String(file || '').split('/').map(encodeURIComponent).join('/');
  }

  function filenameBase(city, unit, district) {
    return [city, unit, district].map(function (value) {
      return String(value || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    }).join('_');
  }

  function installBatchRender() {
    if (typeof window.renderCities !== 'function' || window.renderCities.__batch) return;
    var originalRenderCities = window.renderCities;
    window.renderCities = function (cities, dataKey) {
      renderKey = dataKey;
      var html = originalRenderCities.apply(this, arguments);
      renderKey = '';
      return html;
    };
    window.renderCities.__batch = true;
    window.getReplyKey = replyKey;

    window.renderReplyCell = function (city, unit, district) {
      var active = ((document.querySelector('.tab.active') || {}).dataset || {}).tab;
      var dataKey = renderKey || active;
      var batchList = batches(dataKey, city, unit, district);
      var base = filenameBase(city, unit, district);
      var legacy = window.replyIndex && replyIndex[replyKey(city, unit, district, '')];
      var html = '';

      batchList.forEach(function (batch) {
        var reply = window.replyIndex && replyIndex[replyKey(city, unit, district, batch)];
        html += '<div class="reply-batch-line"><span class="reply-batch-tag">' + esc(batch) + '</span>';
        if (reply) {
          html += '<a class="reply-view-btn" href="' + esc(replyHref(reply.file)) + '" target="_blank" rel="noopener noreferrer">查看</a>' +
            '<span class="replace-btn" data-key="' + esc(base) + '" data-data-key="' + esc(dataKey) + '" data-batch="' + esc(batch) + '"' +
            ' data-city="' + esc(city) + '" data-unit="' + esc(unit) + '" data-district="' + esc(district) + '">替换</span>';
        } else {
          html += '<span class="upload-btn" data-key="' + esc(base) + '" data-data-key="' + esc(dataKey) + '" data-batch="' + esc(batch) + '"' +
            ' data-city="' + esc(city) + '" data-unit="' + esc(unit) + '" data-district="' + esc(district) + '">上传答复</span>';
        }
        html += '</div>';
      });

      if (legacy) {
        html += '<div class="reply-batch-line"><span class="reply-batch-tag">历史未标批次</span>' +
          '<a class="reply-view-btn" href="' + esc(replyHref(legacy.file)) + '" target="_blank" rel="noopener noreferrer">查看</a></div>';
      }
      return html || '<span style="font-size:.72rem;color:#b45309">暂无对应质控批次</span>';
    };

    if (window.refreshAllTabs) refreshAllTabs();
    loadReplies(false);
  }

  function patchUploadModal() {
    if (typeof window.openUploadModal !== 'function' || window.openUploadModal.__batch) return;
    var original = window.openUploadModal;
    window.openUploadModal = function (element) {
      original(element);
      if (!window.currentUpload) return;
      currentUpload.batch = element.getAttribute('data-batch') || '';
      currentUpload.dataKey = element.getAttribute('data-data-key') || ((document.querySelector('.tab.active') || {}).dataset || {}).tab;
      var info = document.getElementById('uploadInfo');
      if (info) {
        info.innerHTML += '<div class="reply-batch-note"><strong>对应质控批次：</strong>' + esc(currentUpload.batch) +
          '<br>整改答复将与该批次质控意见一一对应。上传答复不需要管理员密码。</div>';
      }
    };
    window.openUploadModal.__batch = true;
  }

  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var output = '';
    var step = 32768;
    for (var index = 0; index < bytes.length; index += step) {
      output += String.fromCharCode.apply(null, bytes.subarray(index, Math.min(index + step, bytes.length)));
    }
    return btoa(output);
  }

  function safe(value) {
    return String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  }

  function timestamp() {
    var date = new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
      pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
  }

  function getReplyUploadToken() {
    return String(window.SOIL_GITHUB_UPLOAD_TOKEN || defaultToken() || storedToken()).trim();
  }

  function updateSuccessProgress(progress, fileSize) {
    if (typeof window.updateUploadProgress === 'function') {
      updateUploadProgress(progress, 100, fileSize, 'success');
    }
    if (progress && progress.querySelector) {
      var detail = progress.querySelector('.upload-progress-detail,#upload-progress-detail');
      if (detail) detail.textContent = SUCCESS_NOTICE;
    }
  }

  function patchReplySubmit() {
    if (typeof window.confirmUploadFile !== 'function' || window.confirmUploadFile.__batch) return;

    window.confirmUploadFile = function () {
      if (!window.selectedFile || !window.currentUpload) return;
      var file = selectedFile;
      var current = currentUpload;
      var batch = current.batch;
      if (!batch) {
        showToast('未找到对应质控批次，不能上传整改答复。', true);
        return;
      }

      var token = getReplyUploadToken();
      if (!token) {
        showToast('未配置GitHub上传凭证。', true);
        return;
      }

      var extension = (file.name.split('.').pop() || 'bin').toLowerCase();
      var time = timestamp();
      var base = filenameBase(current.city, current.unit, current.district);
      var name = base + '_批次-' + safe(batch) + '_整改答复_' + time + '.' + extension;
      var lookupKey = replyKey(current.city, current.unit, current.district, batch);
      var progress;

      closeUploadModal();
      progress = showUploadProgress(base, current.district + ' · ' + batch, file);

      file.arrayBuffer().then(function (buffer) {
        var url = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/replies/' + encodeURIComponent(name);
        return fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: '整改答复：' + batch,
            content: toBase64(buffer),
            branch: 'main'
          })
        });
      }).then(function (response) {
        return response.text().then(function (text) {
          var data = {};
          try { data = text ? JSON.parse(text) : {}; } catch (error) {}
          if (!response.ok) {
            if (response.status === 401) resetToDefaultToken();
            throw new Error(data.message || ('GitHub返回HTTP ' + response.status));
          }
          return data;
        });
      }).then(function () {
        window.replyIndex = window.replyIndex || {};
        replyIndex[lookupKey] = {file: name, time: time, batch: batch, legacy: false};
        updateSuccessProgress(progress, file.size);
        showToast(SUCCESS_NOTICE);
        if (window.refreshAllTabs) refreshAllTabs();

        var admin = window.SoilRepoAdmin;
        if (admin) admin.tree = null;
        setTimeout(function () {
          loadReplies(true).catch(function () {});
        }, 800);
      }).catch(function (error) {
        failUpload(progress, file, error.message);
      });
    };
    window.confirmUploadFile.__batch = true;
  }

  function patchAvailableFunctions() {
    addCredentialButton();
    wrapRepositoryRequests();
    installBatchRender();
    patchUploadModal();
    patchReplySubmit();
  }

  function install() {
    installStyles();
    activateToken(storedToken(), false);
    patchAvailableFunctions();

    if (!document.documentElement.__soilReplyObserver) {
      document.documentElement.__soilReplyObserver = true;
      var observer = new MutationObserver(patchAvailableFunctions);
      observer.observe(document.body, {childList: true, subtree: true});
    }
  }

  document.addEventListener('click', interceptAdminImport, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(patchAvailableFunctions, 900);
  setTimeout(patchAvailableFunctions, 1800);
})();
