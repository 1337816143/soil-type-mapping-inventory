'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const statusSource = fs.readFileSync('admin-upload-transport-fix.js', 'utf8');
const noticeSource = fs.readFileSync('upload-success-notice.js', 'utf8');

const observers = [];
const button = {dataset:{}};
const textNode = {textContent:''};
const bar = {style:{}};
const box = {classList:{toggle(){}}};
const body = {};
const root = {};

const documentStub = {
  readyState:'complete',
  body,
  documentElement:root,
  getElementById(id) {
    if (id === 'adm-ok') return button;
    if (id === 'adm-text') return textNode;
    if (id === 'adm-bar') return bar;
    if (id === 'adm-prog') return box;
    return null;
  },
  querySelectorAll(){ return []; }
};

function MutationObserver(callback) {
  this.callback = callback;
  observers.push(this);
}
MutationObserver.prototype.observe = function () {};

const admin = {
  progress(text, percent) {
    textNode.textContent = String(text || '');
    bar.style.width = String(percent || 0) + '%';
  }
};

const context = {
  console,
  window:null,
  document:documentStub,
  MutationObserver,
  SoilAdminImport:admin,
  setTimeout(){ return 0; },
  setInterval(){ return 1; },
  clearInterval(){},
  Array,
  Math,
  Number,
  String
};
context.window = context;
vm.createContext(context);
vm.runInContext(statusSource, context, {filename:'admin-upload-transport-fix.js'});
vm.runInContext(noticeSource, context, {filename:'upload-success-notice.js'});

const stable = admin.progress;
for (let round = 0; round < 200; round += 1) {
  observers.forEach((observer) => observer.callback([]));
  assert.strictEqual(admin.progress, stable, '观察器重复执行后 progress 被再次包裹');
}

assert.doesNotThrow(() => {
  for (let index = 0; index < 5000; index += 1) {
    admin.progress('正在整文件上传 1 / 1：测试文件', 25, true);
  }
}, '管理员进度包装器发生递归或调用栈溢出');

assert.strictEqual(button.dataset.authReady, '1', '管理员上传未跳过重复凭证弹窗');
console.log('admin progress wrapper recursion validation passed');
