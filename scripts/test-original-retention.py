from pathlib import Path
import tempfile,json,runpy
ROOT=Path(__file__).resolve().parents[1]
retention=runpy.run_path(str(ROOT/'scripts/retain-quality-originals.py'))['retention']
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);manifest=root/'manifest.json';receipt=root/'data/unit-correction-history/test.json';receipt.parent.mkdir(parents=True)
    manifest.write_text(json.dumps({'kind':'quality','uploadId':'test'}))
    assert retention(manifest,root)=='keep'
    for documents,platform,expected in [(1,0,'keep'),(0,1,'keep'),(6,10,'keep'),(0,0,'delete')]:
        receipt.write_text(json.dumps({'scope':'incoming','documentsChanged':documents,'platformCorrections':platform}))
        assert retention(manifest,root)==expected
    receipt.write_text('invalid');assert retention(manifest,root)=='keep'
    manifest.write_text(json.dumps({'kind':'reference'}));assert retention(manifest,root)=='delete'
    manifest.write_text(json.dumps({'kind':'quality','uploadId':'../wrong'}));assert retention(manifest,root)=='keep'
workflow=(ROOT/'.github/workflows/import-chunked.yml').read_text()
assert 'scripts/retain-quality-originals.py' in workflow
assert workflow.index('scripts/repair-quality-units.py')<workflow.index('Commit imported files once')<workflow.index('scripts/retain-quality-originals.py')
print('Original-retention checks passed: corrections and uncertain receipts keep originals; unmodified and reference imports keep existing cleanup.')

import yaml,subprocess
parsed=yaml.safe_load(workflow)
cleanup=parsed["jobs"]["import"]["steps"][-1]["run"]
assert "scripts/retain-quality-originals.py" in cleanup
subprocess.run(["bash","-n"],input=cleanup,text=True,check=True)
print("Import workflow YAML and cleanup shell syntax validated.")
