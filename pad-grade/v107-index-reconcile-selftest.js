'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const {webcrypto}=require('crypto');
const fmt=require('./project-format-v107.js');

let folderReady=false, clock=1000, projectBodyReads=0, headReads=0, projectWrites=0, failNextProjectWrite=false;
const disk=new Map();
const ls=new Map();
const candidate=name=>/\.(padgrade(?:\.json)?|json)$/i.test(name);
function bytes(text){return new TextEncoder().encode(String(text||'')).length;}
function putDisk(name,text,mtime=++clock){disk.set(name,{text:String(text),size:bytes(text),lastModified:mtime});}
function details(){return [...disk.entries()].filter(([name])=>candidate(name)).map(([name,x])=>({name,size:x.size,lastModified:x.lastModified}));}
function v5(id,fid,name='Pad'){
  const readings={};for(let r=0;r<2;r++)for(let c=0;c<2;c++)readings[`${r},${c}`]=64+r*.1+c*.1;
  return {app:'Pad Grade Mapper Mobile',schemaVersion:5,version:5,id,fileId:fid,createdAt:'2026-08-01T00:00:00.000Z',modifiedAt:'2026-08-30T12:00:00.000Z',status:'open',settings:{width:64,length:76,cols:2,rows:2,target:64,tol:.5,refCorner:'SW',name,legacySetting:'keep'},readings,readingMeta:{},gps:{corners:{SW:{lat:35,lon:-97},SE:{lat:35,lon:-96.9998},NE:{lat:35.0002,lon:-96.9998},NW:{lat:35.0002,lon:-97}}},measureMode:'gps',legacyTopLevel:'keep'};
}
function v6(id,fid,name){return fmt.serializeV6(v5(id,fid,name),`${fid}-${id}.padgrade`);}

const PadGradeFiles={
  async read(name){const x=disk.get(name);if(candidate(name))projectBodyReads++;return x?.text??null;},
  async readHead(name,max=4096){const x=disk.get(name);if(candidate(name))headReads++;return x?.text.slice(0,max)??null;},
  async write(name,text){
    if(candidate(name)){projectWrites++;if(failNextProjectWrite){failNextProjectWrite=false;return false;}}
    putDisk(name,text);return true;
  },
  async delete(name){return disk.delete(name);},
  list(){return [...disk.keys()].filter(candidate);},details
};
const PadGradeNative={
  hasProjectFolderConfigured:()=>folderReady,
  isProjectFolderIndexReady:()=>folderReady,
  isProjectFolderRecoveryPending:()=>false,
  completeProjectFolderRecovery:()=>{}
};
const localStorage={getItem:k=>ls.has(k)?ls.get(k):null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)};
const listeners=new Map();
const window={PadGradeFiles,PadGradeNative,PadGradeProjectFormatV107:fmt,PadGradeDiag:null,addEventListener:(n,f)=>{if(!listeners.has(n))listeners.set(n,[]);listeners.get(n).push(f);},dispatchEvent:()=>{},PadGradePlatform:null};
const document={documentElement:{classList:{contains:()=>false}},addEventListener:()=>{},querySelector:()=>null};
const context={window,document,localStorage,console,crypto:webcrypto,TextEncoder,Blob:global.Blob,URL:global.URL,CustomEvent:function(n,o){this.type=n;this.detail=o?.detail;},setTimeout:(fn,ms=0)=>{if(ms===0)queueMicrotask(fn);return 1;},clearTimeout:()=>{},requestIdleCallback:undefined,cancelIdleCallback:undefined};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('./v107-index-reconcile.js'),'utf8'),context,{filename:'v107-index-reconcile.js'});
const api=window.PadGradeProjectIndexV107;assert(api,'index controller must install');folderReady=true;

(async()=>{
  putDisk('ABCD23-pg-a.padgrade',JSON.stringify(v5('pg-a','ABCD23','A')));
  putDisk('EFGH24-pg-b.padgrade',JSON.stringify(v5('pg-b','EFGH24','B')));

  let r=await api.reconcile('first-migration');
  assert.strictEqual(r.files,2);assert.strictEqual(r.fastMatches,0);assert(projectBodyReads>=2,'schema-5 discovery must read bodies once');
  for(const name of ['ABCD23-pg-a.padgrade','EFGH24-pg-b.padgrade']){const p=JSON.parse(disk.get(name).text);assert.strictEqual(p.schemaVersion,6);assert(p._pgHeader);}
  const readsAfterFirst=projectBodyReads;

  r=await api.reconcile('second-unchanged');
  assert.strictEqual(r.zeroProjectReads,true);assert.strictEqual(r.fastMatches,2);assert.strictEqual(projectBodyReads,readsAfterFirst,'unchanged second pass must read zero project bodies');

  putDisk('JKLM25-pg-c.padgrade',v6('pg-c','JKLM25','C'));
  const readsBeforeCopy=projectBodyReads,headsBeforeCopy=headReads;
  r=await api.reconcile('copy-in');
  assert.strictEqual(r.projects,3);assert.strictEqual(projectBodyReads,readsBeforeCopy,'new schema-6 copy-in should use bounded header only');assert(headReads>headsBeforeCopy);
  assert(api.catalog().some(x=>x.id==='pg-c'));
  let loadedC=await api.loadProject('pg-c');assert.strictEqual(loadedC.settings.name,'C');

  const replaced=JSON.parse(v6('pg-c','JKLM25','C replaced'));replaced.modifiedAt='2026-08-30T13:00:00.000Z';replaced._pgHeader.modifiedAt=replaced.modifiedAt;replaced._pgHeader.catalog.name='C replaced';putDisk('JKLM25-pg-c.padgrade',JSON.stringify(replaced,null,2));
  const readsBeforeReplace=projectBodyReads;
  await api.reconcile('same-name-replacement');
  assert.strictEqual(projectBodyReads,readsBeforeReplace,'changed schema-6 same-name replacement reconciliation should use header only');assert.strictEqual(api.catalog().find(x=>x.id==='pg-c').name,'C replaced');
  loadedC=await api.loadProject('pg-c');assert(projectBodyReads>readsBeforeReplace,'stale cached body must be re-read lazily after durable replacement');assert.strictEqual(loadedC.settings.name,'C replaced');

  putDisk('MNPQ26-pg-d.padgrade',JSON.stringify(v5('pg-d','MNPQ26','D')));failNextProjectWrite=true;
  const beforeFailed=projectBodyReads;
  await api.reconcile('failed-upgrade');
  assert(projectBodyReads>beforeFailed);assert.strictEqual(JSON.parse(disk.get('MNPQ26-pg-d.padgrade').text).schemaVersion,5,'failed upgrade must leave actual file schema 5');
  const failedEntry=api.catalog().find(x=>x.id==='pg-d');assert.strictEqual(failedEntry.schemaVersion,5);assert.strictEqual(failedEntry.needsUpgrade,true);
  const beforeRetry=projectBodyReads;
  await api.reconcile('retry-upgrade');
  assert(projectBodyReads>beforeRetry,'needsUpgrade entry must not take metadata fast path');assert.strictEqual(JSON.parse(disk.get('MNPQ26-pg-d.padgrade').text).schemaVersion,6);

  const down=await api.downgradeFolderToV5();assert.strictEqual(down.ok,true);assert(down.rewritten>=4);
  for(const [name,x] of disk){if(!candidate(name))continue;const p=JSON.parse(x.text);assert.strictEqual(p.schemaVersion,5,`${name} should be schema 5 after rollback`);assert.strictEqual(p.version,5);assert(!p._pgHeader);assert.strictEqual(p.settings.legacySetting,'keep');assert.strictEqual(p.legacyTopLevel,'keep');}
  console.log('v107-index-reconcile self-test passed',{projectBodyReads,headReads,projectWrites});
})().catch(err=>{console.error(err);process.exit(1);});
