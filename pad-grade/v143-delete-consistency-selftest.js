'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');

class Store{
  constructor(){this.m=new Map();}
  getItem(k){return this.m.has(k)?this.m.get(k):null;}
  setItem(k,v){this.m.set(k,String(v));}
  removeItem(k){this.m.delete(k);}
  clear(){this.m.clear();}
}
const localStorage=new Store();
const rows=[];
const document={
  title:'',
  querySelectorAll(sel){return sel==='[data-id]'?rows.filter(r=>!r.removed):[];},
  querySelector(){return null;},
  getElementById(){return null;}
};
const window={PadGradeDiag:null,confirm:()=>true,alert:msg=>{throw new Error('unexpected alert: '+msg);},dispatchEvent(){},location:{reload(){window.reloads++;}},reloads:0};
const context={window,document,localStorage,location:window.location,CustomEvent:function(type,init){this.type=type;this.detail=init?.detail;},setTimeout:(fn)=>{fn();return 1;},clearTimeout(){},Promise,Date,Set,Map,JSON,String,Number,Array,Object,console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'v143-delete-consistency.js'),'utf8'),context,{filename:'v143-delete-consistency.js'});

const P='padGradeProjectV5:', IDX='padGradeProjectsV5', ACTIVE='padGradeActiveProjectIdV5';
function seedLocal(items,active,bodies={}){
  localStorage.clear();rows.length=0;window.reloads=0;
  localStorage.setItem(IDX,JSON.stringify(items));localStorage.setItem(ACTIVE,active);
  for(const [id,p] of Object.entries(bodies))localStorage.setItem(P+id,JSON.stringify(p));
  for(const x of items)rows.push({dataset:{id:x.id},removed:false,remove(){this.removed=true;}});
}
function runtime(initialProjects,fileEntries,{staleFirst=false}={}){
  const store=new Map(Object.entries(fileEntries));
  const deleted=[];
  let durableIndex={format:'PadGradeProjectIndex',indexVersion:1,projects:JSON.parse(JSON.stringify(initialProjects))};
  let catalog=JSON.parse(JSON.stringify(initialProjects));
  let reconcileCount=0;
  const files={
    list:()=>[...store.keys()],
    read:async n=>store.has(n)?store.get(n):null,
    write:async(n,t)=>{store.set(n,String(t));return true;},
    delete:async n=>{deleted.push(n);return store.delete(n);},
    deleteResult:async n=>{deleted.push(n);const ok=store.delete(n);return {ok};}
  };
  function freshRows(){
    const out=[];
    for(const [name,text] of store){
      if(!/\.(padgrade|json)$/i.test(name))continue;
      let raw=null;try{raw=JSON.parse(text);}catch(e){continue;}
      if(Array.isArray(raw.projects))raw.projects.forEach((p,i)=>{if(p?.id)out.push({projectId:p.id,id:p.id,filename:name,backupIndex:i,fileId:p.fileId||null});});
      else if(raw?.id)out.push({projectId:raw.id,id:raw.id,filename:name,backupIndex:null,fileId:raw.fileId||null});
    }
    return out;
  }
  const api={
    catalog:()=>catalog.map(x=>({...x,id:x.projectId})),
    readIndex:async()=>JSON.parse(JSON.stringify(durableIndex)),
    writeIndex:async state=>{durableIndex=JSON.parse(JSON.stringify(state));catalog=JSON.parse(JSON.stringify(state.projects||[]));return true;},
    reconcile:async()=>{
      reconcileCount++;
      if(staleFirst&&reconcileCount===1){catalog=JSON.parse(JSON.stringify(initialProjects));durableIndex.projects=JSON.parse(JSON.stringify(initialProjects));return {stale:true};}
      catalog=freshRows();durableIndex.projects=JSON.parse(JSON.stringify(catalog));return {stale:false};
    }
  };
  window.PadGradeFiles=files;window.PadGradeProjectIndexV107=api;
  return {store,deleted,api,getIndex:()=>durableIndex,reconcileCount:()=>reconcileCount};
}
function p(id,fileId,name=id){return {id,fileId,status:'open',settings:{name},readings:{},modifiedAt:'2026-09-02T00:00:00Z'};}
function item(id,fileId,name=id){return {id,fileId,name,status:'open',modifiedAt:'2026-09-02T00:00:00Z',durableFilename:`${fileId}-${id}.padgrade`};}

(async()=>{
  // 1) Exact prefixed deletion wins, stale first reconcile cannot resurrect the row, heat cache is removed.
  seedLocal([item('A','AAAA22'),item('B','BBBB22'),item('C','CCCC22')],'A',{A:p('A','AAAA22'),B:p('B','BBBB22'),C:p('C','CCCC22')});
  const r1=runtime([
    {projectId:'A',filename:'AAAA22-A.padgrade',backupIndex:null},
    {projectId:'B',filename:'BBBB22-B.padgrade',backupIndex:null},
    {projectId:'C',filename:'CCCC22-C.padgrade',backupIndex:null}
  ],{
    'AAAA22-A.padgrade':JSON.stringify(p('A','AAAA22')),
    'BBBB22-B.padgrade':JSON.stringify(p('B','BBBB22')),
    'CCCC22-C.padgrade':JSON.stringify(p('C','CCCC22')),
    'Pad-Grade-Heat-B.pgheatcache':'heat',
    'Pad-Grade-Settings.pgsettings':JSON.stringify({lastProjectId:'A'})
  },{staleFirst:true});
  const out1=await window.PadGradeDeleteConsistencyV143.deleteProject('B',{confirmed:true,noReload:true});
  assert.equal(out1.ok,true);assert(r1.deleted.includes('BBBB22-B.padgrade'));assert(!r1.deleted.includes('B.padgrade'));
  assert(r1.deleted.includes('Pad-Grade-Heat-B.pgheatcache'));assert.equal(localStorage.getItem(P+'B'),null);
  assert(!JSON.parse(localStorage.getItem(IDX)).some(x=>x.id==='B'));assert(!r1.getIndex().projects.some(x=>x.projectId==='B'));
  assert.equal(rows.find(x=>x.dataset.id==='B').removed,true);assert(r1.reconcileCount()>=2);

  // 2) Deleting the active project updates durable lastProjectId before removal.
  seedLocal([item('A','AAAA22'),item('C','CCCC22')],'C',{A:p('A','AAAA22'),C:p('C','CCCC22')});
  const r2=runtime([
    {projectId:'A',filename:'AAAA22-A.padgrade',backupIndex:null},
    {projectId:'C',filename:'CCCC22-C.padgrade',backupIndex:null}
  ],{
    'AAAA22-A.padgrade':JSON.stringify(p('A','AAAA22')),
    'CCCC22-C.padgrade':JSON.stringify(p('C','CCCC22')),
    'Pad-Grade-Settings.pgsettings':JSON.stringify({lastProjectId:'C',appPrefs:{diagnosticLogging:true}})
  });
  const out2=await window.PadGradeDeleteConsistencyV143.deleteProject('C',{confirmed:true,noReload:true});
  assert.equal(out2.ok,true);assert.equal(localStorage.getItem(ACTIVE),'A');
  const settings=JSON.parse(r2.store.get('Pad-Grade-Settings.pgsettings'));assert.equal(settings.lastProjectId,'A');assert.equal(settings.appPrefs.diagnosticLogging,true);

  // 3) An already-missing durable file (the field-log ghost case) is still cleaned from local + durable indexes.
  seedLocal([item('A','AAAA22'),item('G','GGGG22')],'A',{A:p('A','AAAA22')});
  const r3=runtime([
    {projectId:'A',filename:'AAAA22-A.padgrade',backupIndex:null},
    {projectId:'G',filename:'GGGG22-G.padgrade',backupIndex:null}
  ],{'AAAA22-A.padgrade':JSON.stringify(p('A','AAAA22'))});
  const out3=await window.PadGradeDeleteConsistencyV143.deleteProject('G',{confirmed:true,noReload:true});
  assert.equal(out3.ok,true);assert(!r3.getIndex().projects.some(x=>x.projectId==='G'));assert(!JSON.parse(localStorage.getItem(IDX)).some(x=>x.id==='G'));

  // 4) A project sourced from a shared all-project backup is removed by rewriting the backup, not deleting the other project.
  seedLocal([item('A','AAAA22'),item('D','DDDD22')],'A',{A:p('A','AAAA22'),D:p('D','DDDD22')});
  const backup={backupType:'all-projects',activeProjectId:'D',projects:[p('D','DDDD22'),p('E','EEEE22')]};
  const r4=runtime([
    {projectId:'A',filename:'AAAA22-A.padgrade',backupIndex:null},
    {projectId:'D',filename:'bundle.json',backupIndex:0},
    {projectId:'E',filename:'bundle.json',backupIndex:1}
  ],{'AAAA22-A.padgrade':JSON.stringify(p('A','AAAA22')),'bundle.json':JSON.stringify(backup)});
  const out4=await window.PadGradeDeleteConsistencyV143.deleteProject('D',{confirmed:true,noReload:true});
  assert.equal(out4.ok,true);const afterBackup=JSON.parse(r4.store.get('bundle.json'));assert.deepEqual(afterBackup.projects.map(x=>x.id),['E']);assert.equal(afterBackup.activeProjectId,'E');assert(r4.store.has('bundle.json'));

  console.log('v1.4.3 deletion consistency selftest passed');
})().catch(err=>{console.error(err);process.exit(1);});
