(()=>{
 const PARTS=15;
 const ASSET_VERSION='20260820-17';
 const TERMS_BUILD_KEY='tractorGuidanceTermsAcceptedAppBuild';
 window.TRACTOR_ASSET_VERSION=ASSET_VERSION;
 const status=msg=>{const el=document.getElementById('modeHint');if(el)el.textContent=msg};
 const NativeWorker=window.Worker;
 if(NativeWorker){
  const WrappedWorker=function(url,options){
   try{const u=new URL(url,location.href);if(u.origin===location.origin)u.searchParams.set('v',ASSET_VERSION);return new NativeWorker(u.href,options)}catch(e){return new NativeWorker(url,options)}
  };
  WrappedWorker.prototype=NativeWorker.prototype; window.Worker=WrappedWorker;
 }
 async function ensureBuildTermsAcceptance(){
   if(localStorage.getItem(TERMS_BUILD_KEY)===ASSET_VERSION)return;
   const show=window.showTractorTerms;
   const gate=document.getElementById('termsGate');
   const accept=document.getElementById('termsAcceptBtn');
   const check=document.getElementById('termsAcceptCheck');
   if(typeof show!=='function'||!gate||!accept||!check)throw new Error('Terms gate is unavailable for this application build.');
   status(`Acceptance required for app build ${ASSET_VERSION}…`);
   await new Promise(resolve=>{
     const handler=()=>{
       if(!check.checked)return;
       localStorage.setItem(TERMS_BUILD_KEY,ASSET_VERSION);
       accept.removeEventListener('click',handler);
       resolve();
     };
     accept.addEventListener('click',handler);
     show(true);
   });
 }
 async function loadExtension(src,label,installer){
   return await new Promise(resolve=>{
     try{
       const el=document.createElement('script');el.src=`${src}?v=${ASSET_VERSION}`;
       el.onload=()=>{try{const ok=window[installer]?.();console.log(`${label}:`,ok===false?'not installed':'installed')}catch(e){console.error(`${label} install failed`,e)}resolve()};
       el.onerror=()=>{console.warn(`${label} failed to load`);resolve()};document.body.appendChild(el);
     }catch(e){console.error(e);resolve()}
   });
 }
 async function load(){
  try{
   if(window.TRACTOR_TERMS_READY){status('Waiting for Terms acceptance…');await window.TRACTOR_TERMS_READY}
   await ensureBuildTermsAcceptance();
   status('Loading Tractor Guidance application…');
   const texts=[];
   for(let i=1;i<=PARTS;i++){
    const name=`app-gz-${String(i).padStart(2,'0')}.txt?v=${ASSET_VERSION}`;
    const r=await fetch(name,{cache:'default'});if(!r.ok)throw new Error(`${name}: HTTP ${r.status}`);
    texts.push((await r.text()).trim());status(`Loading Tractor Guidance application… ${Math.round(i/PARTS*75)}%`);
   }
   const binary=atob(texts.join(''));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   if(!('DecompressionStream' in window))throw new Error('This browser does not support DecompressionStream. Use a current Chrome/Edge browser.');
   status('Starting Tractor Guidance application… 82%');
   const ds=new DecompressionStream('gzip');const js=await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
   const blobUrl=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));const script=document.createElement('script');script.src=blobUrl;
   script.onload=async()=>{
     URL.revokeObjectURL(blobUrl);
     status('Starting PLAN controls… 86%');
     await loadExtension('coverage-mode.js','Coverage fit controls','installTractorCoverageMode');
     await loadExtension('plan-layout-v15.js','PLAN layout','installTractorPlanLayoutV15');
     status('Starting GPS/work controls… 89%');
     await loadExtension('work-mode.js','GPS/work mode','installTractorWorkMode');
     status('Starting operational map renderer… 93%');
     await loadExtension('geometry-overlay.js','Operational map renderer','installTractorGeometryOverlay');
     status('Building Drive console… 97%');
     await loadExtension('drive-console.js','Drive console','installTractorDriveConsole');
     const build=document.getElementById('buildBadge');if(build)build.textContent='Build '+ASSET_VERSION;
     status('PLAN: edit regions, choose active areas, and generate the route.');
   };
   script.onerror=()=>{URL.revokeObjectURL(blobUrl);throw new Error('Decompressed application script failed to execute.')};
   document.body.appendChild(script);
  }catch(err){console.error(err);status('Application load failed: '+(err?.message||err));const note=document.getElementById('securityNote'),text=document.getElementById('securityText');if(note&&text){note.style.display='block';text.textContent='Application load failed: '+(err?.message||err)}}
 }
 load();
})();
