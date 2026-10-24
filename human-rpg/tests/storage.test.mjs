import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../engine.js';
import {readBackup} from '../storage.js';
const state=()=>createState({timeZone:'America/Chicago'},'2026-10-22T18:00:00Z');
async function wrap(s,photos=[]){
 const payload={format:'human-rpg-backup',schema:1,version:'0.1.0',exportedAt:'2026-10-22T18:00:00Z',state:s,photos};
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
 return JSON.stringify({payload,sha256:[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')});
}
test('backup integrity and nested records are validated before storage is touched',async()=>{
 const s=state();assert.equal((await readBackup(await wrap(s))).state.id,s.id);
 const edited=JSON.parse(await wrap(s));edited.payload.state.profile.name='Tampered';
 await assert.rejects(readBackup(JSON.stringify(edited)),/integrity/);
 await assert.rejects(readBackup('{broken'),/valid JSON/);
 s.rankingResults=[{id:'bad',skillId:'running',type:'participant',result:'Winner',cohort:'Test',sourceName:'Test',sourceUrl:'javascript:alert(1)',notes:'',date:'2026-10-22',voided:false}];
 await assert.rejects(readBackup(await wrap(s)),/ranking result/);
});
test('photo references cannot disappear or introduce executable formats during restore',async()=>{
 const s=state();s.attempts.push({id:'test',skillId:'cooking',rank:1,variant:0,startedAt:s.createdAt,submittedAt:null,notes:'',checks:[],photos:['photo1'],passed:false});
 await assert.rejects(readBackup(await wrap(s)),/missing a referenced/);
 const photo={id:'photo1',type:'image/png',data:'data:image/png;base64,aGVsbG8='};
 assert.equal((await readBackup(await wrap(s,[photo]))).photos.length,1);
 await assert.rejects(readBackup(await wrap(s,[photo,photo])),/Duplicate photo/);
 await assert.rejects(readBackup(await wrap(s,[{...photo,type:'image/svg+xml'}])),/invalid photo/);
});
