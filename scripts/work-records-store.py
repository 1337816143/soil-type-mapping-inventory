#!/usr/bin/env python3
"""Validate isolated work-record mutations. No quality/reference indices are touched."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT = 'data/work-records'
MAX_FILE = 95 * 1024 * 1024
CHUNK = 39 * 1024 * 1024
ID = re.compile(r'^wr-[a-zA-Z0-9-]{8,75}$')
ATT_ID = re.compile(r'^att-[a-zA-Z0-9-]{8,75}$')
OP_ID = re.compile(r'^op-[a-zA-Z0-9-]{8,75}$')
EXT = re.compile(r'\.(pdf|docx?|xlsx?|pptx?|csv|txt|md|zip|rar|7z|png|jpe?g|webp|gif|avif|bmp|mp4|mov)$', re.I)

class InvalidOperation(ValueError):
    pass

def require(test, message):
    if not test:
        raise InvalidOperation(message)

def relative(raw, prefix):
    require(isinstance(raw, str), '路径必须为字符串')
    p = PurePosixPath(raw)
    require(not p.is_absolute() and '..' not in p.parts and '\\' not in raw and '\0' not in raw, '非法相对路径')
    require(str(p).startswith(prefix + '/'), '文件路径超出允许范围')
    require(str(p) == raw, '文件路径格式不规范')
    return raw

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def validate_manifest(m):
    require(isinstance(m, dict) and m.get('schemaVersion') == 1, '不支持的工作记录清单版本')
    require(OP_ID.fullmatch(str(m.get('id', ''))), '操作编号无效')
    require(m.get('action') in {'create','update','delete'}, '操作类型无效')
    r = m.get('record')
    require(isinstance(r, dict) and ID.fullmatch(str(r.get('id', ''))), '记录编号无效')
    require(type(m.get('baseRevision')) is int and 0 <= m['baseRevision'] < 100000000, '记录版本无效')
    if m['action'] != 'delete':
        for key, limit in [('title',300),('time',32),('location',500),('people',1000),('notes',20000)]:
            require(isinstance(r.get(key),str) and len(r[key]) <= limit, f'{key}格式或长度无效')
        require(r['title'].strip(), '事项不能为空')
        require(re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d', r['time']), '时间格式无效')
        try:
            datetime.fromisoformat(r['time'])
        except ValueError as e:
            raise InvalidOperation('时间无效') from e
    attachments = r.get('attachments', [])
    require(isinstance(attachments,list) and len(attachments) <= 30, '附件过多')
    ids, paths = set(), set()
    for a in attachments:
        require(isinstance(a,dict) and ATT_ID.fullmatch(str(a.get('id',''))), '附件编号无效')
        require(isinstance(a.get('name'),str) and 0 < len(a['name']) <= 300 and EXT.search(a['name']), '不支持的附件名称或格式')
        require(type(a.get('size')) is int and 0 < a['size'] <= MAX_FILE, '附件大小超限')
        relative(a.get('path'), f"{ROOT}/attachments/{r['id']}/{a['id']}")
        require(EXT.search(a['path']), '不支持的附件格式')
        require(a['id'] not in ids and a['path'] not in paths, '附件编号或路径重复')
        ids.add(a['id']); paths.add(a['path'])
    return m

def prepare(root: Path, out: Path):
    m = validate_manifest(read_json(root / '.work-records-upload/ready.json'))
    files = m.get('files', [])
    require(isinstance(files,list) and len(files) <= 30, '上传附件清单无效')
    require(not (m['action'] == 'delete' and files), '删除操作不能新增附件')
    attachments = {a['id']: a for a in m['record'].get('attachments', [])}
    out.mkdir(parents=True, exist_ok=True)
    seen = set()
    for f in files:
        aid = f.get('id')
        require(aid in attachments and aid not in seen, '附件未在记录中登记或重复')
        seen.add(aid)
        a = attachments[aid]
        require(f.get('path') == a['path'] and f.get('size') == a['size'], '附件路径/大小不一致')
        chunks = f.get('chunks')
        require(isinstance(chunks,list) and 1 <= len(chunks) <= 3, '附件分段无效')
        written = 0
        h = hashlib.sha256()
        with (out / (aid+'.bin')).open('wb') as target:
            for part in chunks:
                path = relative(part.get('path'), f".work-records-upload/{m['id']}/{aid}")
                source = root / path
                require(source.is_file() and not source.is_symlink(), '分段文件缺失或非法')
                require(type(part.get('size')) is int and 0 < part['size'] <= CHUNK and source.stat().st_size == part['size'], '分段大小不一致')
                with source.open('rb') as stream:
                    while buf := stream.read(1024*1024):
                        written += len(buf)
                        require(written <= MAX_FILE, '附件超出大小上限')
                        h.update(buf); target.write(buf)
        require(written == a['size'], '附件实际大小不一致')
        a['sha256'] = h.hexdigest()
    write_json(out/'operation.json',m)
    return m

def apply(root: Path, out: Path):
    m = validate_manifest(read_json(out/'operation.json'))
    receipt = root/ROOT/'receipts'/f"{m['id']}.json"
    if receipt.exists():
        require(read_json(receipt).get('recordId') == m['record']['id'], '操作编号冲突')
        return False
    path = root/ROOT/'index.json'
    current = read_json(path) if path.exists() else {'schemaVersion':1,'records':[]}
    require(current.get('schemaVersion') == 1 and isinstance(current.get('records'),list), '工作记录索引格式错误，拒绝覆盖')
    r = m['record']; rid = r['id']
    records = current['records']
    found = [x for x in records if x.get('id') == rid]
    require(len(found) <= 1, '记录重复，拒绝修改')
    old = found[0] if found else None
    if m['action'] == 'create':
        require(old is None and m['baseRevision'] == 0, '该记录已经保存，请刷新后再操作')
    else:
        require(old is not None, '记录已被删除或不存在')
        require(old.get('revision') == m['baseRevision'], '记录已被他人修改；请刷新后重新确认，不能覆盖新版本')
    prefix = f'{ROOT}/attachments/{rid}'
    existing = {x['id']:x for x in (old or {}).get('attachments',[])}
    incoming = {x['id']:x for x in m.get('files',[])}
    new_attachments = []
    if m['action'] != 'delete':
        for a in r.get('attachments',[]):
            if a['id'] in incoming:
                require(a['id'] not in existing, '新附件不能冒用已存在附件编号')
                source = out/(a['id']+'.bin')
                require(source.is_file() and source.stat().st_size == a['size'], '已校验附件丢失')
                new_attachments.append(a)
            else:
                require(a['id'] in existing and a['path'] == existing[a['id']]['path'], '不允许引用其他记录的附件')
                new_attachments.append(existing[a['id']])
    # All validation is complete before modifying repository files.
    for a in new_attachments:
        if a['id'] in incoming:
            target = root/relative(a['path'],prefix)
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(out/(a['id']+'.bin'),target)
    retained = {a['id'] for a in new_attachments}
    for aid,a in existing.items():
        if aid not in retained:
            target = root/relative(a['path'],prefix)
            if target.is_file(): target.unlink()
    new_records = [x for x in records if x.get('id') != rid]
    revision = (old or {}).get('revision',0) + 1
    now = datetime.now(timezone.utc).isoformat()
    if m['action'] != 'delete':
        saved = {k:r.get(k,'') for k in ['id','title','time','location','people','notes']}
        saved.update(revision=revision,createdAt=(old or {}).get('createdAt') or now,updatedAt=now,attachments=new_attachments)
        new_records.append(saved)
    write_json(path,{'schemaVersion':1,'updatedAt':now,'records':new_records})
    write_json(receipt,{'schemaVersion':1,'id':m['id'],'recordId':rid,'action':m['action'],'revision':revision,'status':'success','savedAt':now})
    return True

if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('phase',choices=['prepare','apply'])
    p.add_argument('--root',type=Path,default=Path.cwd())
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    try:
        globals()[args.phase](args.root.resolve(),args.out.resolve())
        print('工作记录校验与'+('暂存还原' if args.phase=='prepare' else '事务更新')+'完成')
    except (InvalidOperation,ValueError,KeyError) as e:
        raise SystemExit(str(e))
