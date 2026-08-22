/* Pad Grade v0.5.3 — keep v0.5.1 grid renderer authoritative after startup/layout. */
(function installPadGradeV053(){
  'use strict';

  const $=id=>document.getElementById(id);

  function renderCurrent(){
    try{if(typeof window.renderGrid==='function')window.renderGrid();}catch(e){}
  }

  // Clear any delayed legacy resize renders that may have been queued while the
  // older migration layers were still loading before v0.5.1 became authoritative.
  for(const key of ['__pg041Resize','__pg042Resize','__pg045Resize','__pg046Resize','__pg047Resize','__pg049Resize','__pg050Resize']){
    try{if(window[key]){clearTimeout(window[key]);window[key]=null;}}catch(e){}
  }

  // Android WebView can change its usable viewport after system-bar insets and
  // final layout are applied. Re-render a few times across that startup window.
  [0,120,300,700].forEach(delay=>setTimeout(renderCurrent,delay));

  const shell=$('grid')?.parentElement;
  if(shell&&typeof ResizeObserver==='function'){
    let lastW=-1,lastH=-1,timer=null;
    const observer=new ResizeObserver(entries=>{
      const rect=entries[0]?.contentRect;
      if(!rect)return;
      const w=Math.round(rect.width*10)/10,h=Math.round(rect.height*10)/10;
      if(w===lastW&&h===lastH)return;
      lastW=w;lastH=h;
      clearTimeout(timer);
      timer=setTimeout(renderCurrent,50);
    });
    observer.observe(shell);
    window.__padGradeGridResizeObserver=observer;
  }

  document.title='Pad Grade Mapper v0.5.3';
})();
