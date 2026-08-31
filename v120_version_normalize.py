#!/usr/bin/env python3
from pathlib import Path
import subprocess

old='1.1.10'
new='1.2.0'
changed=[]
for rel in subprocess.check_output(['git','ls-files'],text=True).splitlines():
    if rel.startswith('.github/workflows/'):
        continue
    p=Path(rel)
    try:
        text=p.read_text()
    except Exception:
        continue
    if old in text:
        p.write_text(text.replace(old,new))
        changed.append(rel)
print('normalized version strings in:')
for rel in changed:
    print(rel)
if not changed:
    raise SystemExit('no 1.1.10 strings found outside workflows')
