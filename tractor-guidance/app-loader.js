(()=>{
 const PARTS=15;
 const ASSET_VERSION='20260820-2';
 window.TRACTOR_ASSET_VERSION=ASSET_VERSION;
 const status=msg=>{const el=document.getElementById('modeHint');if(el)el.textContent=msg};
 const NativeWorker=window.Worker;
 if(NativeWorker){
  const WrappedWorker=function(url,options){
   try{const u=new URL(url,location.href);if(u.origin===location.origin)u.searchParams.set('v',ASSET_VERSION);return new NativeWorker(u.href,options)}catch(e){return new NativeWorker(url,options)}
  };
  WrappedWorker.prototype=NativeWorker.prototype; window.Worker=WrappedWorker;
 }
 async function load(){
  try{
   if(window.TRACTOR_TERMS_READY){status('Waiting for Terms acceptance…');await window.TRACTOR_TERMS_READY}
   status('Loading Tractor Guidance application…');
   const texts=[];
   for(let i=1;i<=PARTS;i++){
    const name=`app-gz-${String(i).padStart(2,'0')}.txt?v=${ASSET_VERSION}`;
    const r=await fetch(name,{cache:'default'});
    if(!r.ok)throw new Error(`${name}: HTTP ${r.status}`);
    texts.push((await r.text()).trim());
    status(`Loading Tractor Guidance application… ${Math.round(i/PARTS*75)}%`);
   }
   const binary=atob(texts.join('')); const bytes=new Uint8Array(binary.length); for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   if(!('DecompressionStream' in window))throw new Error('This browser does not support DecompressionStream. Use a current Chrome/Edge browser.');
   status('Starting Tractor Guidance application… 85%');
   const ds=new DecompressionStream('gzip'); const js=await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
   const blobUrl=URL.createObjectURL(new Blob([js],{type:'text/javascript'})); const script=document.createElement('script'); script.src=blobUrl;
   script.onload=async()=>{URL.revokeObjectURL(blobUrl);try{const sw=document.createElement('script');sw.src=`drive-swath.js?v=${ASSET_VERSION}`;sw.onload=()=>{try{window.installTractorDriveSwath?.()}catch(e){console.error('Drive swath install failed',e)};status('PLAN: edit regions, choose active areas, and generate the route.')};sw.onerror=()=>{console.warn('Drive swath extension failed to load');status('PLAN: edit regions, choose active areas, and generate the route.')};document.body.appendChild(sw)}catch(e){console.error(e);status('PLAN: edit regions, choose active areas, and generate the route.')}};
   script.onerror=()=>{URL.revokeObjectURL(blobUrl);throw new Error('Decompressed application script failed to execute.')};
   document.body.appendChild(script);
  }catch(err){console.error(err);status('Application load failed: '+(err?.message||err));const note=document.getElementById('securityNote'),text=document.getElementById('securityText');if(note&&text){note.style.display='block';text.textContent='Application load failed: '+(err?.message||err)}}
 }
 load();
})();
