// Backend-v2 is independent of the active site. No browser-supplied Git paths
// or upload credentials are ever used as server authority.
import DIRECTORY from './directory.mjs';
export const REPO='1337816143/soil-type-mapping-inventory';
export const BRANCH='main';
export const QUALITY_ROOT='data/质控意见反馈_管理员导入';
export const REFERENCE_ROOT='reference-files/third-soil-survey';
export const INDEX_PATH='data/admin-import-index.json';
export const CHUNK=8*1024*1024, MAX_FILE=95*1024*1024, LEGACY_CHUNK=39*1024*1024;
export const TYPES=DIRECTORY.types;
export class Problem extends Error {
  constructor(status,code,message,details={}) {super(message);Object.assign(this,{status,code,details});}
}
export function need(ok,message='请求内容无效',code='INVALID_INPUT',status=400){if(!ok)throw new Problem(status,code,message);}
export function text(value,max=300,optional=false){
  need(typeof value==='string','字段必须是文本');
  const s=value.normalize('NFC').trim();
  need((optional||s.length>0)&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s),'字段为空、过长或含控制字符');return s;
}
export function exactKeys(obj,keys){need(obj&&Object.getPrototypeOf(obj)===Object.prototype&&!Object.keys(obj).some(k=>!keys.includes(k)),'包含不允许的字段');}
export function filename(raw){const n=text(raw,180);need(!/[\\/:*?"<>|%#]/.test(n)&&!/^\./.test(n),'文件名包含不安全字符');need(/\.(pdf|docx?|xlsx?|pptx?|zip|rar|txt|csv|png|jpe?g|gif|webp|avif|bmp)$/i.test(n),'不支持该文件类型');return n;}
export function path(raw){
  const p=text(raw,1200);need(!/[\\%?#]/.test(p)&&!p.startsWith('/')&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!x.startsWith('.')),'路径越界');return p;
}
export function segment(v){return text(v,250).replace(/[\\/:*?"<>|%#]/g,'_');}
function equal(a,b){return String(a).normalize('NFKC').replace(/\s+/g,'')===String(b).normalize('NFKC').replace(/\s+/g,'');}
const corrected={'中地科动察设计有限公司':'中地科勘察设计有限公司','河北图宇地理信息科技有限公司':'河北图宇科技有限公司'};
export function assignment(a){
  exactKeys(a,['dataKey','city','unit','district','unlistedConfirmed']);
  const key=text(a.dataKey,40),city=text(a.city,80),district=text(a.district,100);
  need(Object.hasOwn(TYPES,key),'未知成果类型');
  let matches=DIRECTORY.tasks[key].filter(r=>equal(r.city,city)&&equal(r.district,district));
  if(matches.some(r=>!r.parent))matches=matches.filter(r=>!r.parent);
  const listed=[...new Set(matches.map(r=>r.unit))];
  let unit=a.unit?text(a.unit,250):'';
  if(!unit){need(listed.length===1,'无法唯一确定作业单位，请核对通讯录','ASSIGNMENT_REQUIRED',422);unit=listed[0];}
  let unitCorrection;
  if(corrected[unit]&&listed.length===1&&equal(listed[0],corrected[unit])){unitCorrection={originalUnit:unit,unit:listed[0],reason:'按已核实的精确名称订正规则及该类成果通讯录核对'};unit=listed[0];}
  const code=!listed.length?'outside-list':matches.some(r=>(r.acceptedUnits||[r.unit]).some(u=>equal(u,unit)))?'matched':'unit-mismatch';
  need(code!=='outside-list'||a.unlistedConfirmed===true,'通讯录没有对应任务，请明确确认清单外归档','OUTSIDE_ACK_REQUIRED',422);
  const merged=matches.length&&matches.every(r=>r.parent);
  let message=merged?'通讯录按合并区统一分配作业单位，实际成果分开编制，因此按“'+district+'”单独质控。':'';
  if(code==='outside-list')message='与作业单位通讯录不一致；该类成果通讯录未单列该地区，现有合并区范围及备注也未明确包含。';
  if(code==='unit-mismatch')message+='与作业单位通讯录不一致；通讯录单位：'+listed.join('、')+'；当前记录单位：'+unit+'。';
  return {dataKey:key,city,unit,district,directoryStatus:code,directoryMessage:message,listedUnits:listed,unlistedConfirmed:a.unlistedConfirmed===true,...(unitCorrection?{unitCorrection}:{}),unitSource:a.unit?'filename':'directory'};
}
export function descriptors(body){
  exactKeys(body,['kind','files']);need(['quality','reference'].includes(body.kind),'未知上传模块');
  need(Array.isArray(body.files)&&body.files.length>0&&body.files.length<=30,'单批须为1至30个文件');
  let total=0;
  const files=body.files.map((f,i)=>{
    exactKeys(f,['name','size','sha256','batch','associations','directory']);
    const name=filename(f.name);need(Number.isSafeInteger(f.size)&&f.size>0&&f.size<=MAX_FILE,'单文件必须为非空文件且不超过95 MiB');total+=f.size;
    need(typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256),'缺少文件SHA-256');
    const record={name,size:f.size,sha256:f.sha256,index:i,partCount:Math.ceil(f.size/CHUNK)};
    if(body.kind==='reference'){
      need(!f.associations&&!f.batch,'参考文件不得携带质控归属');
      const dir=f.directory?path(f.directory):REFERENCE_ROOT;
      need(dir===REFERENCE_ROOT||dir.startsWith(REFERENCE_ROOT+'/'),'参考目录越界');
      record.targetPath=dir+'/'+name;
    }else{
      need(!f.directory,'质控归档根目录由后台固定');
      record.batch=text(f.batch,100);
      need(Array.isArray(f.associations)&&f.associations.length>0&&f.associations.length<=100,'需要完整任务关联');
      record.associations=f.associations.map(assignment);
      const registered=DIRECTORY.registered.find(d=>d.name===name);
      if(registered){
        need(registered.size===f.size&&registered.sha256===f.sha256,'原登记报告大小或内容校验不符','REGISTERED_FILE_CHANGED',422);
        const authoritative=['soilType','soilAttr','farmland'].flatMap(key=>registered.byKey[key].map(a=>assignment({dataKey:key,city:a.city,unit:a.unit,district:a.district})));
        const signature=rows=>rows.map(a=>[a.dataKey,a.city,a.unit,a.district].join('|')).sort().join('\n');
        need(signature(record.associations)===signature(authoritative),'登记共享报告必须保持原三类成果及原地区关联','REGISTERED_SCOPE_CHANGED',422);
        record.associations=authoritative;
      }
      const first=record.associations[0],keys=[...new Set(record.associations.map(a=>a.dataKey))];
      record.targetPath=keys.length>1?`${QUALITY_ROOT}/多成果共享质控/${segment(record.batch)}/${name}`:
        [QUALITY_ROOT,segment(TYPES[first.dataKey]),segment(record.batch),segment(first.city),segment(first.unit),segment(first.district),name].join('/');
    }
    return record;
  });
  need(total<=512*1024*1024,'单批合计不得超过512 MiB');
  return {kind:body.kind,files};
}
export function manifest(op){
  const prefix=op.kind==='reference'?'.reference-upload':'.soil-upload';
  return {schemaVersion:3,uploadId:op.id,sourceBranch:op.branch,targetBranch:BRANCH,kind:op.kind,dataKey:op.files[0].associations?.[0].dataKey||'',
    createdAt:op.createdAt,baseCommit:op.baseHead,referenceRoot:REFERENCE_ROOT,indexPath:INDEX_PATH,singleBlobLimit:LEGACY_CHUNK,chunkSize:LEGACY_CHUNK,
    files:op.files.map(f=>{
      const base={order:f.index+1,originalName:f.name,sourcePath:f.name,targetPath:f.targetPath,size:f.size,expectedSize:f.size,expectedSha256:f.sha256,storage:f.partCount===1?'whole':'chunked'};
      const parts=Array.from({length:f.partCount},(_,p)=>({path:`${prefix}/${op.id}/parts/${f.index}/${p}.bin`,size:Math.min(CHUNK,f.size-p*CHUNK)}));
      if(f.partCount===1)base.whole=parts[0];else base.chunks=parts;
      if(op.kind==='quality'){
        const keys=[...new Set(f.associations.map(a=>a.dataKey))];
        base.quality={...f.associations[0],batch:f.batch,dataKeys:keys,complete:true,assignmentVersion:2,associationsByDataKey:Object.fromEntries(keys.map(k=>[k,f.associations.filter(a=>a.dataKey===k)]))};
      }
      return base;
    })};
}
export function deletePath(raw){
  const p=path(raw);
  need([QUALITY_ROOT+'/',REFERENCE_ROOT+'/','replies/'].some(r=>p.startsWith(r)),'只能删除受管文件，不得触及程序、通讯录或其他目录','PATH_FORBIDDEN',403);
  filename(p.split('/').at(-1));need(!/\/(README\.md|manifest\.json|archive\.json)$/i.test(p),'保护文件不能删除','PATH_FORBIDDEN',403);return p;
}
