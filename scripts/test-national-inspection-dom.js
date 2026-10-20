'use strict';
/* Dependency-free DOM behavior simulation, not a browser rendering or geometry test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Events {
  constructor() { this.listeners = {}; }
  addEventListener(type, fn, options) { (this.listeners[type] ||= []).push({fn, capture:options === true || !!(options && options.capture)}); }
  dispatchEvent(event) {
    event.target ||= this; event.defaultPrevented = false;
    event.preventDefault = () => { event.defaultPrevented = true; };
    event.stopPropagation = () => { event.stopped = true; };
    event.stopImmediatePropagation = () => { event.stopped = true; event.immediate = true; };
    const path = []; for (let n = this; n; n = n.parentNode) path.push(n);
    const run = (node, capture) => { for (const l of (node.listeners[event.type] || [])) if (l.capture === capture) { l.fn.call(node,event); if (event.immediate) break; } };
    for (const node of path.slice().reverse()) { run(node,true); if (event.stopped) return !event.defaultPrevented; }
    for (const node of path) { run(node,false); if (event.stopped) break; }
    return !event.defaultPrevented;
  }
}
function simpleMatch(node, selector) {
  const tag = selector.match(/^[A-Za-z][\w-]*/);
  if (tag && node.tagName !== tag[0].toUpperCase()) return false;
  const id = selector.match(/#([\w-]+)/); if (id && node.id !== id[1]) return false;
  for (const cls of selector.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(cls[1])) return false;
  for (const attr of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    const value = node.getAttribute(attr[1]); if (value == null || (attr[2] != null && value !== attr[2])) return false;
  }
  return true;
}
function matches(node, selector) {
  const parts = selector.trim().split(/\s+/); let i = parts.length - 1;
  if (!simpleMatch(node,parts[i--])) return false;
  let parent = node.parentNode;
  while (i >= 0) {
    if (parts[i] === '>') { i--; if (!parent || !simpleMatch(parent,parts[i--])) return false; parent = parent.parentNode; }
    else { while (parent && !simpleMatch(parent,parts[i])) parent = parent.parentNode; if (!parent) return false; parent = parent.parentNode; i--; }
  }
  return true;
}
class Element extends Events {
  constructor(tag, owner) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = owner; this.children = []; this.attributes = {}; this.dataset = {}; this.style = {}; this.className = ''; this.id = ''; this.value = ''; this._text = ''; this.disabled = false; this.scrollLeft = 0; this.clientWidth = 900; this.scrollWidth = 1200;
    this.classList = {contains:n => this.className.split(/\s+/).includes(n), add:(...ns) => { this.className = [...new Set(this.className.split(/\s+/).filter(Boolean).concat(ns))].join(' '); }, remove:(...ns) => { this.className = this.className.split(/\s+/).filter(n=>!ns.includes(n)).join(' '); }, toggle:(n,force) => { const yes = force == null ? !this.classList.contains(n) : force; if (yes) this.classList.add(n); else this.classList.remove(n); return yes; }};
  }
  appendChild(node) { if (node.parentNode) node.remove(); this.children.push(node); node.parentNode = this; return node; }
  append(...nodes) { nodes.forEach(n=>this.appendChild(n)); }
  insertBefore(node, before) { if (!before) return this.appendChild(node); if (node.parentNode) node.remove(); const i = this.children.indexOf(before); assert(i>=0); this.children.splice(i,0,node); node.parentNode = this; return node; }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this),1); this.parentNode = null; }
  replaceChildren(...nodes) { this.children.slice().forEach(n=>n.remove()); this._text = ''; this.append(...nodes); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(n=>n.textContent).join(''); }
  set innerHTML(value) { this.replaceChildren(); this._text = String(value); } // Existing glass arrows only; not used by the new module.
  get innerHTML() { return this._text; }
  setAttribute(name, value) { value = String(value); if (name === 'class') this.className = value; else if (name === 'id') this.id = value; else if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] = value; this.attributes[name] = value; }
  getAttribute(name) { if (name === 'class') return this.className; if (name === 'id') return this.id; if (name.startsWith('data-')) return this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] ?? null; return this.attributes[name] ?? null; }
  querySelectorAll(selector) { const result = []; const visit = n => n.children.forEach(child=>{ if (selector.split(',').some(s=>matches(child,s))) result.push(child); visit(child); }); visit(this); return result; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let n = this; n; n = n.parentNode) if (matches(n,selector)) return n; return null; }
  focus() { this.ownerDocument.activeElement = this; }
  click() { if (this.disabled) return; if (this.tagName === 'A') this.ownerDocument.downloads.push({name:this.download,href:this.href}); this.dispatchEvent({type:'click',button:0}); }
  getBoundingClientRect() { const i = this.parentNode ? this.parentNode.children.indexOf(this) : 0; return {left:i*100,right:i*100+100,width:100,top:0,bottom:42,height:42}; }
  scrollTo(options) { this.scrollLeft = options.left; }
}
class Document extends Element {
  constructor() { super('document',null); this.ownerDocument = this; this.readyState = 'complete'; this.downloads = []; this.documentElement = this.appendChild(new Element('html',this)); this.head = this.documentElement.appendChild(new Element('head',this)); this.body = this.documentElement.appendChild(new Element('body',this)); }
  createElement(tag) { return new Element(tag,this); }
  getElementById(id) { return this.querySelector('#'+id); }
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
async function harness(manifest, failure) {
  const document = new Document(), window = new Events(), requests = [], previews = [], zipEntries = [];
  function node(tag,cls,parent) { const n=document.createElement(tag);n.className=cls||'';if(parent)parent.appendChild(n);return n; }
  const header=node('header','',document.body), head=node('div','container',header); node('h1','',head).textContent='三普'; const navigation=node('div','tabs',head), host=node('div','container',document.body), banner=node('div','',host);banner.id='missingBanner';
  const oldIds=['soilType','soilAttr','farmland','degradation','specialty','agriSuitability','landUse','reports','references','workRecords'];
  const oldNodes = oldIds.map((id,i)=>{const n=node('div','tab'+(!i?' active':''),navigation);n.dataset.tab=id;n.textContent=id;const p=node('section','tab-content'+(!i?' active':''),host);p.id='tab-'+id;n.addEventListener('click',()=>{document.querySelectorAll('.tab,.tab-content').forEach(x=>x.classList.remove('active'));n.classList.add('active');p.classList.add('active');banner.style.display=id==='references'||id==='workRecords'?'none':'';});return n;});
  let fail=failure, current=manifest, fileGate=null;
  Object.assign(window,{document,console,AbortController,Set,Map,Promise,SOIL_RELEASE_VERSION:'vtest',tabData:{soilType:['original']},SoilDashboardTypes:{soilType:'original'},confirm:()=>true,
    innerWidth:1280,innerHeight:900,setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);if(ms>1000)timer.unref();return timer;},clearTimeout,
    requestAnimationFrame:fn=>setTimeout(fn,0),matchMedia:()=>({matches:true}),
    URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},
    SoilDocumentPreview:{open:(url,name)=>previews.push({kind:'document',url,name})},SoilFileAccess:{openPreview:(url,name)=>previews.push({kind:'other',url,name})},
    JSZip:class {file(path){zipEntries.push(path);} async generateAsync(options,progress){progress({percent:100});return {};}}
  });
  window.window=window;window.globalThis=window;
  window.fetch=async(url,options)=>{requests.push({url,options});if(url.startsWith('./data/')){if(fail)throw new Error('test failure');return {ok:true,json:async()=>current};}if(fileGate)await fileGate;return {ok:true,blob:async()=>({})};};
  const context=vm.createContext(window);
  for(const path of ['national-inspection-core.js','national-inspection.js','glass-navigation.js']) vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
  await tick();
  return {document,window,navigation,banner,oldNodes,requests,previews,zipEntries,setManifest:value=>{current=value;},setFail:value=>{fail=value;},setGate:value=>{fileGate=value;}};
}
function byText(doc,text){return doc.querySelectorAll('button').find(n=>n.textContent===text);}
(async()=>{
  const empty={schemaVersion:1,batches:[],materials:[]};
  const h=await harness(empty),d=h.document;
  assert.equal(h.navigation.querySelectorAll('.tab').length,11);
  h.oldNodes.forEach((node,i)=>assert.equal(h.navigation.querySelectorAll('.tab')[i],node,'Existing navigation nodes/handlers must be preserved'));
  assert.equal(h.navigation.querySelectorAll('.tab').at(-1).dataset.tab,'nationalInspection');
  assert.equal(d.querySelectorAll('.ni-topic').length,8);
  assert.equal(d.querySelectorAll('.ni-topic.tab').length,0);
  assert.equal(d.querySelector('.ni-summary').textContent,'材料清单待读取');
  d.getElementById('glass-tab-nationalInspection').click();await tick();
  assert.equal(h.banner.style.display,'none');assert(d.getElementById('tab-nationalInspection').classList.contains('active'));
  assert.equal(d.querySelector('.ni-summary').textContent,'0 个文件 · 0 个批次标签');
  assert.equal(d.querySelectorAll('.ni-material-group').length,2);
  assert.equal(d.querySelectorAll('.ni-file').length,0);
  assert.equal(d.getElementById('ni-batch').children.length,1);assert(d.getElementById('ni-batch').disabled);
  assert(byText(d,'下载当前筛选 ZIP').disabled);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.credentials,'omit');
  d.getElementById('ni-topic-soilType').dispatchEvent({type:'keydown',key:'End'});
  assert.equal(d.activeElement.id,'ni-topic-reports');assert.equal(d.getElementById('ni-topic-panel').getAttribute('aria-labelledby'),'ni-topic-reports');
  assert(d.getElementById('glass-tab-nationalInspection').classList.contains('active'),'Nested topic must not deactivate top navigation');
  assert.equal(d.querySelectorAll('.ni-topic').filter(n=>n.tabIndex===0).length,1);
  d.getElementById('ni-topic-reports').dispatchEvent({type:'keydown',key:'ArrowRight'});assert.equal(d.activeElement.id,'ni-topic-soilType');
  h.oldNodes[0].click();await tick();assert.notEqual(h.banner.style.display,'none');assert(!d.getElementById('tab-nationalInspection').classList.contains('active'));
  h.oldNodes[0].dispatchEvent({type:'keydown',key:'End'});await tick();assert.equal(d.activeElement.id,'glass-tab-nationalInspection');
  assert.equal(JSON.stringify(h.window.tabData),JSON.stringify({soilType:['original']}));assert.equal(JSON.stringify(h.window.SoilDashboardTypes),JSON.stringify({soilType:'original'}));
  const record={id:'file-a',topicId:'soilType',countyId:'jinzhou',cityId:'shijiazhuang',materialType:'quality',batchId:'actual-a',path:'national-inspection-files/a/<script>.pdf',name:'<script>.pdf'};
  const sample={schemaVersion:1,batches:[{id:'actual-a',label:'实际首批'},{id:'actual-b',label:'实际补充'}],materials:[record,{...record,id:'file-b',countyId:'shexian',cityId:'handan'},{...record,id:'file-c',materialType:'scoring',batchId:'actual-b',path:'national-inspection-files/b/评分.xlsx',name:'评分.xlsx'}]};
  h.setManifest(sample);await h.window.SoilNationalInspection.refresh();
  byText(d,'区县 × 成果类型').click();
  assert.equal(d.getElementById('ni-topic-panel').hidden,true);
  assert.equal(d.getElementById('ni-matrix-panel').hidden,false);
  assert.equal(d.querySelectorAll('.ni-matrix tbody tr').length,4);
  assert.equal(d.querySelectorAll('.ni-cell-button').length,64,'Every county/topic cell retains quality and scoring controls, including empty cells');
  assert.equal(d.querySelector('.ni-matrix tbody tr .ni-matrix-count').textContent,'2');
  const trigger=d.querySelector('.ni-cell-button');trigger.click();
  assert.equal(d.querySelectorAll('.ni-popover').length,1);
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(d.querySelectorAll('.ni-popover-file').length,1);
  d.dispatchEvent({type:'keydown',key:'Escape'});assert.equal(d.querySelectorAll('.ni-popover').length,0);assert.equal(d.activeElement,trigger);
  trigger.click();trigger.click();assert.equal(d.querySelectorAll('.ni-popover').length,0);
  trigger.click();d.body.click();assert.equal(d.querySelectorAll('.ni-popover').length,0);
  byText(d,'按专题').click();assert.equal(d.getElementById('ni-topic-panel').hidden,false);
  assert.equal(d.querySelector('.ni-summary').textContent,'2 个文件 · 2 个批次标签');assert.equal(d.querySelectorAll('.ni-file').length,3);assert.equal(d.querySelectorAll('script').length,0);
  byText(d,'预览文件').click();assert.equal(h.previews[0].kind,'document');assert.equal(h.previews[0].name,'<script>.pdf');
  const county=d.getElementById('ni-county'),batch=d.getElementById('ni-batch');county.value='shexian';county.dispatchEvent({type:'change'});batch.value='actual-b';batch.dispatchEvent({type:'change'});
  assert.equal(d.querySelectorAll('.ni-file').length,0);assert(byText(d,'下载当前筛选 ZIP').disabled);
  byText(d,'清除筛选').click();assert.equal(d.querySelectorAll('.ni-file').length,3);
  let release;h.setGate(new Promise(resolve=>{release=resolve;}));byText(d,'下载当前筛选 ZIP').click();d.getElementById('ni-topic-reports').click();release();await tick();await tick();
  assert.equal(h.zipEntries.length,2,'Shared physical file must only be packaged once');assert.equal(d.downloads[0].name,'国家抽查_土壤类型图.zip','Download filename must retain captured topic during asynchronous switches');
  h.setFail(true);await h.window.SoilNationalInspection.refresh();assert.equal(d.querySelector('.ni-summary').textContent,'2 个文件 · 2 个批次标签');assert(d.querySelector('.ni-status').textContent.includes('继续显示上次成功'));
  const failed=await harness(empty,true);failed.document.getElementById('glass-tab-nationalInspection').click();await tick();assert.equal(failed.document.querySelector('.ni-summary').textContent,'材料清单待读取');assert(failed.document.querySelector('.ni-status').textContent.includes('尚不能确认'));
  byText(failed.document,'区县 × 成果类型').click();
  assert.equal(failed.document.querySelector('.ni-matrix-error').hidden,false);
  assert(failed.document.querySelector('.ni-matrix-error').textContent.includes('清单读取失败'));
  failed.setFail(false);await failed.window.SoilNationalInspection.refresh();assert.equal(failed.document.querySelector('.ni-summary').textContent,'0 个文件 · 0 个批次标签');
  // An explicit >80-file warning is also present in the old public batch module.
  const bulk=await harness({schemaVersion:1,batches:[{id:'actual',label:'真实批次'}],materials:Array.from({length:81},(_,i)=>({...record,id:'bulk-'+i,batchId:'actual',path:'national-inspection-files/bulk/'+i+'.pdf',name:i+'.pdf'}))});
  let prompted=false;bulk.window.confirm=()=>{prompted=true;return false;};bulk.document.getElementById('glass-tab-nationalInspection').click();await tick();byText(bulk.document,'下载当前筛选 ZIP').click();await tick();assert(prompted);assert.equal(bulk.zipEntries.length,0);
  console.log('National inspection DOM simulation passed: preserved main tabs/glass keyboard navigation, 8 accessible subtabs, honest empty/error states, filters, text safety, shared previews, deduplicated ZIP, async topic capture, retry and large-batch warning. No browser rendering or geometry claimed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
