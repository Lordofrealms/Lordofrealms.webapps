const CACHE='human-rpg-0.1.1';
const ASSETS=['./','./index.html','./style.css','./app.js','./engine.js','./catalog.js','./storage.js','./benchmarks.js','./rankings.js','./checksum.js','./archive.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('human-rpg-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok&&ASSETS.some(p=>new URL(p,self.registration.scope).href===url.href)){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(hit=>hit||(event.request.mode==='navigate'?caches.match(new URL('./index.html',self.registration.scope).href):Response.error()))));
});
