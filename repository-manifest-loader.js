(function () {
  'use strict';

  var A = window.SoilRepoAdmin;
  if (!A || A.__staticManifestInstalled) return;
  A.__staticManifestInstalled = true;

  var originalLoadTree = A.loadTree;
  var manifestPath = './data/repository-tree.json';

  function applyTree(tree) {
    A.tree = Array.isArray(tree) ? tree : [];
    var directories = {};
    A.tree.forEach(function (entry) {
      var parts = String(entry && entry.path || '').split('/');
      if (entry && entry.type === 'tree') directories[entry.path] = true;
      for (var i = 1; i < parts.length; i++) {
        directories[parts.slice(0, i).join('/')] = true;
      }
    });
    A.dirs = Object.keys(directories).sort(function (left, right) {
      return left.localeCompare(right, 'zh-CN');
    });
    return A.tree;
  }

  function loadManifest(force) {
    var version = String(window.SOIL_RELEASE_VERSION || window.SOIL_APP_VERSION || '');
    var suffix = force ? ('&_=' + Date.now()) : '';
    return fetch(manifestPath + '?v=' + encodeURIComponent(version) + suffix, {
      cache: force ? 'no-store' : 'default',
      credentials: 'same-origin'
    }).then(function (response) {
      if (!response.ok) throw new Error('静态目录清单 HTTP ' + response.status);
      return response.json();
    }).then(function (payload) {
      var tree = Array.isArray(payload) ? payload : payload && payload.tree;
      if (!Array.isArray(tree)) throw new Error('静态目录清单格式错误');
      return applyTree(tree);
    });
  }

  function loadAuthenticatedApiTree() {
    return originalLoadTree.call(A, true).then(applyTree);
  }

  A.loadTree = function (force) {
    if (A.tree && !force) return Promise.resolve(A.tree);

    // 普通访客始终读取随 Pages 部署生成的同源静态清单，避免共享出口 IP
    // 消耗 GitHub 未认证 API 的每小时限额。管理员已设置 Token 且主动强制
    // 刷新时，才读取实时 GitHub Tree API；失败后仍回退到静态清单。
    if (force && String(window.SOIL_GITHUB_UPLOAD_TOKEN || '').trim()) {
      return loadAuthenticatedApiTree().catch(function () {
        return loadManifest(true);
      });
    }

    return loadManifest(!!force).catch(function (manifestError) {
      if (String(window.SOIL_GITHUB_UPLOAD_TOKEN || '').trim()) {
        return loadAuthenticatedApiTree();
      }
      throw new Error('静态目录清单读取失败，请等待 Pages 部署完成后刷新。' +
        (manifestError && manifestError.message ? '（' + manifestError.message + '）' : ''));
    });
  };

  A.refreshStaticManifest = function () {
    A.tree = null;
    return loadManifest(true);
  };
})();
