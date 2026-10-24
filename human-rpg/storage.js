import {sha256} from './checksum.js';
import {SCHEMA,validateState,clone,uid} from './engine.js';
import {VERSION} from './catalog.js';
const DB_NAME='human-rpg-local-v1';
const revisionOf=current=>Number.isSafeInteger(current?.revision)&&current.revision>=0?current.revision:0;
const MAX_BACKUP_BYTES=100*1024*1024;
let dbPromise;
export class ConflictError extends Error {constructor(){super('Another tab saved a newer character. Reload this tab before making changes.');this.name='ConflictError';}}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Local storage request failed.'));});}
function done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Local transaction failed.'));tx.onabort=()=>reject(tx.error||Error('Local transaction was rolled back.'));});}
export function openStorage(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error('This browser does not provide the local database. Your character has not been replaced.'));return;}
  const r=indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=()=>{for(const name of ['state','photos','recovery'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);};
  r.onerror=()=>reject(r.error||Error('Could not open your local character.'));
  r.onblocked=()=>reject(Error('Close other Human RPG tabs to finish opening local storage.'));
  r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};
 });
 return dbPromise;
}
export async function loadState(){const db=await openStorage(),tx=db.transaction('state','readonly'),value=await request(tx.objectStore('state').get('current'));if(value)validateState(value);return value||null;}
export async function currentRevision(){const db=await openStorage(),current=await request(db.transaction('state','readonly').objectStore('state').get('current'));return revisionOf(current);}
export async function exportRecoveryBundle(){
 const db=await openStorage(),tx=db.transaction(['state','photos','recovery'],'readonly');
 const [state,photos,recovery]=await Promise.all([request(tx.objectStore('state').get('current')),request(tx.objectStore('photos').getAll()),request(tx.objectStore('recovery').get('last'))]);
 return JSON.stringify({format:'human-rpg-raw-recovery',exportedAt:new Date().toISOString(),state,photos,recovery});
}
export async function saveState(state,expectedRevision=state.revision){
 validateState(state);const db=await openStorage(),tx=db.transaction('state','readwrite'),store=tx.objectStore('state');let failure;
 const finished=done(tx);finished.catch(()=>{});
 try{
  const current=await request(store.get('current'));
  if((revisionOf(current))!==expectedRevision){failure=new ConflictError();tx.abort();throw failure;}
  const next=clone(state);next.revision=(revisionOf(current))+1;next.updatedAt=new Date().toISOString();store.put(next,'current');await finished;return next;
 }catch(e){throw failure||e;}
}
export async function storePhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG, or WebP photo.');
 if(file.size>12*1024*1024)throw Error('Choose a photo smaller than 12 MB. Your original photo will not be changed.');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('The photo could not be read.'));r.readAsDataURL(file);});
 const photo={id:uid(),name:file.name.slice(0,180),type:file.type,data,size:file.size,createdAt:new Date().toISOString()};validatePhoto(photo);
 const db=await openStorage(),tx=db.transaction('photos','readwrite'),finished=done(tx);tx.objectStore('photos').put(photo,photo.id);await finished;return photo.id;
}
export async function getPhoto(id){const db=await openStorage();return request(db.transaction('photos','readonly').objectStore('photos').get(id));}
async function photos(){const db=await openStorage();return request(db.transaction('photos','readonly').objectStore('photos').getAll());}
function photoReferences(state){return new Set([...state.activities,...state.attempts].flatMap(a=>a.photos||[]));}
function validatePhoto(photo){
 if(!photo||typeof photo.id!=='string'||!['image/jpeg','image/png','image/webp'].includes(photo.type)||typeof photo.data!=='string'||photo.data.length>17*1024*1024||!photo.data.startsWith(`data:${photo.type};base64,`)||!/^[A-Za-z0-9+/]*={0,2}$/.test(photo.data.split(',')[1]||''))throw Error('Backup contains an invalid photo.');
 return true;
}

export async function makeBackup(state){
 validateState(state);const refs=photoReferences(state),all=await photos(),included=all.filter(p=>refs.has(p.id));for(const id of refs)if(!included.some(p=>p.id===id))throw Error('A referenced photo is missing. Resolve storage recovery before exporting an incomplete backup.');
 const payload={format:'human-rpg-backup',schema:SCHEMA,version:VERSION,exportedAt:new Date().toISOString(),state:clone(state),photos:included};
 const body=JSON.stringify(payload);if(new Blob([body]).size>MAX_BACKUP_BYTES)throw Error('This backup exceeds 100 MB. Keep the character intact and export fewer large milestone photos in a future media-management update.');
 return JSON.stringify({payload,sha256:await sha256(body)});
}
export async function readBackup(fileOrText){
 const text=typeof fileOrText==='string'?fileOrText:await fileOrText.text();if(new Blob([text]).size>MAX_BACKUP_BYTES)throw Error('Backup exceeds the supported 100 MB limit.');
 let wrapper;try{wrapper=JSON.parse(text);}catch{throw Error('The selected file is not valid JSON. Your current character is unchanged.');}
 const p=wrapper?.payload;if(p?.format!=='human-rpg-backup'||p.schema!==SCHEMA||!Array.isArray(p.photos)||p.photos.length>10000)throw Error('Unsupported backup format.');
 if(typeof wrapper.sha256!=='string'||wrapper.sha256!==await sha256(JSON.stringify(p)))throw Error('Backup integrity check failed. Your current character is unchanged.');
 validateState(p.state);const ids=new Set();for(const photo of p.photos){validatePhoto(photo);if(ids.has(photo.id))throw Error('Duplicate photo in backup.');ids.add(photo.id);}
 for(const id of photoReferences(p.state))if(!ids.has(id))throw Error('Backup is missing a referenced milestone photo.');
 return p;
}
export async function restoreBackup(payload,expectedRevision){
 validateState(payload.state);payload.photos.forEach(validatePhoto);
 const db=await openStorage(),tx=db.transaction(['state','photos','recovery'],'readwrite'),finished=done(tx);finished.catch(()=>{});
 const current=await request(tx.objectStore('state').get('current'));
 if((revisionOf(current))!==expectedRevision){tx.abort();throw new ConflictError();}
 const previousPhotos=await request(tx.objectStore('photos').getAll());
 if(current)tx.objectStore('recovery').put({state:current,photos:previousPhotos,savedAt:new Date().toISOString()},'last');
 const next=clone(payload.state);next.revision=(revisionOf(current))+1;next.updatedAt=new Date().toISOString();next.audit.push({id:uid(),type:'backup-restored',date:next.updatedAt,sourceExport:payload.exportedAt});
 tx.objectStore('photos').clear();for(const p of payload.photos)tx.objectStore('photos').put(p,p.id);tx.objectStore('state').put(next,'current');await finished;return next;
}
export async function recoveryInfo(){const db=await openStorage();const r=await request(db.transaction('recovery','readonly').objectStore('recovery').get('last'));return r?{name:r.state?.profile?.name||'Saved recovery copy',savedAt:r.savedAt}:null;}
export async function recoverPrevious(expectedRevision){const db=await openStorage();const previous=await request(db.transaction('recovery','readonly').objectStore('recovery').get('last'));if(!previous)throw Error('There is no pre-restore snapshot.');return restoreBackup({...previous,exportedAt:previous.savedAt},expectedRevision);}
export async function storageStatus(){return {persisted:await navigator.storage?.persisted?.()||false,estimate:await navigator.storage?.estimate?.()||null};}
export async function requestPersistence(){return await navigator.storage?.persist?.()||false;}
