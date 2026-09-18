#!/usr/bin/env python3
import copy
import importlib.util
import json
import tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('store',Path(__file__).with_name('work-records-store.py'))
store=importlib.util.module_from_spec(spec);spec.loader.exec_module(store)

def operation(rid='wr-12345678', op='op-12345678', action='create', base=0):
    return {'schemaVersion':1,'id':op,'action':action,'baseRevision':base,'record':{'id':rid,'title':'回归测试事项','time':'2026-09-19T09:30','location':'测试地点','people':'测试人员','notes':'记录备注','attachments':[]},'files':[]}

def rejects(fn):
    try:fn()
    except store.InvalidOperation:return
    raise AssertionError('非法操作未被拒绝')

with tempfile.TemporaryDirectory() as t:
    root=Path(t)/'repo';out=Path(t)/'temp';root.mkdir();out.mkdir()
    m=operation(); a={'id':'att-12345678','name':'sample.pdf','size':8,'path':'data/work-records/attachments/wr-12345678/att-12345678/sample.pdf'};m['record']['attachments']=[a]
    p='.work-records-upload/op-12345678/att-12345678/0.bin'; (root/p).parent.mkdir(parents=True);(root/p).write_bytes(b'testdata')
    m['files']=[{'id':a['id'],'name':a['name'],'size':8,'path':a['path'],'chunks':[{'path':p,'size':8}]}]
    store.write_json(root/'.work-records-upload/ready.json',m);store.prepare(root,out);assert store.apply(root,out)
    idx=root/'data/work-records/index.json';saved=store.read_json(idx)['records'][0];assert saved['revision']==1;assert (root/a['path']).read_bytes()==b'testdata';assert saved['attachments'][0]['sha256']
    assert not store.apply(root,out),'同一操作重复运行不能重复记录'
    m2=operation(rid='wr-abcdefgh',op='op-abcdefgh');store.write_json(out/'operation.json',m2);store.apply(root,out);assert len(store.read_json(idx)['records'])==2
    update=operation(op='op-update123',action='update',base=1);update['record']['title']='修改后的事项';update['record']['attachments']=[a];store.write_json(out/'operation.json',update);store.apply(root,out)
    saved=[r for r in store.read_json(idx)['records'] if r['id']=='wr-12345678'][0];assert saved['revision']==2;assert saved['attachments'][0]['sha256']
    stale=operation(op='op-stale1234',action='update',base=1);store.write_json(out/'operation.json',stale);rejects(lambda:store.apply(root,out));assert len(store.read_json(idx)['records'])==2
    delete=operation(op='op-delete123',action='delete',base=2);store.write_json(out/'operation.json',delete);store.apply(root,out);assert not (root/a['path']).exists();assert len(store.read_json(idx)['records'])==1
    for target in ['upload-config.js','data/admin-import-index.json','reference-files/third-soil-survey/a.pdf','data/work-records/attachments/wr-12345678/att-12345678/../../bad.pdf']:
        bad=copy.deepcopy(m);bad['record']['attachments'][0]['path']=target;rejects(lambda:store.validate_manifest(bad))
    bad=copy.deepcopy(m);bad['record']['time']='2026-02-31T09:30';rejects(lambda:store.validate_manifest(bad))
    bad=copy.deepcopy(m);bad['record']['attachments'][0]['name']='unsafe.html';rejects(lambda:store.validate_manifest(bad))
    bad=operation(op='op-bad12345',action='update',base=1,rid='wr-abcdefgh');bad['record']['attachments']=[dict(a,path='data/work-records/attachments/wr-abcdefgh/att-12345678/sample.pdf')];store.write_json(out/'operation.json',bad);rejects(lambda:store.apply(root,out))
print('work-record backend: create/update/delete, attached bytes/hash, idempotency, concurrent revisions and path validation passed')
