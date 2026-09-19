'use strict';
const assert=require('assert/strict'),fs=require('fs');
const B=require('../batch-policy.js'),C=require('../work-records-core.js');
async function main(){
 assert.equal(B.format('第一批'),'2026年第一次第1批');
 assert.equal(B.format('第二批补充'),'2026年第一次第2批补充');
 assert.equal(B.format('第三批'),'2026年第一次第3批');
 assert.equal(B.format('第一轮'),'2026年第一次第1批');
 assert.equal(B.format('2026年第二次质控第3批'),'2026年第二次第3批');
 assert.equal(B.identity('第二批补充'),B.identity('2026年第一次第2批补充'));
 assert.notEqual(B.identity('2026年第一次第1批'),B.identity('2026年第二次第1批'));
 assert.notEqual(B.identity('2026年第一次第1批'),B.identity('2027年第一次第1批'));
 assert.equal(B.parse('第三次全国土壤普查成果质控报告'),null,'全国三普不是第三次质控');
 assert.equal(B.format('未分类'),'未分类');
 assert.throws(()=>B.validate({year:2026,round:0,batch:1}));
 const old={batch:'第一轮'},meta={kind:'quality',batch:'第一轮',catalogMatched:true,catalogExact:true,expectedSha256:'old-hash'};
 B.applyToItem(old,meta,{year:2026,round:2,batch:1});
 assert.equal(old.batch,'2026年第二次第1批');assert.equal(meta.expectedSha256,'','下一轮不能锁定旧文件指纹');
 const reply=require('../reply-workflow-core.js');
 assert.equal(reply.replyKey('市','单位','县','第二批补充'),reply.replyKey('市','单位','县','2026年第一次第2批补充'));
 assert.notEqual(reply.replyKey('市','单位','县','第一批'),reply.replyKey('市','单位','县','2026年第二次第1批'));
 const index=reply.buildIndex(['市_单位_县_批次-第一批_整改答复_20260101010101.pdf','市_单位_县_批次-2026年第一次第1批_整改答复_20260901010101.pdf']);
 assert.equal(Object.keys(index).length,1);assert(Object.values(index)[0].file.includes('20260901'));
 assert.equal(C.query([{title:'会议',location:'北京',people:'张三',notes:'培训',time:'2026-09-18T09:00',attachments:[]}],'北京 培训').length,1);
 assert.equal(C.query([{title:'会议',deletedAt:'now',time:'2026-09-18T09:00'}],'').length,0);
 assert.throws(()=>C.fields({title:'',time:'2026-09-18T09:00'},true));
 assert.throws(()=>C.store({records:[]}));
 const d=C.draft({id:'draft-a',fields:{title:'草稿',notes:'保持原文'},password:'never-store',authorized:true,token:'never-store',files:[{id:'f',file:{name:'a.png',size:3}}]});
 assert(!JSON.stringify(d).includes('never-store'));assert(!('authorized' in d));assert.equal(d.files.length,1);
 let remote={schemaVersion:1,records:[]},treeNum=0,commitNum=0,conflict=false,blobCount=0,mutations=0;
 const trees=new Map(),commits=new Map();
 async function request(path,options={}){
  const body=options.body;
  if(path==='/git/ref/heads/main')return{object:{sha:'head'}};
  if(path.startsWith('/git/commits/'))return{tree:{sha:'base'}};
  if(path.startsWith('/contents/data/work-records.json'))return{content:Buffer.from(JSON.stringify(remote)).toString('base64')};
  if(path==='/git/blobs'){blobCount++;assert.equal(body.encoding,'base64');return{sha:'blob'+blobCount};}
  if(path==='/git/trees'){
   assert.equal(body.base_tree,'base');assert(body.tree.every(e=>e.path===C.storePath||e.path.startsWith(C.fileRoot)));
   const name='t'+(++treeNum);trees.set(name,body.tree);return{sha:name};
  }
  if(path==='/git/commits'){const name='c'+(++commitNum);commits.set(name,body.tree);assert.deepEqual(body.parents,['head']);return{sha:name};}
  if(path==='/git/refs/heads/main'){
   assert.equal(options.method,'PATCH');assert.equal(body.force,false);
   if(conflict){conflict=false;remote.records.push({id:'wr-other',revision:1,title:'他人记录',time:'2026-09-18T09:01',attachments:[]});const e=new Error('concurrent commit');e.status=422;throw e;}
   const entries=trees.get(commits.get(body.sha));remote=JSON.parse(entries.find(e=>e.path===C.storePath).content);mutations++;return{object:{sha:body.sha}};
  }
  throw new Error('Unexpected API path: '+path);
 }
 const deps={request,encode:async()=>Buffer.from('attachment').toString('base64')};
 const first={operation:'save',id:'wr-first',baseRevision:null,fields:{title:'质控培训',time:'2026-09-18T09:00',location:'北京',people:'张三',notes:'测试'},attachments:[],files:[{id:'file1',file:{name:'资料.pdf',size:10,type:'application/pdf'}}]};
 const result=await C.save(first,deps);
 assert.equal(result.record.revision,1);assert.equal(result.record.attachments.length,1);assert.equal(mutations,1);assert.equal(blobCount,1);
 await assert.rejects(()=>C.save({...first,baseRevision:1},deps),/管理员验证/);
 assert.equal(blobCount,1,'管理员验证失败不能上传附件');
 const edited=await C.save({...first,files:[],attachments:result.record.attachments,baseRevision:1,authorized:true,fields:{...first.fields,title:'更正培训地点'}},deps);
 assert.equal(edited.record.revision,2);
 await assert.rejects(()=>C.save({...first,baseRevision:1,authorized:true},deps),/其他设备/);
 conflict=true;
 const simultaneous=await C.save({...first,id:'wr-second',files:[]},deps);
 assert(simultaneous.data.records.some(r=>r.id==='wr-other'),'并发保存不能覆盖其他成员');
 const removed=await C.save({operation:'delete',id:'wr-first',baseRevision:2,authorized:true},deps);
 assert(removed.record.deletedAt);assert.equal(C.query(removed.data.records).length,2);
 await assert.rejects(()=>C.save({...first,id:'wr-too-big',files:[{file:{name:'big.pdf',size:C.maxFile+1}}]},deps),/39 MiB/);
 const source=fs.readFileSync('work-records.js','utf8'),core=fs.readFileSync('work-records-core.js','utf8');
 assert(!/MutationObserver|SoilAdminAutoClassifier|adm-files|adm-ok/.test(source),'工作记录不能复用质控自动识别或全页面观察器');
 assert(core.includes('indexedDB.open'));assert(source.includes('Numpad8'));assert(source.includes('visualViewport'));
 assert(fs.readFileSync('glass-interface.css','utf8').includes('prefers-reduced-motion'));
 const loader=fs.readFileSync('page-enhancements.js','utf8');
 for(const file of ['batch-policy.js','batch-management.js','work-records-core.js','work-records.js']) assert(loader.includes(file+'?v=1.2.0'),file+' 缓存版本或部署入口缺失');
 console.log('Workspace behavioral checks passed: legacy aliases, three-level batches, atomic save/delete, conflicts, attachments, drafts and isolation.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
