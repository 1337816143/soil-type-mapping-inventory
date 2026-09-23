"""Verify correction receipts and directory invariants without modifying files."""
import hashlib,json,subprocess,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
report=json.loads((ROOT/'docs/unit-repair-v1.2.7.json').read_text())
html=(ROOT/'index.html').read_text();h=lambda b:hashlib.sha256(b).hexdigest()
assert h(re.search(r'var masterList = \[[\s\S]*?\n\];',html).group().encode())==report['directoryHashes']['master']
assert h((ROOT/'task-unit-mappings.js').read_bytes())==report['directoryHashes']['mapping']
context=json.loads(subprocess.check_output(['node','scripts/unit-evidence-context.js'],cwd=ROOT,text=True));changed=0
for item in report['reports']:
    assert not item.get('documentError'),item
    if item['documentChanged']:
        assert h((ROOT/item['path']).read_bytes())==item['afterSHA256'],item['path'];changed+=1
    for r in item['associations']:
        if r['oldUnit']==r['newUnit']:continue
        rows=[x for x in context['records'] if x['path']==item['path'] and x['dataKey']==r['dataKey'] and x['city']==r['city'] and x['district']==r['district']]
        assert len(rows)==1 and rows[0]['unit']==r['newUnit'],r
assert changed==report['documentsChanged']
assert changed==6,('Expected four typo and two blank submitter PDFs',changed)
assert report['platformCorrections']==10,report['platformCorrections']
print('Verified correction receipts:',changed,'PDF reports;',report['platformCorrections'],'platform associations; original directory unchanged.')
