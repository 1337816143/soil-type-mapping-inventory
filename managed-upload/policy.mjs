/** Immutable write boundaries. This module does not read or change the task roster. */
export const REPOSITORY = '1337816143/soil-type-mapping-inventory';
export const ORIGIN = 'https://1337816143.github.io';
export const QUALITY_ROOT = 'data/质控意见反馈_管理员导入';
export const REFERENCE_ROOT = 'reference-files/third-soil-survey';
export const INDEX_PATH = 'data/admin-import-index.json';
export const PART_BYTES = 1024 * 1024;
export const MAX_FILE_BYTES = 95 * 1024 * 1024;
export const MAX_BATCH_BYTES = 256 * 1024 * 1024;
export const TYPE_LABELS = Object.freeze({soilType:'土壤类型图',soilAttr:'土壤属性图',farmland:'耕地质量等级评价',degradation:'土壤退化与障碍分析',specialty:'土特产品土壤适宜性评价',agriSuitability:'土壤农业利用适宜性评价',landUse:'土地资源评价与利用报告',reports:'总体、工作、数据报告'});
const EXTENSIONS = new Set('pdf doc docx xls xlsx ppt pptx zip rar txt csv png jpg jpeg webp gif tif tiff'.split(' '));
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export function requireThat(condition, status, code, message) {
  if (!condition) throw new ApiError(status, code, message);
}
export function field(value, name, max=160) {
  requireThat(typeof value==='string',400,'INVALID_FIELD',`${name}格式错误。`);
  const s=value.normalize('NFC').trim();
  requireThat(s.length>0 && s.length<=max && !/[\u0000-\u001f\u007f]/.test(s),400,'INVALID_FIELD',`${name}为空或过长。`);
  return s;
}
export function relativePath(value) {
  const s=field(value,'文件路径',1500);
  requireThat(!/[\\%?#<>|:*"\u202a-\u202e\u2066-\u2069]/.test(s) && !s.startsWith('/'),400,'PATH_DENIED','文件路径包含不安全字符。');
  requireThat(s.split('/').every(p=>p && p!=='.' && p!=='..' && !p.startsWith('.') && p.trim()===p),400,'PATH_DENIED','文件路径不允许空目录、隐藏目录或上级目录。');
  return s;
}
export function fileName(value) {
  const s=relativePath(value);
  requireThat(!s.includes('/') && EXTENSIONS.has(s.split('.').pop().toLowerCase()),400,'FILE_TYPE_DENIED','文件类型不在允许范围内。');
  return s;
}
export function managedPath(value) {
  const s=relativePath(value), leaf=s.split('/').pop(); fileName(leaf);
  requireThat([QUALITY_ROOT+'/',REFERENCE_ROOT+'/','replies/'].some(root=>s.startsWith(root)),403,'PATH_DENIED','只能操作质控导入、参考资料或答复目录内的文件。');
  requireThat(!/^(readme\.md|manifest\.json|archive\.json)$/i.test(leaf),403,'PATH_DENIED','不能操作受保护的目录元数据。');
  return s;
}
export function uuid(value) {
  requireThat(typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),400,'INVALID_ID','请求标识格式错误。');
  return value.toLowerCase();
}
export function hash(value) {
  requireThat(typeof value==='string' && /^[0-9a-f]{64}$/.test(value),400,'INVALID_HASH','文件需要有效的SHA-256校验值。'); return value;
}
export function normalizePassword(value) {
  return typeof value==='string' ? value.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[\u200b-\u200d\u2060\ufeff]/g,'').trim() : '';
}
function segment(value) {
  return field(value,'归档信息',220).replace(/[\\/:*?"<>|%#\u0000-\u001f]/g,'_').replace(/^\.+/,'_');
}
function qualityMeta(q) {
  requireThat(q && q.assignmentVersion===2 && q.complete===true,400,'ASSIGNMENT_REQUIRED','请先核对完整的成果归属。');
  const keys=q.dataKeys;
  requireThat(Array.isArray(keys) && keys.length>0 && keys.length<=8 && new Set(keys).size===keys.length && keys.every(k=>Object.hasOwn(TYPE_LABELS,k)),400,'TYPE_REQUIRED','成果类别无效。');
  const by=q.associationsByDataKey;
  requireThat(by && typeof by==='object' && Object.keys(by).length===keys.length && Object.keys(by).every(k=>keys.includes(k)),400,'ASSIGNMENT_REQUIRED','各成果的独立归属信息不完整。');
  const cleaned={}; let total=0;
  for (const key of keys) {
    requireThat(Array.isArray(by[key]) && by[key].length>0,400,'ASSIGNMENT_REQUIRED','缺少该成果的归属。');
    cleaned[key]=by[key].map(row=>{
      requireThat(row && row.dataKey===key,400,'TYPE_MISMATCH','归属与成果类别不一致。');
      requireThat(['matched','unit-mismatch','outside-list'].includes(row.directoryStatus),400,'DIRECTORY_STATUS_REQUIRED','缺少通讯录核对状态。');
      requireThat(row.directoryStatus!=='outside-list' || row.unlistedConfirmed===true,400,'OUTSIDE_CONFIRMATION_REQUIRED','请确认清单外任务的文件名归属。');
      total++;
      return {dataKey:key,city:field(row.city,'市'),unit:field(row.unit,'单位',240),district:field(row.district,'任务单元'),directoryStatus:row.directoryStatus,unlistedConfirmed:row.unlistedConfirmed===true,
        directoryMessage:typeof row.directoryMessage==='string'?row.directoryMessage.slice(0,1500):'',unitSource:typeof row.unitSource==='string'?row.unitSource.slice(0,100):'',
        listedUnits:Array.isArray(row.listedUnits)?row.listedUnits.slice(0,10).filter(x=>typeof x==='string').map(x=>x.slice(0,240)):[]};
    });
  }
  requireThat(total<=200,413,'TOO_MANY_ASSOCIATIONS','单份文件关联任务过多，请拆分批次。');
  // Browser suggestions are not new roster authority: the existing Actions
  // reconciliation still checks the immutable source directory and report.
  return {assignmentVersion:2,complete:true,batch:field(q.batch,'批次'),dataKeys:keys.slice(),dataKey:keys[0],associationsByDataKey:cleaned};
}
export function prepareBatch(input, uploadId) {
  requireThat(input && ['quality','reference'].includes(input.kind),400,'INVALID_KIND','请选择质控意见或参考资料。');
  requireThat(Array.isArray(input.files) && input.files.length>0 && input.files.length<=40,400,'INVALID_FILES','每次请选择1至40份文件。');
  let total=0;
  const files=input.files.map((f,i)=>{
    const name=fileName(f.name);
    requireThat(Number.isSafeInteger(f.size) && f.size>0 && f.size<=MAX_FILE_BYTES,413,'FILE_TOO_LARGE','单个文件大小须在0至95MiB之间。'); total+=f.size;
    const meta={originalName:name,size:f.size,order:i+1,expectedSha256:hash(f.sha256),expectedSize:f.size,sourcePath:typeof f.sourcePath==='string'?f.sourcePath.slice(0,1500):name,parts:[],partCount:Math.ceil(f.size/PART_BYTES)};
    if (input.kind==='quality') {
      meta.quality=qualityMeta(f.quality);
      const q=meta.quality, rows=Object.values(q.associationsByDataKey).flat(), first=rows[0];
      const sub=(q.dataKeys.length>1 || rows.length>1) ? ['多成果共享质控',segment(q.batch)] : [TYPE_LABELS[q.dataKeys[0]],segment(q.batch),segment(first.city),segment(first.unit),segment(first.district)];
      meta.targetPath=managedPath([QUALITY_ROOT,...sub,name].join('/'));
    } else {
      const directory=relativePath(f.directory||REFERENCE_ROOT);
      requireThat(directory===REFERENCE_ROOT || directory.startsWith(REFERENCE_ROOT+'/'),403,'PATH_DENIED','参考资料不能写入其他目录。');
      const relative=relativePath(f.relativePath||name);
      requireThat(relative.split('/').pop()===name,400,'NAME_MISMATCH','文件名与相对路径不一致。');
      meta.targetPath=managedPath(directory+'/'+relative);
    }
    return meta;
  });
  requireThat(total<=MAX_BATCH_BYTES,413,'BATCH_TOO_LARGE','本次文件总量超过256MiB，请分批上传。');
  return {id:uploadId,kind:input.kind,files,totalBytes:total,state:'receiving'};
}
export function importManifest(batch, baseCommit) {
  const ref=batch.kind==='reference', root=ref?'.reference-upload':'.soil-upload';
  const manifest={schemaVersion:3,uploadId:batch.id,sourceBranch:(ref?'reference-upload-':'soil-upload-')+batch.id,targetBranch:'main',kind:batch.kind,createdAt:new Date(batch.createdAt).toISOString(),baseCommit,
    referenceRoot:REFERENCE_ROOT,indexPath:INDEX_PATH,singleBlobLimit:39*1024*1024,chunkSize:39*1024*1024,files:[]};
  const entries=[];
  for (const [fi,file] of batch.files.entries()) {
    requireThat(file.parts.length===file.partCount && file.parts.every(Boolean),409,'PARTS_MISSING','文件尚未完整上传。');
    const parts=file.parts.map((p,pi)=>{
      const path=`${root}/${batch.id}/parts/${fi}/${pi}.bin`;
      entries.push({path,mode:'100644',type:'blob',sha:p.sha});return {path,size:p.size};
    });
    const clean={};
    for (const k of ['originalName','size','order','expectedSha256','expectedSize','sourcePath','targetPath','quality']) if (file[k]!==undefined) clean[k]=file[k];
    if(parts.length===1){clean.storage='whole';clean.whole=parts[0];}else{clean.storage='chunked';clean.chunks=parts;}
    manifest.files.push(clean);
  }
  return {manifest,entries,root};
}
