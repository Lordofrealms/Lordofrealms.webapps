// Synthetic production-UI fixture. No upload, picker or personal character data.
import * as DB from './challenge-storage.js';
import * as E from '../engine.js';
if(!await DB.loadState()){
 const now=new Date().toISOString(),day=E.dayKey(now,'America/Chicago');
 const state=E.createState({name:'Morgan',timeZone:'America/Chicago',annualIncomeCents:10000000,interests:['home','communication']},now);
 for(const [id,rank] of [['cooking',5],['baking',3],['spanish',10]])E.assessSkill(state,id,rank,day);
 const old=E.startAttempt(state,'baking',3,0,now);delete old.challenge;
 await DB.saveState(state,0);
}
await import('./challenge-app.js');
