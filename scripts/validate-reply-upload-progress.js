'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('reply-upload-progress.js', 'utf8');
assert(source.includes("xhr.upload.addEventListener('progress'"), '整改答复上传未监听真实上传进度');
assert(source.includes("reader.onprogress"), '整改答复上传未显示本地文件读取进度');
assert(source.includes("setInterval(function ()"), '浏览器无法报告进度时缺少平滑兜底进度');
assert(source.includes("文件已发送，等待 GitHub 确认写入"), '上传完成前缺少服务端确认阶段');
assert(source.includes("window.confirmUploadFile.__replyProgressV2 = true"), '新进度实现未锁定，可能被旧补丁覆盖');
assert(!source.includes("document.getElementById('adm-pass')"), '整改答复上传不应检查管理员密码');

const progressEvents = [];
const toasts = [];
let refreshed = 0;
let reloaded = 0;
let sentBody = '';

const progressElement = {
  detail: {textContent: ''},
  querySelector() { return this.detail; }
};

function FakeFileReader() {}
FakeFileReader.prototype.readAsDataURL = function (file) {
  if (this.onloadstart) this.onloadstart();
  if (this.onprogress) this.onprogress({lengthComputable:true, loaded:file.size / 2, total:file.size});
  if (this.onload) this.onload({target:{result:'data:application/pdf;base64,QUJDRA=='}});
};

function FakeXHR() {
  this.uploadListeners = {};
  this.upload = {
    addEventListener: (name, handler) => { this.uploadListeners[name] = handler; }
  };
  this.readyState = 0;
  this.status = 201;
  this.responseText = '{}';
}
FakeXHR.prototype.open = function () {};
FakeXHR.prototype.setRequestHeader = function () {};
FakeXHR.prototype.send = function (body) {
  sentBody = body;
  if (this.uploadListeners.progress) this.uploadListeners.progress({lengthComputable:true, loaded:50, total:100});
  if (this.uploadListeners.load) this.uploadListeners.load();
  this.readyState = 2;
  if (this.onreadystatechange) this.onreadystatechange();
  this.readyState = 3;
  if (this.onreadystatechange) this.onreadystatechange();
  this.readyState = 4;
  if (this.onload) this.onload();
};

const context = {
  console,
  Promise,
  Date,
  JSON,
  Math,
  String,
  Number,
  Uint8Array,
  encodeURIComponent,
  FileReader: FakeFileReader,
  XMLHttpRequest: FakeXHR,
  setTimeout(fn) { fn(); return 1; },
  clearTimeout() {},
  setInterval() { return 1; },
  clearInterval() {},
  document: {readyState:'complete'},
  selectedFile: {name:'答复.pdf', size:1024 * 1024},
  currentUpload: {
    city:'沧州市',
    unit:'易景科技（天津）股份有限公司',
    district:'孟村回族自治县',
    batch:'第一批'
  },
  SOIL_GITHUB_UPLOAD_TOKEN:'test-token',
  SOIL_GITHUB_DEFAULT_UPLOAD_TOKEN:'test-token',
  replyIndex:{},
  closeUploadModal() {},
  showUploadProgress() { return progressElement; },
  updateUploadProgress(element, percent, size, status) {
    progressEvents.push({percent, size, status, detail:element.detail.textContent});
  },
  showToast(message, isError) { toasts.push({message, isError}); },
  refreshAllTabs() { refreshed += 1; },
  reloadReplyIndex() { reloaded += 1; return Promise.resolve(); },
  getReplyKey(city, unit, district, batch) { return [city, unit, district, batch].join('|'); },
  removeUploadProgress() {},
  SoilRepoAdmin:{tree:[]},
  confirmUploadFile() {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, {filename:'reply-upload-progress.js'});
context.confirmUploadFile();

assert(sentBody.includes('整改答复：第一批'), '上传请求体未包含批次提交信息');
assert(progressEvents.some((event) => event.percent > 0 && event.percent < 15), '未记录文件读取阶段进度');
assert(progressEvents.some((event) => event.percent >= 50 && event.percent < 96), '未记录网络上传阶段进度');
assert(progressEvents.some((event) => event.percent >= 96 && event.percent < 100), '未记录 GitHub 确认阶段进度');
assert(progressEvents.some((event) => event.percent === 100 && event.status === 'success'), '未记录100%成功状态');
assert(toasts.some((item) => item.message.includes('稍等3~5分钟刷新网站')), '成功提示缺少3~5分钟说明');
assert(refreshed >= 1, '上传成功后没有刷新原位置按钮');
assert(reloaded >= 1, '上传成功后没有重新加载仓库答复索引');
assert(Object.keys(context.replyIndex).length === 1, '上传成功后没有立即写入答复索引');

console.log('reply upload progress validation passed');
