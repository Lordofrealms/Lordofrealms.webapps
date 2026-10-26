import {sha256} from './checksum.js';
import {SCHEMA,validateState,clone,uid} from './engine.js';
import {VERSION} from './catalog.js';
import {MAX_ARCHIVE_BYTES,MAX_PHOTO_BYTES,photoBlob,legacyPhoto,encodeArchive,decodeArchive} from './archive.js';
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
export async function loadState(){const db=await openStorage(),value=await request(db.transaction('state','readonly').objectStore('state').get('current'));if(value)validateState(value);return value||null;}
export async function currentRevision(){const db=await openStorage(),current=await request(db.transaction('state','readonly').objectStore('state').get('current'));return revisionOf(current);}
function photoReferences(state){return new Set([...state.activities,...state.attempts].flatMap(a=>a.photos||[]));}
function validatePhotoSet(state,photos){
 const ids=new Set();if(!Array.isArray(photos)||photos.length>10000)throw Error('Unsupported photo collection.');
 for(const photo of photos){photoBlob(photo);if(ids.has(photo.id))throw Error('Duplicate photo in backup.');ids.add(photo.id);}
 for(const id of photoReferences(state))if(!ids.has(id))throw Error('Backup is missing a referenced milestone photo.');
}
async function allPhotos(){const db=await openStorage();return request(db.transaction('photos','readonly').objectStore('photos').getAll());}
async function referencedPhotos(state){const refs=photoReferences(state),included=(await allPhotos()).filter(photo=>refs.has(photo.id));validatePhotoSet(state,included);return included;}
export async function exportRecoveryBundle(){
 const db=await openStorage(),tx=db.transaction(['state','photos','recovery'],'readonly');
 const [state,photos,recovery]=await Promise.all([request(tx.objectStore('state').get('current')),request(tx.objectStore('photos').getAll()),request(tx.objectStore('recovery').get('last'))]);
 // Raw recovery deliberately does not validate a damaged state. Maps preserve original photo IDs.
 const records=[],photoMap={current:Object.create(null),recovery:Object.create(null)};
 for(const [scope,list]of [['current',photos],['recovery',recovery?.photos||[]]])for(const photo of list){const id='raw-'+records.length;photoMap[scope][photo.id]=id;records.push({...photo,id});}
 return encodeArchive({format:'human-rpg-raw-recovery',exportedAt:new Date().toISOString(),state,recovery:recovery?{state:recovery.state,savedAt:recovery.savedAt}:null,photoMap},records);
}
export async function saveState(state,expectedRevision=state.revision,newPhotos=[]){
 validateState(state);if(!Array.isArray(newPhotos)||newPhotos.length>8)throw Error('Attach up to eight photos at a time.');
 const pending=new Set();for(const photo of newPhotos){photoBlob(photo);if(pending.has(photo.id))throw Error('Duplicate new photo.');pending.add(photo.id);}
 const refs=photoReferences(state);for(const id of pending)if(!refs.has(id))throw Error('New photo has no activity or milestone reference.');
 const db=await openStorage(),tx=db.transaction(['state','photos'],'readwrite'),store=tx.objectStore('state'),media=tx.objectStore('photos'),finished=done(tx);finished.catch(()=>{});
 try{
  const [current,keys]=await Promise.all([request(store.get('current')),request(media.getAllKeys())]);
  if(revisionOf(current)!==expectedRevision)throw new ConflictError();
  const existing=new Set(keys);for(const id of pending)if(existing.has(id))throw Error('Photo ID already exists.');
  for(const id of refs)if(!existing.has(id)&&!pending.has(id))throw Error('A referenced photo is missing. Your saved character has not been replaced.');
  if(newPhotos.length){
   const previous=await request(media.getAll()),combined=[...previous,...newPhotos].filter(photo=>refs.has(photo.id));
   const size=combined.reduce((sum,photo)=>sum+photoBlob(photo).size,0);
   if(combined.length>10000||size>MAX_ARCHIVE_BYTES-66*1024*1024)throw Error('This addition exceeds the ZIP photo capacity. No photos or activity were saved. Export a backup and select fewer or smaller photos.');
  }
  const next=clone(state);next.version=VERSION;next.revision=revisionOf(current)+1;next.updatedAt=new Date().toISOString();
  for(const photo of newPhotos)media.put(photo,photo.id);store.put(next,'current');await finished;return next;
 }catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});throw error;}
}
export function preparePhoto(file){
 if(!(file instanceof Blob)||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG, or WebP photo.');
 if(!file.size||file.size>MAX_PHOTO_BYTES)throw Error('Choose a photo between 1 byte and 12 MiB. Your original photo will not be changed.');
 return {id:uid(),name:String(file.name||'milestone').slice(0,180),type:file.type,blob:file.slice(0,file.size,file.type),size:file.size,createdAt:new Date().toISOString()};
}
export async function getPhoto(id){const db=await openStorage();return request(db.transaction('photos','readonly').objectStore('photos').get(id));}
export async function makeArchiveBackup(state,onProgress){
 validateState(state);return encodeArchive({format:'human-rpg-backup',schema:SCHEMA,version:VERSION,exportedAt:new Date().toISOString(),state:clone(state)},await referencedPhotos(state),onProgress);
}
export async function makeBackup(state){
 validateState(state);const photos=await referencedPhotos(state);
 const estimate=new Blob([JSON.stringify(state)]).size+photos.reduce((sum,p)=>sum+Math.ceil(photoBlob(p).size/3)*4+1024,0);
 if(estimate>MAX_BACKUP_BYTES-1024)throw Error('Legacy JSON exceeds 100 MiB. Use the full ZIP backup; it includes original photos and supports up to 1 GiB.');
 const included=[];for(const photo of photos)included.push(await legacyPhoto(photo));
 const payload={format:'human-rpg-backup',schema:SCHEMA,version:VERSION,exportedAt:new Date().toISOString(),state:clone(state),photos:included};
 const body=JSON.stringify(payload),wrapper=JSON.stringify({payload,sha256:await sha256(body)});
 if(new Blob([wrapper]).size>MAX_BACKUP_BYTES)throw Error('Legacy JSON exceeds 100 MiB. Use the full ZIP backup.');
 return wrapper;
}
export async function readBackup(fileOrText){
 if(fileOrText instanceof Blob){
  if(fileOrText.size>MAX_ARCHIVE_BYTES)throw Error('Backup exceeds the 1 GiB supported archive limit. Your character is unchanged.');
  const signature=new Uint8Array(await fileOrText.slice(0,4).arrayBuffer());
  if(signature[0]===80&&signature[1]===75){
   const payload=await decodeArchive(fileOrText);if(payload.schema!==SCHEMA)throw Error('Unsupported character schema.');
   validateState(payload.state);validatePhotoSet(payload.state,payload.photos);return payload;
  }
  if(fileOrText.size>MAX_BACKUP_BYTES)throw Error('Legacy JSON exceeds 100 MiB. Export a ZIP backup from the source device.');
 }
 const text=typeof fileOrText==='string'?fileOrText:await fileOrText.text();
 if(new Blob([text]).size>MAX_BACKUP_BYTES)throw Error('Legacy JSON exceeds 100 MiB. Use a ZIP backup.');
 let wrapper;try{wrapper=JSON.parse(text);}catch{throw Error('The selected file is not valid JSON or a supported ZIP. Your current character is unchanged.');}
 const payload=wrapper?.payload;if(payload?.format!=='human-rpg-backup'||payload.schema!==SCHEMA||!Array.isArray(payload.photos))throw Error('Unsupported backup format.');
 if(typeof wrapper.sha256!=='string'||wrapper.sha256!==await sha256(JSON.stringify(payload)))throw Error('Backup integrity check failed. Your current character is unchanged.');
 validateState(payload.state);validatePhotoSet(payload.state,payload.photos);return payload;
}
export async function restoreBackup(payload,expectedRevision){
 validateState(payload.state);validatePhotoSet(payload.state,payload.photos);
 const db=await openStorage(),tx=db.transaction(['state','photos','recovery'],'readwrite'),finished=done(tx);finished.catch(()=>{});
 try{
  const current=await request(tx.objectStore('state').get('current'));
  if(revisionOf(current)!==expectedRevision)throw new ConflictError();
  const previousPhotos=await request(tx.objectStore('photos').getAll());
  if(current)tx.objectStore('recovery').put({state:current,photos:previousPhotos,savedAt:new Date().toISOString()},'last');
  const next=clone(payload.state);next.version=VERSION;next.revision=revisionOf(current)+1;next.updatedAt=new Date().toISOString();next.audit.push({id:uid(),type:'backup-restored',date:next.updatedAt,sourceExport:payload.exportedAt});
  tx.objectStore('photos').clear();for(const photo of payload.photos)tx.objectStore('photos').put(photo,photo.id);tx.objectStore('state').put(next,'current');await finished;return next;
 }catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});throw error;}
}
export async function recoveryInfo(){const db=await openStorage(),r=await request(db.transaction('recovery','readonly').objectStore('recovery').get('last'));return r?{name:r.state?.profile?.name||'Saved recovery copy',savedAt:r.savedAt}:null;}
export async function recoverPrevious(expectedRevision){const db=await openStorage(),previous=await request(db.transaction('recovery','readonly').objectStore('recovery').get('last'));if(!previous)throw Error('There is no pre-restore snapshot.');return restoreBackup({...previous,exportedAt:previous.savedAt},expectedRevision);}
export async function storageStatus(){return {persisted:await navigator.storage?.persisted?.()||false,estimate:await navigator.storage?.estimate?.()||null};}
export async function requestPersistence(){return await navigator.storage?.persist?.()||false;}
