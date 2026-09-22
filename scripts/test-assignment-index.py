"""Run the actual Actions index-writer block in an isolated temporary repository."""
import json, pathlib, re, subprocess, sys, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
workflow=(ROOT/'.github/workflows/import-chunked.yml').read_text()
block=workflow.split('      - name: Restore repository paths and index',1)[1]
code=block.split("          python3 <<'PY'\n",1)[1].split('\n          PY',1)[0]
code='\n'.join(line[10:] if line.startswith('          ') else line for line in code.splitlines())
fixtures=json.loads((ROOT/'test-artifacts/assignment-manifests.json').read_text())
checks=0
for fixture in fixtures:
    with tempfile.TemporaryDirectory() as directory:
        base=pathlib.Path(directory); repo=base/'repo';repo.mkdir()
        restored=base/'restored';restored.mkdir()
        manifest=base/'manifest.json';manifest.write_text(json.dumps(fixture))
        prior={'kind':'quality-control','dataKey':'soilType','path':'existing/original.docx','unit':'do-not-change'}
        index=repo/'data/admin-import-index.json';index.parent.mkdir();index.write_text(json.dumps([prior]))
        for i,f in enumerate(fixture['files'],1):(restored/f'{i:04d}.bin').write_bytes(b'fixture-content!')
        script=base/'writer.py'
        script.write_text(code.replace("Path('/tmp/soil-hybrid-restored')",'Path('+repr(str(restored))+')').replace("Path('/tmp/soil-hybrid-manifest.json')",'Path('+repr(str(manifest))+')'))
        result=subprocess.run([sys.executable,str(script)],cwd=repo,capture_output=True,text=True)
        assert result.returncode==0,result.stderr
        rows=json.loads(index.read_text());assert rows[0]==prior
        source=fixture['files'][0];expected=source['quality']['associationsByDataKey']
        assert len({r['path'] for r in rows[1:]})==1
        assert len(rows[1:])==sum(len(v) for v in expected.values())
        for key,group in expected.items():
            for association in group:
                assert any(all(r[k]==association[k] for k in ['city','unit','district']) and r['dataKey']==key for r in rows[1:])
        assert all(r['complete'] is True for r in rows[1:]);checks+=1
        # A malformed keyed assignment must not be flattened to a global company.
        broken=json.loads(json.dumps(fixture));next(iter(broken['files'][0]['quality']['associationsByDataKey'].values()))[0]['unit']=''
        manifest.write_text(json.dumps(broken));before=index.read_bytes()
        result=subprocess.run([sys.executable,str(script)],cwd=repo,capture_output=True,text=True)
        assert result.returncode!=0 and index.read_bytes()==before;checks+=1
print(f'Actions index-writer checks passed: {checks}; per-type companies persist, one physical file, prior index untouched.')
