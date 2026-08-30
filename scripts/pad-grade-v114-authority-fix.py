from pathlib import Path

path = Path('pad-grade/v114-dev.js')
text = path.read_text(encoding='utf-8')
old = '''  function chooseNormal(map){
    const ids=normalLayers(map);
    const currentlyVisible=ids.filter(id=>visible(map,id));
    activeNormalLayer=currentlyVisible[currentlyVisible.length-1]||activeNormalLayer||ids[ids.length-1]||'';
    return activeNormalLayer;
  }
'''
new = '''  function chooseNormal(map){
    const ids=normalLayers(map);
    // A newly staged slot is intentionally hidden before the synchronous swap.
    // Prefer that explicit authority over whichever retired slot is still visible.
    if(activeNormalLayer&&ids.includes(activeNormalLayer))return activeNormalLayer;
    const currentlyVisible=ids.filter(id=>visible(map,id));
    activeNormalLayer=currentlyVisible[currentlyVisible.length-1]||ids[ids.length-1]||'';
    return activeNormalLayer;
  }
'''
if old not in text:
    raise SystemExit('chooseNormal target not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')

for cleanup in [
    Path('.github/workflows/pad-grade-v114-authority-fix-helper.yml'),
    Path('.github/workflows/pad-grade-v114-authority-fix-helper2.yml'),
    Path('scripts/pad-grade-v114-authority-fix.py'),
]:
    if cleanup.exists():
        cleanup.unlink()
