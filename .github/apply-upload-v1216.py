from pathlib import Path
import re, subprocess, hashlib
root=Path('.')
assert (root/'VERSION').read_text().strip()=='v1.2.15'
master_before=re.search(r'var masterList = \[[\s\S]*?\n\];',(root/'index.html').read_text()).group()
mapping_before=(root/'task-unit-mappings.js').read_bytes()
token_before=re.search(r'var tokenCodes = \[[^\]]+\]',(root/'upload-config.js').read_text()).group()
p=root/'admin-auto-classifier.js';s=p.read_text()
s=s.replace("segment = normalize(segment);", "segment = normalize(segment).replace(/\\s+/g, '');",1)
s=s.replace("/土壤属性图|土壤属性成果|属性图成果|属性图/", "/土壤属性(?:制图|图件|图|成果)|属性图成果|属性制图|属性图/")
s=s.replace("/土壤类型图|土壤类型成果|土类图|类型图成果/", "/土壤类型(?:制图|图件|图|成果)|土类图|类型图成果/")
s=s.replace("/总体报告|工作报告|数据报告/.test(normalize(text))", "/总体报告|工作报告|数据报告/.test(normalize(text).replace(/\\s+/g, ''))")
anchor='  function inferDataKeys(text) {'
block=r'''  var opinionConfirmations = new WeakMap();
  function qualityContentStatus(item, meta) {
    meta = meta || item.autoMeta || {};
    if (meta.kind !== 'quality') return {required:false, blocked:false};
    var name = normalize(basename(item.file && item.file.name || item.path || '')).replace(/\s+/g, '');
    var keys = meta.dataKeys || [];
    var blocked = /报告原件|成果原件|报告原文|成果原文|报告正文|报告完整版|非质控意见|非质量控制意见/.test(name) ||
      isReportReference(name);
    if (blocked) return {required:false, blocked:true, message:'文件名明确标示为报告原件或参考资料；本入口只接收质控意见，请核对并选择正确文件。'};
    // A report title, a date, or a parent folder called 质控 does not prove that
    // the bytes are an opinion. Obtain explicit confirmation, never auto-approve.
    var required = keys.indexOf('reports') >= 0 && !isReportOpinion(name);
    if (!required) return {required:false, blocked:false};
    var association = meta.assignment && meta.assignment.byKey || {};
    var signature = JSON.stringify([item.path || '',item.sourcePath || '',keys,meta.batch || item.batch || '',
      Object.keys(association).map(function(k){return association[k].map(function(r){return [k,r.city,r.unit,r.district];});})]);
    var confirmed = !!item.file && opinionConfirmations.get(item.file) === signature;
    return {required:true, blocked:false, confirmed:confirmed, signature:signature,
      message:confirmed?'已确认文件内容为质控意见（非报告原件）。':'归属已识别；文件名未注明“质控意见”，开始上传时须确认内容为质控意见，而非报告原件。'};
  }
  function confirmQualityContent(files) {
    (files || []).forEach(function(item){
      var meta=applyItemMetadata(item),review=qualityContentStatus(item,meta);
      if(review.blocked || !isResolved(item,meta))throw new Error(review.blocked?review.message:matchingDescription(meta));
      if(review.required)opinionConfirmations.set(item.file,review.signature);
    });
  }
  function qualityContentError(item, meta) {
    var review=qualityContentStatus(item,meta);
    return review.blocked || review.required&&!review.confirmed ? review.message : '';
  }
'''
assert anchor in s;s=s.replace(anchor,block+anchor,1)
old="var keys = exact ? exact.dataKeys.slice() : item.manualDataKey ? [item.manualDataKey] : inferDataKeys(text);"
new=old+'''
    // Within an explicitly opened quality importer, identify a report family
    // provisionally even if its name omits 质控意见. Upload still needs the
    // separate, file-bound content confirmation below. Generic files get no
    // silent fallback from whichever global dropdown happened to be selected.
    var state=Q()&&Q().state;
    if (!exact && !keys.length && isReportFamily(fileName) && !isReportReference(fileName) &&
        (currentMode()==='quality' || state&&state.context&&state.context.kind==='quality')) keys=['reports'];'''
assert old in s;s=s.replace(old,new)
s=s.replace("if (!keys.length) problems.push(issue('','missing-type','尚未识别成果类型，请使用完整成果名称或人工选择成果类型。'));", "if (!keys.length || keys.some(function(k){return !TYPE_LABELS[k];})) problems.push(issue('','missing-type','未识别成果类型；请在本条文件右侧的“成果类型”中选择，或补充文件名中的成果名称。'));")
old="if (!keys.length || !manual.city || !manual.unit || !manual.district) problems.push(issue('','manual-incomplete','人工调整尚未填写完整，请选择成果类型、市、作业单位和任务单元。'));"
new="""var missing=[];
      if(!keys.length || keys.some(function(k){return !TYPE_LABELS[k];}))missing.push('成果类型');
      if(!manual.city)missing.push('市');if(!manual.unit)missing.push('作业单位');if(!manual.district)missing.push('任务单元');
      if (missing.length) problems.push(issue('','manual-incomplete','尚缺：'+missing.join('、')+'。请在本条文件右侧补齐'+(missing.indexOf('成果类型')>=0?'“成果类型”等对应项':'对应项')+'；已填信息已保留。'));"""
assert old in s;s=s.replace(old,new)
s=s.replace("if (meta.assignment) return meta.assignment.complete;", "if (meta.assignment) return meta.assignment.complete && meta.dataKeys.every(function(k){return !!TYPE_LABELS[k];});")
old="var reviewText = state.unresolved ? '；仍有 ' + state.unresolved + ' 份需要人工检查' : '；全部已自动识别，无需手动指定';"
new="""var contentReviews=(Q()&&Q().state&&Q().state.files||[]).map(function(item,index){return qualityContentStatus(item,state.metas[index]);});
    var blocked=contentReviews.filter(function(r){return r.blocked;}).length;
    var pending=contentReviews.filter(function(r){return r.required&&!r.confirmed;}).length;
    var manualCount=(Q()&&Q().state&&Q().state.files||[]).filter(function(item){return item.manualDataKey||item.manualAssociation;}).length;
    var reviewText = state.unresolved ? '；仍有 ' + state.unresolved + ' 份归属信息需要补齐' : '；归属信息完整'+(manualCount?'（含人工指定）':'');
    if(blocked)reviewText+='；'+blocked+' 份文件需更换为质控意见';
    else if(pending)reviewText+='；'+pending+' 份文件将在上传前单独确认内容';"""
assert old in s;s=s.replace(old,new)
needle="      status.textContent = text;"
repl="""      var contentReview=qualityContentStatus(item,meta);
      if(contentReview.blocked || contentReview.required){
        text+='\\n'+contentReview.message;
        if(contentReview.blocked || !contentReview.confirmed)className='warn';
      }
"""+needle
assert needle in s;s=s.replace(needle,repl)
s=s.replace("    inferKind:inferKind,", "    inferKind:inferKind,\n    qualityContentStatus:qualityContentStatus,confirmQualityContent:confirmQualityContent,qualityContentError:qualityContentError,")
p.write_text(s)
p=root/'admin-import-v2.js';s=p.read_text()
old="function row(x,i){var k=itemKey(x);"
new="""function typeOptions(x){var k=itemKey(x),keys=x.autoMeta&&x.autoMeta.dataKeys||[],labels=Q.types();if(keys.length>1&&!x.manualDataKey)return opt('__shared__',keys.map(function(v){return labels[v]||v}).join('、'),true);return opt('','请选择成果类型',!k)+Object.keys(labels).map(function(v){return opt(v,labels[v],v===k)}).join('')}
function row(x,i){var k=itemKey(x);"""
assert old in s;s=s.replace(old,new)
old='<div class="v2-fields"><label>批次<select class="rb">'
new='<div class="v2-fields"><label class="v2-type-field">成果类型<select class="rk" aria-label="本文件成果类型"\'+((x.autoMeta&&x.autoMeta.catalogMatched||x.autoMeta&&x.autoMeta.dataKeys.length>1&&!x.manualDataKey)?\' disabled\':\'\')+\'>\'+typeOptions(x)+\'</select></label><label>批次<select class="rb">'
assert old in s;s=s.replace(old,new,1)
anchor="r.querySelector('.rb').onchange=function()"
insert="""r.querySelector('.rk').onchange=function(){var x=S.files[i];if(this.value)x.manualDataKey=this.value;else delete x.manualDataKey;delete x.unlistedConfirmation;render()};"""
assert anchor in s;s=s.replace(anchor,insert+anchor,1)
s=s.replace('.v2-fields label{', '.v2-type-field{grid-column:1/-1}.v2-fields label{',1)
start=s.index('Q.confirmQualityOnly=function(');end=s.index('\nfunction startUpload()',start)
s=s[:start]+r'''Q.confirmQualityOnly=function(files,kind,key){
 if(kind!=='quality')return true;
 var c=window.SoilAdminAutoClassifier, issues=[], pending=[], blocked=[];
 function names(xs){var shown=xs.slice(0,5).map(function(x){return x.file&&x.file.name||x.path||'未命名文件'});return shown.join('\n')+(xs.length>shown.length?'\n……共'+xs.length+'份':'')}
 (files||[]).forEach(function(x){
  var m=c&&c.applyItemMetadata(x);
  if(c&&m&&!c.isResolved(x,m)){issues.push({file:x,message:c.matchingDescription(m)||'请补齐成果类型和归属信息。'});return}
  var review=c&&c.qualityContentStatus(x,m);
  if(review&&review.blocked)blocked.push(x);
  else if(review&&review.required&&!review.confirmed)pending.push(x);
 });
 if(issues.length){Q.progress('归属信息尚未完整，请补齐后上传：\n'+issues.slice(0,5).map(function(x){return (x.file.file&&x.file.file.name||x.file.path)+'：'+x.message}).join('\n')+(issues.length>5?'\n……共'+issues.length+'份，请查看各文件右侧提示。':''),0,true);return false}
 if(blocked.length){Q.progress('以下文件名明确标示为报告原件或参考资料，本入口不能接收；请核对文件内容：\n'+names(blocked),0,true);return false}
 if(pending.length){
  var accepted=confirm('以下'+pending.length+'份文件已识别成果类型与归属，但文件名未注明“质控意见”：\n\n'+names(pending)+'\n\n请逐份核对内容。仅当它们确实是质控意见（可合并或分开出具），且不含任何报告原件时，点击“确定”继续；无法确认请点“取消”。此操作不会改名或修改文件内容。');
  if(!accepted){Q.progress('尚未上传：请核对文件内容，仅上传质控意见；已选择文件及归属信息均已保留。',0,true);return false}
  c.confirmQualityContent(files);
 }else if(!confirm(key==='reports'?'请确认所选文件均为总体、工作、数据报告的质控意见，不含报告原件。意见可合并为一份或分别出具。确认后继续上传？':'请确认所选文件均为质控意见，不含任何成果原件。确认后继续上传？'))return false;
 if(c&&Q.renderPreview)Q.renderPreview();
 return true;
};''' +s[end:]
p.write_text(s)
p=root/'hybrid-staged-upload.js';s=p.read_text()
old="if(kind==='quality' && meta && meta.assignment && !meta.assignment.complete)throw new Error(classifier.matchingDescription(meta));"
new=old+"\n        if(kind==='quality' && classifier && classifier.qualityContentError){var contentError=classifier.qualityContentError(item,meta);if(contentError)throw new Error(item.file.name+'：'+contentError);}"
assert old in s;s=s.replace(old,new)
old="if (incomplete.length && !confirm('有 ' + incomplete.length + ' 个文件归档信息不完整，请核对并补充归属信息。是否继续保存？')) return;"
new="if (incomplete.length) { progress('归属信息尚未完整：'+incomplete.slice(0,5).map(function(item){var meta=itemMetadata(item);return item.file.name+'：'+(classifier&&meta?classifier.matchingDescription(meta):'请补齐成果类型、市、作业单位和任务单元。');}).join('\\n'),0); return; }"
assert old in s;s=s.replace(old,new);p.write_text(s)
for name,digest in {'admin-auto-classifier.js':'389184960443e899a93f1d3935f63ee14c1c9ddacfa20f8337f3143e4f3bd50f','admin-import-v2.js':'54841e5a67cce1a5e7b7e804a36ea323bb2091e78106c504a7c22b844841992e','hybrid-staged-upload.js':'d6228207d98d6d21d5deb66e893a1cac94d494c6464f92f042d4836b3fa7e3cd'}.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
subprocess.run(['python3','.github/integrate-upload-v1216.py'],check=True)
subprocess.run(['node','scripts/bump-version.js','patch'],check=True)
assert master_before==re.search(r'var masterList = \[[\s\S]*?\n\];',(root/'index.html').read_text()).group()
assert mapping_before==(root/'task-unit-mappings.js').read_bytes()
assert token_before==re.search(r'var tokenCodes = \[[^\]]+\]',(root/'upload-config.js').read_text()).group()
print('Validated v1.2.16 source checksums; original rosters and credential bytes unchanged')
