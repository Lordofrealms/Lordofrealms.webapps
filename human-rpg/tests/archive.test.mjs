import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {crc32,photoBlob,legacyPhoto,encodeArchive,decodeArchive,readStoredZip,createStoredZip,MAX_PHOTO_BYTES} from '../archive.js';
import {sha256,sha256Fallback} from '../checksum.js';
import {createState,logActivity} from '../engine.js';
import {readBackup} from '../storage.js';
const DATE='2026-10-25T18:00:00Z';
const bytes=Uint8Array.from([0,255,17,0,13,10,128,65,66,67]);
const photo=(id='photo1',blob=new Blob([bytes],{type:'image/png'}))=>({id,name:'Milestone 📷.png',type:'image/png',blob,size:blob.size,createdAt:DATE});
function payload(photos=[]){const state=createState({name:'Archive test',timeZone:'America/Chicago'},DATE);if(photos.length)logActivity(state,{skillId:'cooking',photos:photos.map(p=>p.id)},DATE);return {format:'human-rpg-backup',schema:1,version:'0.1.1',exportedAt:DATE,state};}
async function entriesOf(file){return [...await readStoredZip(file)].map(([path,blob])=>({path,blob}));}
test('binary checksums and ZIP CRC match independent reference values',async()=>{
 assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
 const expected=createHash('sha256').update(bytes).digest('hex');assert.equal(await sha256(bytes),expected);assert.equal(sha256Fallback(bytes.buffer),expected);
});
test('ZIP retains original photo bytes, Unicode metadata and exact character values',async()=>{
 const p=photo(),original=payload([p]),file=await encodeArchive(original,[p]),restored=await readBackup(file);
 assert.equal(restored.state.id,original.state.id);assert.equal(restored.photos[0].name,p.name);assert.equal(restored.photos[0].blob.type,'image/png');
 assert.deepEqual(new Uint8Array(await restored.photos[0].blob.arrayBuffer()),bytes);
 assert.equal(file.type,'application/zip');assert.equal((await readStoredZip(file)).size,3);
});
test('old data-URL photos convert losslessly and legacy JSON remains restorable',async()=>{
 const p=await legacyPhoto(photo()),original=payload([p]);original.version='0.1.0';original.state.version='0.1.0';
 const old={...original,photos:[p]},legacy=JSON.stringify({payload:old,sha256:await sha256(JSON.stringify(old))});
 assert.equal((await readBackup(legacy)).state.version,'0.1.0');
 const restored=await decodeArchive(await encodeArchive(original,[p]));
 assert.deepEqual(new Uint8Array(await photoBlob(restored.photos[0]).arrayBuffer()),bytes);
 assert.equal((await legacyPhoto(restored.photos[0])).data,p.data);
});
test('truncated archives and byte corruption are rejected',async()=>{
 const p=photo(),file=await encodeArchive(payload([p]),[p]);
 await assert.rejects(readBackup(file.slice(0,file.size-1)),/footer|directory/);
 const data=new Uint8Array(await file.arrayBuffer()),view=new DataView(data.buffer);data[30+view.getUint16(26,true)]^=1;
 await assert.rejects(readBackup(new Blob([data])),/integrity/);
});
test('manifest and photo SHA checks catch edits even after ZIP CRCs are regenerated',async()=>{
 const p=photo(),file=await encodeArchive(payload([p]),[p]),entries=await entriesOf(file);
 const manifest=entries.find(e=>e.path==='human-rpg.json'),body=JSON.parse(await manifest.blob.text());body.state.profile.name='Edited';manifest.blob=new Blob([JSON.stringify(body)]);
 await assert.rejects(readBackup(await createStoredZip(entries)),/manifest integrity/);
 const second=await entriesOf(file);second.find(e=>e.path.startsWith('photos/')).blob=new Blob([new Uint8Array(bytes.length)]);
 await assert.rejects(readBackup(await createStoredZip(second)),/photo integrity/);
});
test('missing referenced photos and unexpected archive members are rejected',async()=>{
 const p=photo();await assert.rejects(readBackup(await encodeArchive(payload([p]),[])),/missing a referenced/);
 const entries=await entriesOf(await encodeArchive(payload([p]),[p]));entries.push({path:'photos/000002.png',blob:p.blob});
 await assert.rejects(readBackup(await createStoredZip(entries)),/unexpected archive files/);
 await assert.rejects(encodeArchive(payload([p]),[p,p]),/duplicate photo/);
});
test('unsafe paths, unsupported compression and duplicate members are rejected',async()=>{
 const p=photo(),file=await encodeArchive(payload([p]),[p]);
 await assert.rejects(createStoredZip([{path:'../escape',blob:p.blob}]),/unsafe/);
 await assert.rejects(createStoredZip([{path:'photos/000001.png',blob:p.blob},{path:'photos/000001.png',blob:p.blob}]),/duplicate/);
 const data=new Uint8Array(await file.arrayBuffer()),view=new DataView(data.buffer),central=view.getUint32(data.length-6,true);
 view.setUint16(central+10,8,true);await assert.rejects(readBackup(new Blob([data])),/uncompressed/);
 const unsafe=new Uint8Array(await file.arrayBuffer()),from=new TextEncoder().encode('photos/000001.png'),to=new TextEncoder().encode('../bad/000001.png');
 for(let i=0;i<=unsafe.length-from.length;i++)if(from.every((b,j)=>unsafe[i+j]===b))unsafe.set(to,i);
 await assert.rejects(readBackup(new Blob([unsafe])),/unsafe/);
});
test('photo types, encodings and sizes are validated without transforming originals',async()=>{
 assert.throws(()=>photoBlob({...photo(),type:'image/svg+xml'}),/invalid photo/);
 assert.throws(()=>photoBlob({id:'bad',type:'image/png',data:'data:image/png;base64,%%%='}),/encoding/);
 assert.throws(()=>photoBlob(photo('large',new Blob([new Uint8Array(MAX_PHOTO_BYTES+1)],{type:'image/png'}))),/size/);
});
test('an archive above the former 100 MiB JSON cap roundtrips with bounded photo reads',async()=>{
 const blob=new Blob([new Uint8Array(MAX_PHOTO_BYTES)],{type:'image/png'}),photos=Array.from({length:9},(_,i)=>photo('large-'+i,blob));
 const file=await encodeArchive(payload(photos),photos);assert.ok(file.size>100*1024*1024);const restored=await readBackup(file);
 assert.equal(restored.photos.length,9);assert.equal(restored.photos.reduce((sum,p)=>sum+p.blob.size,0),108*1024*1024);
 assert.deepEqual(new Uint8Array(await restored.photos[8].blob.slice(-16).arrayBuffer()),new Uint8Array(16));
});
test('raw recovery holds two complete photo collections but is not a normal restore file',async()=>{
 const photos=Array.from({length:20000},(_,i)=>photo('raw-'+i)),raw={format:'human-rpg-raw-recovery',exportedAt:DATE,state:{damaged:true},recovery:{state:{preserved:true}}};
 const file=await encodeArchive(raw,photos),entries=await readStoredZip(file,{recovery:true});
 assert.equal(entries.size,20002);const manifest=JSON.parse(await entries.get('human-rpg.json').text());
 assert.equal(manifest.photos.length,20000);assert.equal(manifest.recovery.state.preserved,true);
 await assert.rejects(readBackup(file),/directory/);
 await assert.rejects(encodeArchive(raw,[...photos,photo('overflow')]),/too many/);
 await assert.rejects(readBackup(await encodeArchive(raw,[])),/unsupported archive format/);
});
