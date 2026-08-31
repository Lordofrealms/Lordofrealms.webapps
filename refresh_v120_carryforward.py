#!/usr/bin/env python3
from pathlib import Path
import subprocess

skip={'pad-grade/v119-heat-cutover-selftest.js'}
changed=[]
for rel in subprocess.check_output(['git','ls-files'],text=True).splitlines():
    if rel in skip or 'selftest' not in rel.lower():
        continue
    p=Path(rel)
    try:text=p.read_text()
    except Exception:continue
    new=text.replace('pad-grade/v119-dev.js','pad-grade/v120-dev.js').replace('src="v119-dev.js','src="v120-dev.js').replace('current v1.1.9 runtime','current v1.2.0 runtime')
    if new!=text:
        p.write_text(new);changed.append(rel)
print('refreshed carry-forward tests:')
for rel in changed:print(rel)
if not changed:raise SystemExit('no stale v119 carry-forward references found')
