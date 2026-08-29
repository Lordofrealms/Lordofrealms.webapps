/* Pad Grade v0.9.5 DEV — keyboard-safe Enter Reading dialog.
 * Keep the reading editor at the top of the visible viewport so the Android
 * keyboard consumes space below it instead of covering the lower dialog actions.
 */
(function installPadGrade095ReadingDialog(){
  'use strict';
  const GAP=8;

  const style=document.createElement('style');
  style.textContent=`
    #entryDlg[open]{
      position:fixed;
      left:0;right:0;bottom:auto;
      margin:0 auto;
      overflow:auto;
      overscroll-behavior:contain;
    }
    #entryDlg[open] .modal{overflow:visible;padding-bottom:max(16px,env(safe-area-inset-bottom));}
  `;
  document.head.appendChild(style);

  function dialog(){return document.getElementById('entryDlg');}
  function position(){
    const dlg=dialog();if(!dlg?.open)return;
    const vv=window.visualViewport;
    const top=(vv&&Number.isFinite(vv.offsetTop)?vv.offsetTop:0)+GAP;
    const height=(vv&&Number.isFinite(vv.height)?vv.height:window.innerHeight)-GAP*2;
    dlg.style.top=`${Math.max(GAP,top)}px`;
    dlg.style.maxHeight=`${Math.max(180,height)}px`;
  }
  function clear(){const dlg=dialog();if(!dlg)return;dlg.style.removeProperty('top');dlg.style.removeProperty('max-height');}
  function install(){
    const dlg=dialog();if(!dlg)return;
    const observer=new MutationObserver(()=>{if(dlg.open)requestAnimationFrame(position);else clear();});
    observer.observe(dlg,{attributes:true,attributeFilter:['open']});
    dlg.addEventListener('focusin',()=>requestAnimationFrame(position));
    window.visualViewport?.addEventListener('resize',position);
    window.visualViewport?.addEventListener('scroll',position);
    window.addEventListener('orientationchange',()=>setTimeout(position,0));
    if(dlg.open)position();
    window.__padGradeReadingDialogV095='top-of-visual-viewport-keyboard-safe';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
