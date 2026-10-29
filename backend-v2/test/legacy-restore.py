"""Execute ORIGINAL workflow restore/index Python blocks in a disposable folder.
No git commands, tokens, network writes, or deployed UI are used here.
Temporary absolute /tmp paths are redirected; workflow business code is unchanged.
"""
import hashlib,json,pathlib,re,subprocess,tempfile,textwrap,sys
ROOT=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[2]).resolve()
HERE=pathlib.Path(__file__).resolve().parent
results=[]
for kind,workflow in [('quality','import-chunked.yml'),('reference','import-reference.yml')]:
    source=(ROOT/'.github/workflows'/workflow).read_text()
    blocks=re.findall(r"python3 <<'PY'\n(.*?)\n          PY",source,re.S)
    assert len(blocks)>=2,workflow
    with tempfile.TemporaryDirectory(prefix='soil-backend-restore-') as folder:
        temp=pathlib.Path(folder)
        subprocess.run(['node',str(HERE/'make-staging-fixture.mjs'),folder,kind],check=True)
        idx=temp/'data/admin-import-index.json';idx.parent.mkdir(exist_ok=True)
        original=[{'kind':'quality-control','path':'untouched-original.pdf','dataKey':'soilType'}]
        idx.write_text(json.dumps(original))
        for block in blocks[:2]:
            code=textwrap.dedent(block)
            for token in ['/tmp/soil-hybrid-restored','/tmp/soil-reference-restored','/tmp/soil-hybrid-manifest.json','/tmp/soil-reference-manifest.json','/tmp/soil-target-branch.txt']:
                code=code.replace(token,str(temp/pathlib.Path(token).name))
            subprocess.run([sys.executable,'-c',code],cwd=folder,check=True,capture_output=True,text=True)
        expectation=json.loads((temp/'expectation.json').read_text())
        for item in expectation:assert hashlib.sha256((temp/item['target']).read_bytes()).hexdigest()==item['sha256'],item['target']
        updated=json.loads(idx.read_text());assert original[0] in updated
        if kind=='quality':
            assert len(updated)==11
            for r in updated[1:]:assert r['city']=='沧州市' and r['district']=='沧州市'
            assert next(r for r in updated[1:] if r['dataKey']=='soilType')['unit']=='沧州华江工程勘察设计有限公司'
            assert sum(r.get('dataKey')=='reports' for r in updated)==3
        else:assert updated==original
        results.append({'module':kind,'files':len(expectation),'restoredBytesMatched':True,'originalIndexPreserved':True,'workflow':workflow})
out=HERE.parent/'test-results';out.mkdir(exist_ok=True)
(out/'legacy-restore.json').write_text(json.dumps({'mode':'original workflow restore code, disposable filesystem only','results':results},ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False))
