// Standard ZIP, stored entries only. No compression, encryption, extraction or network access.
// Format reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
import {sha256} from './checksum.js';
export const MAX_ARCHIVE_BYTES=1024*1024*1024;
export const MAX_PHOTO_BYTES=12*1024*1024;
const MAX_MANIFEST_BYTES=64*1024*1024;
function archiveLimits(recovery=false){const scale=recovery?2:1;return {bytes:MAX_ARCHIVE_BYTES*scale,manifest:MAX_MANIFEST_BYTES*scale,photos:10000*scale,entries:10000*scale+2,headroom:2*1024*1024*scale,label:scale+' GiB'};}
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const photoTypes={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(data){let crc=0xffffffff;for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const fail=message=>{throw Error('Backup rejected: '+message);};
function safePath(path){return path==='human-rpg.json'||path==='integrity.sha256'||/^photos\/\d{6}\.(jpg|png|webp)$/.test(path);}
function maxEntryBytes(path,limits){return path==='integrity.sha256'?64:path==='human-rpg.json'?limits.manifest:MAX_PHOTO_BYTES;}
function header(length){const data=new Uint8Array(length);return {data,view:new DataView(data.buffer)};}
function photoMetadata(photo){
 if(!photo||typeof photo.id!=='string'||!photo.id||photo.id.length>512||!Object.hasOwn(photoTypes,photo.type))fail('invalid photo.');
 if(photo.name!==undefined&&(typeof photo.name!=='string'||photo.name.length>180))fail('invalid photo name.');
}
export function photoBlob(photo){
 photoMetadata(photo);
 if(photo.blob instanceof Blob){if(photo.blob.type!==photo.type||!photo.blob.size||photo.blob.size>MAX_PHOTO_BYTES)fail('invalid photo size or type.');return photo.blob;}
 const prefix='data:'+photo.type+';base64,';
 if(typeof photo.data!=='string'||photo.data.length>17*1024*1024||!photo.data.startsWith(prefix))fail('invalid photo.');
 const encoded=photo.data.slice(prefix.length);
 if(!encoded||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('invalid photo encoding.');
 const binary=atob(encoded);if(!binary.length||binary.length>MAX_PHOTO_BYTES)fail('invalid photo size.');
 return new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:photo.type});
}
export async function legacyPhoto(photo){
 const blob=photoBlob(photo);if(photo.data)return {...photo,blob:undefined,size:blob.size};
 const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
 for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return {id:photo.id,name:photo.name||'milestone.'+photoTypes[photo.type],type:photo.type,size:blob.size,createdAt:photo.createdAt,data:'data:'+photo.type+';base64,'+btoa(binary)};
}
export async function createStoredZip(entries,{recovery=false}={}){
 const limits=archiveLimits(recovery);
 if(!Array.isArray(entries)||entries.length<1||entries.length>limits.entries)fail('unsupported archive entry count.');
 const parts=[],directory=[],paths=new Set();let offset=0,centralSize=0;
 for(const {path,blob} of entries){
  if(!safePath(path)||paths.has(path))fail('unsafe or duplicate archive path.');paths.add(path);
  if(!(blob instanceof Blob)||blob.size>maxEntryBytes(path,limits))fail('archive entry exceeds its supported size.');
  const name=encoder.encode(path),data=new Uint8Array(await blob.arrayBuffer()),crc=crc32(data);
  const local=header(30);local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(12,33,true);
  local.view.setUint32(14,crc,true);local.view.setUint32(18,blob.size,true);local.view.setUint32(22,blob.size,true);local.view.setUint16(26,name.length,true);
  const central=header(46);central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint16(14,33,true);
  central.view.setUint32(16,crc,true);central.view.setUint32(20,blob.size,true);central.view.setUint32(24,blob.size,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,offset,true);
  offset+=30+name.length+blob.size;centralSize+=46+name.length;
  if(offset+centralSize+22>limits.bytes)throw Error('ZIP backup exceeds the '+limits.label+' archive limit. Your saved character and photos are unchanged.');
  parts.push(local.data,name,blob);directory.push(central.data,name);
 }
 const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,entries.length,true);end.view.setUint16(10,entries.length,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
 return new Blob([...parts,...directory,end.data],{type:'application/zip'});
}
export async function readStoredZip(file,{recovery=false}={}){
 const limits=archiveLimits(recovery);
 if(!(file instanceof Blob)||file.size<22||file.size>limits.bytes)fail('ZIP must be at most '+limits.label+'.');
 const end=new DataView(await file.slice(-22).arrayBuffer());
 if(end.getUint32(0,true)!==0x06054b50||end.getUint16(4,true)||end.getUint16(6,true)||end.getUint16(20,true))fail('unsupported or truncated ZIP footer.');
 const count=end.getUint16(10,true),size=end.getUint32(12,true),start=end.getUint32(16,true);
 if(count<1||count>limits.entries||end.getUint16(8,true)!==count||start+size!==file.size-22||size>limits.entries*128)fail('invalid ZIP directory.');
 const bytes=new Uint8Array(await file.slice(start,start+size).arrayBuffer()),view=new DataView(bytes.buffer),entries=new Map(),ranges=[];let pos=0;
 for(let n=0;n<count;n++){
  if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)fail('invalid ZIP entry.');
  const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),crc=view.getUint32(pos+16,true),length=view.getUint32(pos+20,true),nameLength=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
  if(flags||method||extra||comment||view.getUint16(pos+34,true)||view.getUint32(pos+24,true)!==length||nameLength>80||pos+46+nameLength>bytes.length)fail('only original, uncompressed Human RPG ZIP backups are supported.');
  let path;try{path=decoder.decode(bytes.subarray(pos+46,pos+46+nameLength));}catch{fail('invalid archive path.');}
  if(!safePath(path)||entries.has(path)||length>maxEntryBytes(path,limits)||offset+30+nameLength+length>start)fail('unsafe, duplicate or oversized ZIP entry.');
  const localBytes=new Uint8Array(await file.slice(offset,offset+30+nameLength).arrayBuffer()),local=new DataView(localBytes.buffer);
  if(localBytes.length!==30+nameLength||local.getUint32(0,true)!==0x04034b50||local.getUint16(6,true)||local.getUint16(8,true)||local.getUint32(14,true)!==crc||local.getUint32(18,true)!==length||local.getUint32(22,true)!==length||local.getUint16(26,true)!==nameLength||local.getUint16(28,true)||decoder.decode(localBytes.subarray(30))!==path)fail('ZIP local and directory records disagree.');
  const blob=file.slice(offset+30+nameLength,offset+30+nameLength+length);
  if(crc32(new Uint8Array(await blob.arrayBuffer()))!==crc)fail('ZIP integrity check failed.');
  entries.set(path,blob);ranges.push([offset,offset+30+nameLength+length]);pos+=46+nameLength;
 }
 if(pos!==bytes.length)fail('unexpected ZIP directory data.');
 ranges.sort((a,b)=>a[0]-b[0]);let expected=0;for(const [a,b]of ranges){if(a!==expected)fail('overlapping or unexpected ZIP data.');expected=b;}
 if(expected!==start)fail('unexpected ZIP data.');return entries;
}
export async function encodeArchive(payload,photos,onProgress=()=>{}){
 const recovery=payload.format==='human-rpg-raw-recovery',limits=archiveLimits(recovery);
 if(!Array.isArray(photos)||photos.length>limits.photos)fail('too many photos.');
 const entries=[],metadata=[],ids=new Set();let photoBytes=0;
 for(let i=0;i<photos.length;i++){
  const photo=photos[i],blob=photoBlob(photo);if(ids.has(photo.id))fail('duplicate photo.');ids.add(photo.id);
  photoBytes+=blob.size;if(photoBytes>limits.bytes-limits.manifest-limits.headroom)throw Error('Photo collection exceeds the ZIP backup capacity. Your saved data is unchanged.');
  const path='photos/'+String(i+1).padStart(6,'0')+'.'+photoTypes[photo.type];
  metadata.push({id:photo.id,name:photo.name||'milestone.'+photoTypes[photo.type],type:photo.type,size:blob.size,createdAt:photo.createdAt||payload.exportedAt,path,sha256:await sha256(await blob.arrayBuffer())});entries.push({path,blob});onProgress(i+1,photos.length);
 }
 const manifest=JSON.stringify({...payload,archiveVersion:1,photos:metadata}),manifestBlob=new Blob([manifest],{type:'application/json'});
 if(manifestBlob.size>limits.manifest)throw Error('Character metadata exceeds the '+limits.manifest/1024/1024+' MiB archive limit. Your saved data is unchanged.');
 entries.push({path:'human-rpg.json',blob:manifestBlob},{path:'integrity.sha256',blob:new Blob([await sha256(manifest)])});
 return createStoredZip(entries,{recovery});
}
export async function decodeArchive(file){
 const entries=await readStoredZip(file),manifest=entries.get('human-rpg.json'),integrity=entries.get('integrity.sha256');
 if(!manifest||!integrity)fail('missing archive manifest or checksum.');
 const text=await manifest.text();if(await sha256(text)!==await integrity.text())fail('manifest integrity check failed.');
 let payload;try{payload=JSON.parse(text);}catch{fail('invalid archive manifest.');}
 if(payload?.format!=='human-rpg-backup'||payload.archiveVersion!==1||!Array.isArray(payload.photos)||payload.photos.length>10000)fail('unsupported archive format.');
 const photos=[],paths=new Set(),ids=new Set();
 for(const photo of payload.photos){
  photoMetadata(photo);
  if(!/^photos\/\d{6}\.(jpg|png|webp)$/.test(photo.path)||paths.has(photo.path)||ids.has(photo.id)||!/^[a-f0-9]{64}$/.test(photo.sha256)||!Number.isSafeInteger(photo.size)||photo.size<=0||photo.size>MAX_PHOTO_BYTES||typeof photo.createdAt!=='string'||!Number.isFinite(Date.parse(photo.createdAt)))fail('invalid photo manifest.');
  const raw=entries.get(photo.path);if(!raw||raw.size!==photo.size||!photo.path.endsWith('.'+photoTypes[photo.type]))fail('missing or mismatched photo.');
  if(await sha256(await raw.arrayBuffer())!==photo.sha256)fail('photo integrity check failed.');
  const {path,sha256:hash,...record}=photo;photos.push({...record,blob:raw.slice(0,raw.size,photo.type)});paths.add(path);ids.add(photo.id);
 }
 if(entries.size!==paths.size+2)fail('unexpected archive files.');
 return {...payload,photos};
}
