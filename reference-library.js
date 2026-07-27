(function () {
  'use strict';

  var A = window.SoilRepoAdmin = window.SoilRepoAdmin || {};
  A.owner = '1337816143';
  A.repo = 'soil-type-mapping-inventory';
  A.branch = 'main';
  A.referenceRoot = 'reference-files/third-soil-survey';
  A.indexPath = 'data/admin-import-index.json';
  A.rawBase = 'https://raw.githubusercontent.com/' + A.owner + '/' + A.repo + '/' + A.branch + '/';
  A.tree = null;
  A.dirs = [];

  var PAGE_TITLE = '三普成果编制及质控参考资料';
  var CATEGORY_ORDER = [
    '土壤类型图',
    '土壤属性图',
    '耕地质量等级评价',
    '土壤退化与障碍分析',
    '土特产品适宜性评价',
    '土壤农业利用适宜性评价',
    '土地资源评价与利用报告'
  ];

  window.SoilReferenceLibraryConfig = {
    title: PAGE_TITLE,
    categories: CATEGORY_ORDER.slice()
  };

  A.esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  A.clean = function (path) {
    var output = [];
    String(path || '').replace(/\\/g, '/').split('/').forEach(function (part) {
      part = part.trim();
      if (!part || part === '.') return;
      if (part === '..') throw new Error('目录中不能包含“..”');
      output.push(part.replace(/[\u0000-\u001f:*?"<>|]/g, '_'));
    });
    return output.join('/');
  };

  A.base = function (path) {
    path = String(path || '');
    return path.slice(path.lastIndexOf('/') + 1);
  };

  A.dir = function (path) {
    path = String(path || '');
    var index = path.lastIndexOf('/');
    return index < 0 ? '' : path.slice(0, index);
  };

  A.raw = function (path) {
    return A.rawBase + String(path || '').split('/').map(encodeURIComponent).join('/');
  };

  A.size = function (bytes) {
    return bytes < 1024 ? bytes + ' B' :
      bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' :
      (bytes / 1048576).toFixed(bytes >= 10485760 ? 1 : 2) + ' MB';
  };

  A.req = function (path, options) {
    options = options || {};
    var headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (window.SOIL_GITHUB_UPLOAD_TOKEN) headers.Authorization = 'Bearer ' + window.SOIL_GITHUB_UPLOAD_TOKEN;
    if (options.body) headers['Content-Type'] = 'application/json';
    options.headers = Object.assign(headers, options.headers || {});
    return fetch('https://api.github.com/repos/' + A.owner + '/' + A.repo + path, options).then(function (response) {
      return response.text().then(function (text) {
        var data = text ? JSON.parse(text) : {};
        if (!response.ok) {
          var error = new Error(data.message || ('GitHub API ' + response.status));
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  };

  A.loadTree = function (force) {
    if (A.tree && !force) return Promise.resolve(A.tree);
    return A.req('/git/trees/' + encodeURIComponent(A.branch) + '?recursive=1').then(function (data) {
      A.tree = data.tree || [];
      var directories = {};
      A.tree.forEach(function (entry) {
        var parts = (entry.path || '').split('/');
        if (entry.type === 'tree') directories[entry.path] = true;
        for (var i = 1; i < parts.length; i++) directories[parts.slice(0, i).join('/')] = true;
      });
      A.dirs = Object.keys(directories).sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
      return A.tree;
    });
  };

  function css() {
    if (document.getElementById('ref-style')) return;
    var style = document.createElement('style');
    style.id = 'ref-style';
    style.textContent =
      '.ref-wrap{display:flex;flex-direction:column;gap:13px}' +
      '.ref-page-title{margin:0;padding:2px 1px 0;font-size:1.08rem;line-height:1.35;font-weight:800;color:var(--text,#172033);text-align:left}' +
      '.ref-tools{display:flex;gap:9px;flex-wrap:wrap;align-items:center;padding:12px;background:var(--bg2);border:1px solid var(--rule);border-radius:10px}' +
      '.ref-search{flex:1 1 330px;min-width:220px;padding:8px 11px;border:1px solid var(--rule);border-radius:7px;font:inherit}' +
      '.ref-btn{display:inline-flex;align-items:center;justify-content:center;padding:6px 11px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-size:.78rem;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap}' +
      '.ref-btn.alt{background:#fff;color:var(--accent)}' +
      '.ref-note{flex:1 1 100%;font-size:.76rem;color:var(--muted)}' +
      '.ref-cat{border:1px solid var(--rule);border-radius:9px;overflow:hidden;background:#fff}' +
      '.ref-cat summary{display:flex;gap:10px;align-items:center;padding:11px 14px;background:var(--bg2);font-weight:700;cursor:pointer;list-style:none}' +
      '.ref-cat summary::-webkit-details-marker{display:none}' +
      '.ref-count{margin-left:auto;padding:2px 8px;border-radius:99px;background:#dbeafe;color:var(--accent);font-size:.71rem}' +
      '.ref-file{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 14px;border-top:1px solid var(--rule)}' +
      '.ref-name{font-size:.83rem;font-weight:600;overflow-wrap:anywhere}' +
      '.ref-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;color:var(--muted);font-size:.7rem}' +
      '.ref-empty{padding:18px;text-align:center;color:var(--muted);font-size:.82rem}' +
      '.ref-cat>.ref-empty{border-top:1px solid var(--rule);background:#fff}' +
      '@media(max-width:760px){.ref-file{grid-template-columns:1fr}.ref-btn{flex:1 1 auto}.ref-page-title{font-size:1rem}}';
    document.head.appendChild(style);
  }

  function hideCollectionBanner() {
    var banner = document.getElementById('missingBanner');
    if (banner) banner.style.display = 'none';
  }

  function installTab() {
    var tabs = document.querySelector('header .tabs');
    var container = document.querySelector('body > .container');
    if (!tabs || !container) return;

    var tab = tabs.querySelector('[data-tab="references"]');
    if (!tab) {
      tab = document.createElement('div');
      tab.className = 'tab';
      tab.dataset.tab = 'references';
      tab.textContent = '参考文件';
      tabs.appendChild(tab);
    }

    var panel = document.getElementById('tab-references');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'tab-references';
      panel.className = 'tab-content';
      panel.innerHTML = '<div class="content" id="ref-root"><div class="ref-empty">正在读取参考资料目录……</div></div>';
      container.appendChild(panel);
    }

    if (!tab.dataset.bound) {
      tab.dataset.bound = '1';
      tab.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        document.querySelectorAll('.tab,.tab-content').forEach(function (entry) { entry.classList.remove('active'); });
        tab.classList.add('active');
        panel.classList.add('active');
        hideCollectionBanner();
        render(false);
      });
    }
  }

  function isWrapperFolder(name) {
    var compact = String(name || '').replace(/[\s_\-—]+/g, '');
    return /^三普成果编制及(?:质控|质量控制)(?:主要)?参考资料$/.test(compact);
  }

  function normalizeCategory(name) {
    var raw = String(name || '').trim();
    var compact = raw.replace(/[\s_\-—·｜|/]+/g, '');

    if (compact.indexOf('土壤类型图') >= 0) return '土壤类型图';
    if (compact.indexOf('土壤属性图') >= 0) return '土壤属性图';
    if (compact.indexOf('耕地质量等级评价') >= 0 || compact.indexOf('耕地质量评价') >= 0) return '耕地质量等级评价';
    if (compact.indexOf('土壤退化与障碍分析') >= 0) return '土壤退化与障碍分析';
    if (compact.indexOf('土特产品适宜性评价') >= 0) return '土特产品适宜性评价';
    if (compact.indexOf('土壤农业利用适宜性评价') >= 0) return '土壤农业利用适宜性评价';
    if (compact.indexOf('土地资源评价与利用报告') >= 0) return '土地资源评价与利用报告';

    raw = raw.replace(/[\s_\-—·｜|/]*三普成果编制及(?:质控|质量控制)(?:主要)?参考资料[\s_\-—·｜|/]*/g, '').trim();
    return raw || '其他资料';
  }

  function relativeParts(path) {
    var relative = String(path || '').slice(A.referenceRoot.length + 1);
    var parts = relative.split('/').filter(Boolean);
    while (parts.length && isWrapperFolder(parts[0])) parts.shift();
    return parts;
  }

  function category(path) {
    var parts = relativeParts(path);
    return parts.length > 1 ? normalizeCategory(parts[0]) : '其他资料';
  }

  function rel(path) {
    return relativeParts(path).join('/');
  }

  function orderedCategories(groups) {
    var extras = Object.keys(groups).filter(function (name) {
      return CATEGORY_ORDER.indexOf(name) < 0;
    }).sort(function (a, b) {
      return a.localeCompare(b, 'zh-CN');
    });
    return CATEGORY_ORDER.concat(extras);
  }

  function render(force) {
    hideCollectionBanner();
    var root = document.getElementById('ref-root');
    if (!root) return;
    root.innerHTML = '<div class="ref-empty">正在读取参考资料目录……</div>';

    A.loadTree(force).then(function (tree) {
      var groups = {};
      CATEGORY_ORDER.forEach(function (name) { groups[name] = []; });

      tree.filter(function (entry) {
        return entry.type === 'blob' &&
          entry.path.indexOf(A.referenceRoot + '/') === 0 &&
          !/(^|\/)(README\.md|manifest\.json|archive\.json)$/i.test(entry.path) &&
          !/(^|\/)~\$/.test(entry.path);
      }).forEach(function (entry) {
        var name = category(entry.path);
        (groups[name] || (groups[name] = [])).push(entry);
      });

      var categories = orderedCategories(groups);
      var count = categories.reduce(function (sum, name) { return sum + groups[name].length; }, 0);
      var html = '<div class="ref-wrap">' +
        '<h2 class="ref-page-title">' + A.esc(PAGE_TITLE) + '</h2>' +
        '<div class="ref-tools"><input id="ref-search" class="ref-search" type="search" placeholder="搜索文件名、目录或成果类别">' +
        '<button id="ref-admin" class="ref-btn">管理员导入</button>' +
        '<button id="ref-refresh" class="ref-btn alt">刷新目录</button>' +
        '<div class="ref-note">仓库内共 ' + count + ' 个参考文件，保持原目录层级，点击可直接下载。</div></div>';

      categories.forEach(function (name, index) {
        var files = groups[name];
        files.sort(function (a, b) { return a.path.localeCompare(b.path, 'zh-CN'); });
        html += '<details class="ref-cat" data-category="' + A.esc(name.toLowerCase()) + '" ' + (index < 3 ? 'open' : '') + '>' +
          '<summary><span>' + A.esc(name) + '</span><span class="ref-count">' + files.length + ' 个文件</span></summary>';

        if (!files.length) {
          html += '<div class="ref-empty">暂无参考文件</div>';
        } else {
          files.forEach(function (file) {
            var filename = A.base(file.path);
            var relative = rel(file.path);
            var searchable = (name + ' ' + filename + ' ' + relative).toLowerCase();
            html += '<div class="ref-file" data-q="' + A.esc(searchable) + '"><div><div class="ref-name">' +
              A.esc(filename) + '</div><div class="ref-meta"><span>' +
              A.esc((filename.split('.').pop() || 'FILE').toUpperCase()) + '</span><span>' + A.size(file.size) +
              '</span><span>' + A.esc(relative) + '</span></div></div><a class="ref-btn alt" target="_blank" rel="noopener" href="' +
              A.esc(A.raw(file.path)) + '">下载</a></div>';
          });
        }
        html += '</details>';
      });

      html += '</div>';
      root.innerHTML = html;

      document.getElementById('ref-search').addEventListener('input', function () {
        var query = this.value.trim().toLowerCase();
        root.querySelectorAll('.ref-cat').forEach(function (group) {
          var categoryMatch = !query || group.dataset.category.indexOf(query) >= 0;
          var visibleFile = false;
          group.querySelectorAll('.ref-file').forEach(function (file) {
            var visible = !query || categoryMatch || file.dataset.q.indexOf(query) >= 0;
            file.style.display = visible ? '' : 'none';
            if (visible) visibleFile = true;
          });
          var isEmpty = !group.querySelector('.ref-file');
          var visibleGroup = !query || categoryMatch || visibleFile;
          group.style.display = visibleGroup ? '' : 'none';
          if (query && visibleGroup && !isEmpty) group.open = true;
        });
      });

      document.getElementById('ref-refresh').onclick = function () { render(true); };
      document.getElementById('ref-admin').onclick = function () {
        window.openSoilAdminImport({kind: 'reference', suggestedDirectory: A.referenceRoot});
      };
    }).catch(function (error) {
      root.innerHTML = '<div class="ref-empty">目录加载失败：' + A.esc(error.message) + '</div>';
    });
  }

  function load(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function init() {
    css();
    installTab();
    load('./admin-import.js').catch(function () { console.error('管理员导入脚本加载失败'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
