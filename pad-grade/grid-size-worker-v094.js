/* Pad Grade v0.9.4 DEV — background lower-grid text measurement.
 * Receives only serializable text/font inputs. DOM/layout work remains on the
 * main thread; string measurement runs here with OffscreenCanvas while the map,
 * heatmap, GPS, and other UI continue loading.
 */
'use strict';

self.onmessage=function(event){
  const msg=event.data||{};
  const jobId=msg.jobId;
  const samples=Array.isArray(msg.samples)?msg.samples:[];
  const family=String(msg.family||'sans-serif');
  try{
    if(typeof OffscreenCanvas!=='function')throw new Error('OffscreenCanvas unavailable');
    const canvas=new OffscreenCanvas(8,8);
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('2D context unavailable');
    let max=0,lastWeight='';
    for(const sample of samples){
      const weight=String(sample?.weight||400);
      if(weight!==lastWeight){ctx.font=`${weight} 100px ${family}`;lastWeight=weight;}
      const text=String(sample?.text||'—');
      max=Math.max(max,ctx.measureText(text).width/100);
    }
    self.postMessage({type:'complete',jobId,needWidthPerPx:Math.max(1,max*1.04)});
  }catch(error){
    self.postMessage({type:'unsupported',jobId,message:String(error?.message||error||'worker measurement unavailable')});
  }
};

self.__padGradeGridSizingWorkerV094='offscreen-canvas-measuretext-background';
