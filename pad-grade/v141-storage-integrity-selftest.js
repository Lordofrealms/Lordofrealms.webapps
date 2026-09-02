'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const fmt=require('./project-format-v107.js');

(async()=>{
  const store=new Map(),marks=[],listeners=new Map(),writes=[];
  const p1=fmt.normalizeProject({id:'pg-duplicate',fileId:'ABCD22',createdAt:'2026-01-01T00:00:00Z',modifiedAt:'2026-01-01T00:00:00Z',settings:{width:64,length:76,cols:3,rows:3,target:64,tol:.5,name:'Older'},readings:{'0,0':64,'0,1':65,'1,0':63}},'ABCD22-pg-duplicate.padgrade');
  const p2=fmt.normalizeProject({id:'pg-duplicate',fileId:'ABCD22',createdAt:'2026-02-01T00:00:00Z',modifiedAt:'2026-02-01T00:00:00Z',settings:{width:64,length:76,cols:3,rows:3,target:64,tol:.5,name:'Newer'},readings:{'0,0':64,'0,1':66,'1,0':62}},'ABCD22-copy.padgrade');
  store.set('ABCD22-pg-duplicate.padgrade',fmt.serializeV6(p1,'ABCD22-pg-duplicate.padgrade'));
  store.set('ABCD22-copy.padgrade',fmt.serializeV6(p2,'ABCD22-copy.padgrade'));
  store.set('Pad-Grade-Project-Index.pgindex','{"stale":true}');
  store.set('Pad-Grade-Heat-pg-duplicate.pgheatcache','stale-cache');
  const local=new Map();
  // Simulate the real failure mode: a prior ambiguous duplicate-ID reconciliation
  // left the older project's body cached under the shared project ID.
  local.set('padGradeProjectV5:pg-duplicate',JSON.stringify(p1));
  const window={
    PadGradeProjectFormatV107:fmt,
    PadGradeNative:{hasProjectFolderConfigured:()=>true,isProjectFolderIndexReady:()=>true},
    PadGradeDiag:{mark:(name,details)=>marks.push({name,details})},
    PadGradeFiles:{
      details:()=>[...store].filter(([name])=>/\.(padgrade|json)$/i.test(name)).map(([name,text])=>({name,size:text.length,lastModified:name.includes('copy')?200:100})),
      read:async name=>store.get(name)??null,
      readHead:async(name,n)=>String(store.get(name)??'').slice(0,n),
      write:async(name,text)=>{assert.strictEqual(window.__padGradeIntegrityRepairActive,true,'repair write must explicitly bypass recovery lock');writes.push(name);store.set(name,text);return true;},
      delete:async name=>{assert.strictEqual(window.__padGradeIntegrityRepairActive,true,'repair delete must explicitly bypass recovery lock');return store.delete(name);}
    },
    addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
    removeEventListener(){},
    localStorage:{getItem:key=>local.get(key)??null,setItem:(key,val)=>local.set(key,String(val))}
  };
  const context={window,localStorage:window.localStorage,console,Date,Math,JSON,Number,String,Array,Set,Map,Promise,setTimeout,clearTimeout};context.globalThis=context;
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'v141-storage-integrity.js'),'utf8'),context,{filename:'v141-storage-integrity.js'});
  const result=await window.PadGradeProjectIntegrityV141.beforeIndexController();
  assert.strictEqual(result.ready,true);assert.strictEqual(result.repaired,1);assert.strictEqual(result.failed,0);
  assert.strictEqual(result.ownersRefreshed,1,'collision winner must be reloaded into local cache');
  assert.strictEqual(result.ownerRefreshFailed,0);
  const projectFiles=[...store.keys()].filter(name=>name.endsWith('.padgrade'));
  assert.strictEqual(projectFiles.length,2,'repair must preserve both projects');
  const projects=projectFiles.map(name=>fmt.normalizeProject(JSON.parse(store.get(name)),name));
  assert.strictEqual(new Set(projects.map(p=>p.id)).size,2,'project IDs must be unique after repair');
  assert.strictEqual(new Set(projects.map(p=>p.fileId)).size,2,'file IDs must be unique after repair');
  assert(projects.some(p=>p.id==='pg-duplicate'&&p.settings.name==='Newer'),'newest duplicate must retain original project ID');
  assert(projects.some(p=>p.id!=='pg-duplicate'&&p.settings.name==='Older'),'older duplicate must receive a new project ID');
  const retainedLocal=JSON.parse(local.get('padGradeProjectV5:pg-duplicate'));
  assert.strictEqual(retainedLocal.settings.name,'Newer','retained project ID local cache must be overwritten by authoritative collision winner');
  assert(!store.has('Pad-Grade-Project-Index.pgindex'),'stale index must be invalidated after repair');
  assert(!store.has('Pad-Grade-Heat-pg-duplicate.pgheatcache'),'shared-ID heat cache must be invalidated');
  assert(marks.some(x=>x.name==='project.integrity-repaired'));
  assert(marks.some(x=>x.name==='project.integrity-owner-refreshed'));
  assert(writes.length>=1);

  const diag=fs.readFileSync(path.join(__dirname,'v096-diagnostics.js'),'utf8');
  assert(diag.includes('const MAX_ENTRIES=50000;'));assert(diag.includes('const PRUNE_TO=48000;'));assert(diag.includes('persistedCount-PRUNE_TO'));
  const native=fs.readFileSync(path.join(__dirname,'v096-native-async.js'),'utf8');
  assert(native.includes('__padGradeIntegrityRepairActive===true'));assert(native.includes('v141-storage-integrity.js?v=20260902-1'));assert(native.includes('beforeIndexController'));
  const heat=fs.readFileSync(path.join(__dirname,'v063-dev.js'),'utf8');
  assert(heat.includes("window.addEventListener('padgrade-before-project-switch',()=>{removeRaster();"));
  assert(heat.includes('displayedCanvas=null;activeCanvasSlot=null'));
  assert(heat.includes('syncTimer=setInterval(()=>{installMapClick();syncSurface();syncLaserMarker();},900)'));
  console.log('v1.4.1 regression passed: durable duplicate identities repair before index restore, collision winner refreshes local cache, diagnostics retain 50k, and outgoing heat producer state is retired at switch boundary.');
})().catch(error=>{console.error(error);process.exit(1);});
