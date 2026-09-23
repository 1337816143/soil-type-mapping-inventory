"""Cleanup gate: never delete the only original of an automatically corrected report."""
from pathlib import Path
import json,re,sys

def retention(manifest_path,root):
    try:
        manifest=json.loads(Path(manifest_path).read_text())
        if manifest.get('kind')=='reference':return 'delete'
        if manifest.get('kind')!='quality':return 'keep'
        upload_id=str(manifest.get('uploadId') or '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',upload_id):return 'keep'
        receipt=Path(root)/'data/unit-correction-history'/f'{upload_id}.json'
        audit=json.loads(receipt.read_text())
        # Preserve original bytes and the original metadata manifest together.
        if int(audit['documentsChanged'])>0 or int(audit['platformCorrections'])>0:return 'keep'
        if audit.get('scope')!='incoming':return 'keep'
        return 'delete'
    except (OSError,ValueError,TypeError,KeyError):
        # Missing/old/invalid evidence is never a reason to destroy originals.
        return 'keep'

if __name__=='__main__':
    manifest=sys.argv[1] if len(sys.argv)>1 else '/tmp/soil-hybrid-manifest.json'
    root=Path(__file__).resolve().parents[1]
    print(retention(manifest,root))
