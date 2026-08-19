'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('reference-import-mode.js', 'utf8');

assert(!source.includes('new MutationObserver'), '参考资料上传模式不得使用长期 MutationObserver，避免上传时DOM自激振荡');
assert(source.includes("Q.state.context.kind === 'reference'"), '参考资料入口上下文保护缺失');
assert(source.includes('function forceReferenceItem'), '参考资料文件元数据锁定缺失');
assert(source.includes('function patchClassifier'), '参考资料上传未覆盖混合上传读取的分类器出口');
assert(source.includes("document.addEventListener('click', guardSubmit, true)"), '参考资料上传前缺少捕获阶段保护');
assert(source.includes("document.addEventListener('change', guardReferenceKind, true)"), '参考资料导入类型缺少捕获阶段保护');
assert(source.includes('.reference-import-mode .auto-import-summary{display:none!important}'), '参考资料模式仍会显示质控自动识别摘要');

const kind = {
  value: 'reference',
  onchange() { this.modeCalls = (this.modeCalls || 0) + 1; }
};
const modal = {
  classList:{toggle(){}},
  querySelector(){ return null; },
  querySelectorAll(){ return []; }
};
const state = {
  context:{kind:'reference'},
  files:[{path:'某质控手册.pdf',sourcePath:'某质控手册.pdf',batch:'第一批',city:'测试市',unit:'测试单位',district:'测试县',autoMeta:{kind:'quality',dataKeys:['farmland']}}]
};
const classifier = {
  classifyItem(){ return {kind:'quality',dataKeys:['farmland'],batch:'第一批',targets:[],associations:[],unresolvedTargets:[]}; },
  applyItemMetadata(item){ item.autoMeta = this.classifyItem(item); return item.autoMeta; },
  selectionMetadata(files){ return {kind:'quality',metas:files.map((item) => this.applyItemMetadata(item)),unresolved:1,batch:'第一批'}; },
  refresh(){ return this.selectionMetadata(state.files); }
};
const q = {
  state,
  normalizePreparedFiles(files){ state.files = files; return files; },
  acceptSplitFiles(files){ state.files = files; return files; },
  open(context){ state.context = context; return modal; }
};
const listeners = {};
const documentStub = {
  readyState:'complete',
  head:{appendChild(){}},
  body:{},
  createElement(tag){
    if (tag === 'style') return {id:'',textContent:''};
    return {className:'',innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];}};
  },
  getElementById(id){
    if (id === 'soilAdminImport') return modal;
    if (id === 'adm-kind') return kind;
    if (id === 'adm-list') return null;
    return null;
  },
  addEventListener(type, handler, capture){
    if (capture) listeners[type] = handler;
  }
};
const context = {
  window:{SoilRepoAdmin:{},SoilAdminImport:q,SoilAdminAutoClassifier:classifier},
  document:documentStub,
  console,
  setTimeout(fn){ fn(); return 0; },
  Array,
  String
};
context.window.window = context.window;
vm.runInNewContext(source, context, {filename:'reference-import-mode.js'});

q.open({kind:'reference'});
kind.value = 'quality';
listeners.change({target:{id:'adm-kind'}});
assert.strictEqual(kind.value, 'reference', '自动分类器尝试改成质控意见时未在同一事件内恢复参考资料');

const selected = classifier.selectionMetadata(state.files);
assert.strictEqual(selected.kind, 'reference', '混合上传仍会把参考资料重新识别成质控意见');
assert.strictEqual(selected.unresolved, 0, '参考资料不应要求成果/批次/任务单元人工检查');
assert.strictEqual(selected.metas[0].kind, 'reference', '参考资料文件元数据未锁定');

const uploadButton = {closest(selector){ return selector === '#adm-ok' ? this : null; }};
listeners.click({target:uploadButton});
assert.strictEqual(kind.value, 'reference', '点击开始上传前导入类型未保持参考资料');
assert.strictEqual(state.files[0].batch, '', '参考资料仍携带质控批次元数据');
assert.strictEqual(state.files[0].city, '', '参考资料仍携带质控城市元数据');
assert.strictEqual(state.files[0].autoMeta.kind, 'reference', '点击上传前参考资料元数据又被改回质控');

console.log('reference upload stability validation passed: no DOM observer loop, explicit reference kind wins before hybrid upload');
