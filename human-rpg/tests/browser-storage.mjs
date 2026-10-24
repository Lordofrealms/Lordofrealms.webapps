// Run via scripts/prepare-browser-tests.mjs and the managed preview.
import * as DB from './storage-under-test.js';
import * as E from '../engine.js';
const output=document.querySelector('#results'),button=document.querySelector('#run');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function rejects(fn){try{await fn();}catch{return;}throw Error('Expected rejection.');}
function passed(message){const li=document.createElement('li');li.className='pass';li.textContent='PASS · '+message;output.append(li);}
button.addEventListener('click',async()=>{
 button.disabled=true;
 try{
  let state=await DB.saveState(E.createState({name:'Storage test',timeZone:'America/Chicago'}),0);
  assert((await DB.loadState()).revision===1,'Initial save missing.');passed('IndexedDB create, save and load');
  await rejects(()=>DB.saveState(E.clone(state),0));assert((await DB.loadState()).revision===1,'Conflict changed state.');passed('Stale revision rejected without overwriting');
  const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8c8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  const id=await DB.storePhoto(new File([bytes],'synthetic-pixel.png',{type:'image/png'}));
  E.logActivity(state,{skillId:'cooking',title:'Synthetic fixture',photos:[id]});state=await DB.saveState(state,state.revision);
  const exported=await DB.makeBackup(state),payload=await DB.readBackup(exported);
  assert(payload.photos.length===1&&payload.photos[0].id===id,'Photo reference lost.');assert(payload.state.activities[0].photos[0]===id,'Attachment reference lost.');passed('Full backup includes exact generated photo and its reference');
  state.profile.name='Newer test state';state=await DB.saveState(state,state.revision);
  state=await DB.restoreBackup(payload,state.revision);assert(state.profile.name==='Storage test','Restore content differs.');assert((await DB.getPhoto(id)).data===payload.photos[0].data,'Photo bytes differ.');
  assert((await DB.recoveryInfo()).name==='Newer test state','Recovery copy missing.');passed('Atomic restore preserves photo bytes and prior-state recovery');
  const corrupt=JSON.parse(exported);corrupt.payload.state.profile.name='Tampered';
  await rejects(()=>DB.readBackup(JSON.stringify(corrupt)));assert((await DB.loadState()).id===state.id,'Invalid import changed state.');passed('Invalid checksum leaves stored character intact');
  state=await DB.recoverPrevious(state.revision);assert(state.profile.name==='Newer test state','Recovery failed.');passed('Undo restore recovers previous character');
  const db=await DB.openStorage(),tx=db.transaction('state','readwrite'),damaged={revision:state.revision,profile:{name:'Damaged test'}};
  tx.objectStore('state').put(damaged,'current');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  await rejects(()=>DB.loadState());assert(await DB.currentRevision()===state.revision,'Damaged revision unavailable.');
  const raw=JSON.parse(await DB.exportRecoveryBundle());assert(raw.state.profile.name==='Damaged test','Raw recovery export missing.');
  state=await DB.restoreBackup(payload,await DB.currentRevision());assert(state.profile.name==='Storage test','Could not restore over damaged data.');passed('Damaged state stays exportable and can be replaced by a validated backup');
  passed('All persistence checks completed; file-picker upload remains a separate manual test.');
 }catch(err){const li=document.createElement('li');li.className='fail';li.textContent='FAIL · '+err.message;output.append(li);}
});
