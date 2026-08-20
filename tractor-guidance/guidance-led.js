(()=>{
  function installTractorGuidanceLed(){
    if(window.__TRACTOR_GUIDANCE_LED_INSTALLED)return true;
    window.__TRACTOR_GUIDANCE_LED_INSTALLED=true;
    const mapWrap=document.querySelector('.mapWrap');
    if(!mapWrap)return false;
    const bar=document.createElement('div');
    bar.id='guidanceLedBar';bar.className='driveOnly guidanceLedBar';
    const left=document.createElement('span');left.className='guidanceLedLabel left';left.textContent='L';
    const leds=document.createElement('div');leds.className='guidanceLeds';
    const right=document.createElement('span');right.className='guidanceLedLabel right';right.textContent='R';
    const nodes=[];
    for(let i=0;i<31;i++){const d=document.createElement('i');d.className='guidanceLed';if(i===15)d.classList.add('center');leds.appendChild(d);nodes.push(d)}
    bar.append(left,leds,right);mapWrap.parentElement.insertBefore(bar,mapWrap);
    const style=document.createElement('style');style.textContent=`
      .guidanceLedBar{width:100%;display:flex;align-items:center;gap:5px;padding:6px 4px;background:#080d11;border:1px solid var(--line);border-radius:8px;margin-bottom:5px}
      .guidanceLeds{display:grid;grid-template-columns:repeat(31,minmax(3px,1fr));gap:2px;flex:1;height:15px}
      .guidanceLed{display:block;border-radius:3px;background:#20272d;box-shadow:inset 0 0 0 1px #303941}
      .guidanceLed.leftLit{background:#49d46c;box-shadow:0 0 6px #49d46c}
      .guidanceLed.rightLit{background:#ff4e4e;box-shadow:0 0 6px #ff4e4e}
      .guidanceLed.centerLit{background:#45a9ff;box-shadow:0 0 8px #45a9ff}
      .guidanceLedLabel{font-weight:800;font-size:.72rem;width:12px;text-align:center}.guidanceLedLabel.left{color:#49d46c}.guidanceLedLabel.right{color:#ff4e4e}
      @media(max-width:420px){.guidanceLedBar{gap:3px;padding:5px 2px}.guidanceLeds{gap:1px;height:13px}.guidanceLedLabel{font-size:.62rem;width:9px}}
    `;document.head.appendChild(style);
    function update(){
      nodes.forEach(n=>n.classList.remove('leftLit','rightLit','centerLit'));
      const text=(document.getElementById('offsetText')?.textContent||'').trim();
      const steer=(document.getElementById('steerText')?.textContent||'').toUpperCase();
      let feet=Number((text.match(/(-?\d+(?:\.\d+)?)\s*ft/i)||[])[1]);
      if(!Number.isFinite(feet)){nodes[15].classList.add('centerLit');return}
      const tol=Math.max(.1,Number(document.getElementById('guideTol')?.value)||1);
      if(Math.abs(feet)<=tol){nodes[15].classList.add('centerLit');return}
      const steps=Math.max(1,Math.min(15,Math.ceil(Math.abs(feet)/tol)));
      let dir=0;
      if(/LEFT/.test(steer)||/LEFT/.test(text.toUpperCase()))dir=-1;
      else if(/RIGHT/.test(steer)||/RIGHT/.test(text.toUpperCase()))dir=1;
      else dir=feet<0?-1:1;
      const idx=15+dir*steps;
      nodes[idx].classList.add(dir<0?'leftLit':'rightLit');
    }
    const obs=new MutationObserver(update);for(const id of ['offsetText','steerText']){const el=document.getElementById(id);if(el)obs.observe(el,{childList:true,subtree:true,characterData:true})}
    document.getElementById('guideTol')?.addEventListener('input',update);update();
    return true;
  }
  window.installTractorGuidanceLed=installTractorGuidanceLed;
})();
