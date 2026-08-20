(()=>{
 const PARTS=15;
 const status=msg=>{
   const el=document.getElementById('modeHint');
   if(el)el.textContent=msg;
 };
 async function load(){
   try{
     status('Loading Tractor Guidance application…');
     const texts=[];
     for(let i=1;i<=PARTS;i++){
       const name=`app-gz-${String(i).padStart(2,'0')}.txt`;
       const r=await fetch(name,{cache:'force-cache'});
       if(!r.ok)throw new Error(`${name}: HTTP ${r.status}`);
       texts.push((await r.text()).trim());
       status(`Loading Tractor Guidance application… ${Math.round(i/PARTS*75)}%`);
     }
     const binary=atob(texts.join(''));
     const bytes=new Uint8Array(binary.length);
     for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
     if(!('DecompressionStream' in window))throw new Error('This browser does not support DecompressionStream. Use a current Chrome/Edge browser.');
     status('Starting Tractor Guidance application… 85%');
     const ds=new DecompressionStream('gzip');
     const js=await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
     const blobUrl=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));
     const script=document.createElement('script');
     script.src=blobUrl;
     script.onload=()=>{URL.revokeObjectURL(blobUrl);status('PLAN: edit regions, choose active areas, and generate the route.')};
     script.onerror=()=>{URL.revokeObjectURL(blobUrl);throw new Error('Decompressed application script failed to execute.')};
     document.body.appendChild(script);
   }catch(err){
     console.error(err);
     status('Application load failed: '+(err?.message||err));
     const note=document.getElementById('securityNote'),text=document.getElementById('securityText');
     if(note&&text){note.style.display='block';text.textContent='Application load failed: '+(err?.message||err)}
   }
 }
 load();
})();