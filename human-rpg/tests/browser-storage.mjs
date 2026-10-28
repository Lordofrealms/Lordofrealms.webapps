// Generated synthetic data only; never uploads files or touches the app's character DB.
import * as DB from './storage-under-test.js';
import * as E from '../engine.js';
import {photoBlob,legacyPhoto,readStoredZip,MAX_PHOTO_BYTES} from '../archive.js';
const output=document.querySelector('#results'),button=document.querySelector('#run');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function rejects(fn){try{await fn();}catch{return;}throw Error('Expected rejection.');}
function passed(message){const li=document.createElement('li');li.className='pass';li.textContent='PASS · '+message;output.append(li);}
const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8c8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
const prepared=()=>DB.preparePhoto(new File([bytes],'synthetic-pixel.png',{type:'image/png'}));
async function sameBytes(a,b){const left=new Uint8Array(await photoBlob(a).arrayBuffer()),right=new Uint8Array(await photoBlob(b).arrayBuffer());assert(left.length===right.length&&left.every((value,index)=>value===right[index]),'Photo bytes changed.');}
button.addEventListener('click',async()=>{
 button.disabled=true;
 try{
  let state=await DB.saveState(E.createState({name:'Storage test',timeZone:'America/Chicago'}),0);
  assert((await DB.loadState()).revision===1,'Initial save missing.');passed('IndexedDB create, save and load');
  const pending=prepared(),stale=E.clone(state);E.logActivity(stale,{skillId:'cooking',photos:[pending.id]});
  await rejects(()=>DB.saveState(stale,0,[pending]));assert(!(await DB.getPhoto(pending.id)),'Stale save left a photo.');passed('Stale state and photo save rejected together');
  const p=prepared();p.id='__proto__';E.logActivity(state,{skillId:'cooking',title:'Synthetic fixture',photos:[p.id]});state=await DB.saveState(state,state.revision,[p]);
  await sameBytes(await DB.getPhoto(p.id),p);passed('Activity and original photo saved in one transaction');
  const first=prepared(),bad={...prepared(),uncloneable:()=>{}},draft=E.clone(state),rev=state.revision;
  E.logActivity(draft,{skillId:'cooking',photos:[first.id,bad.id]});
  await rejects(()=>DB.saveState(draft,rev,[first,bad]));
  assert((await DB.loadState()).revision===rev&&!(await DB.getPhoto(first.id))&&!(await DB.getPhoto(bad.id)),'Failed photo write was not atomic.');passed('Injected photo write failure rolls back earlier photo and character writes');
  const exported=await DB.makeArchiveBackup(state),payload=await DB.readBackup(exported);
  assert(payload.photos.length===1&&payload.photos[0].id===p.id&&payload.state.activities[0].photos[0]===p.id,'Attachment lost.');await sameBytes(payload.photos[0],p);passed('ZIP backup preserves exact photo bytes and references');
  const legacy=await DB.makeBackup(state),legacyPayload=await DB.readBackup(legacy);assert(legacyPayload.photos[0].data===(await legacyPhoto(p)).data,'Legacy conversion changed bytes.');passed('Legacy JSON export and import preserve binary photo bytes');
  state.profile.name='Newer test state';state=await DB.saveState(state,state.revision);
  state=await DB.restoreBackup(payload,state.revision);assert(state.profile.name==='Storage test','Restore differs.');await sameBytes(await DB.getPhoto(p.id),p);
  assert((await DB.recoveryInfo()).name==='Newer test state','Recovery missing.');passed('Atomic ZIP restore retains photo bytes and pre-restore recovery');
  const corrupt=new Uint8Array(await exported.arrayBuffer());corrupt[50]^=1;
  await rejects(()=>DB.readBackup(new Blob([corrupt])));assert((await DB.loadState()).revision===state.revision,'Invalid import changed state.');passed('Corrupt archive rejected before replacement');
  const missing={...payload,photos:[]};await rejects(()=>DB.restoreBackup(missing,state.revision));assert((await DB.loadState()).revision===state.revision,'Missing photo restore changed state.');passed('Direct restore rejects missing photos without changing state');
  state=await DB.recoverPrevious(state.revision);assert(state.profile.name==='Newer test state','Recovery failed.');await sameBytes(await DB.getPhoto(p.id),p);passed('Undo restore recovers state and photos');
  state=await DB.restoreBackup(legacyPayload,state.revision);assert(typeof (await DB.getPhoto(p.id)).data==='string','Legacy photo format not retained.');await sameBytes(await DB.getPhoto(p.id),p);passed('Old JSON backup restores without requiring a database migration');
  const db=await DB.openStorage(),tx=db.transaction('state','readwrite');tx.objectStore('state').put({revision:state.revision,profile:{name:'Damaged test'}},'current');
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  await rejects(()=>DB.loadState());
  const rawFiles=await readStoredZip(await DB.exportRecoveryBundle(),{recovery:true}),raw=JSON.parse(await rawFiles.get('human-rpg.json').text());
  assert(raw.state.profile.name==='Damaged test'&&raw.photos.length===2,'Raw recovery missing current/prior data.');
  assert(raw.photoMap.current[p.id]&&raw.photoMap.recovery[p.id]&&raw.photoMap.current[p.id]!==raw.photoMap.recovery[p.id],'Raw photo-ID mappings were not preserved.');
  state=await DB.restoreBackup(payload,await DB.currentRevision());assert(state.profile.name==='Storage test','Damaged-state restore failed.');passed('Raw recovery ZIP preserves damaged records and both photo collections');
  const img=document.createElement('img'),url=URL.createObjectURL(photoBlob(await DB.getPhoto(p.id)));img.src=url;img.alt='Generated one-pixel test photo';output.after(img);await img.decode();assert(img.naturalWidth===1,'Stored image did not decode.');URL.revokeObjectURL(url);passed('Restored binary photo renders as an image');
  passed('All persistence checks completed; file-picker testing remains separate.');
  document.querySelector('#large').disabled=false;
 }catch(err){const li=document.createElement('li');li.className='fail';li.textContent='FAIL · '+err.message;output.append(li);}
});
let largeFile;
document.querySelector('#large').addEventListener('click',async event=>{
 event.target.disabled=true;
 try{
  let state=await DB.loadState();
  const file=new File([bytes,new Uint8Array(MAX_PHOTO_BYTES-bytes.length)],'synthetic-padded-pixel.png',{type:'image/png'}),photos=Array.from({length:9},()=>DB.preparePhoto(file));
  for(const batch of [photos.slice(0,8),photos.slice(8)]){
   E.logActivity(state,{skillId:'cooking',title:'Generated large-photo fixture',photos:batch.map(p=>p.id)});
   state=await DB.saveState(state,state.revision,batch);
  }
  passed('108 MiB of generated photo bytes saved to isolated IndexedDB');
  largeFile=await DB.makeArchiveBackup(state);assert(largeFile.size>108*1024*1024,'Expected a large ZIP.');
  const payload=await DB.readBackup(largeFile);state=await DB.restoreBackup(payload,state.revision);
  assert((await DB.loadState()).revision===state.revision,'Large restore did not persist.');
  for(const photo of photos)await sameBytes(await DB.getPhoto(photo.id),photo);
  await rejects(()=>DB.makeBackup(state));
  passed('Large ZIP export, validation, atomic restore and exact bytes passed; oversized legacy JSON rejected');
  document.querySelector('#download-large').disabled=false;
 }catch(err){const li=document.createElement('li');li.className='fail';li.textContent='FAIL · '+err.message;output.append(li);}
});
document.querySelector('#download-large').addEventListener('click',()=>{
 if(!largeFile)return;const url=URL.createObjectURL(largeFile),a=document.createElement('a');a.href=url;a.download='human-rpg-synthetic-large.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
});
