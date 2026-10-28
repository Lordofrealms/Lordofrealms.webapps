import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as E from '../engine.js';
import {SKILLS,CATEGORIES,CHALLENGE_PATHS,challengePathSummary,challengeFor,legacyChallengeFor,rewardSuggestion} from '../catalog.js';
import {RANKING_SOURCES} from '../rankings.js';
import {encodeArchive} from '../archive.js';
import {readBackup} from '../storage.js';

const NOW='2026-10-26T18:00:00.000Z';
const state=()=>E.createState({name:'Challenge QA',timeZone:'America/Chicago',annualIncomeCents:10000000},NOW);
function ready(skillId='cooking',rank=5){const s=state();E.assessSkill(s,skillId,rank,'2026-10-26');return s;}
const skill=id=>SKILLS.find(s=>s.id===id);

test('twenty complete paths span fourteen categories and reference known primary sources',()=>{
 assert.deepEqual(challengePathSummary(),{paths:20,concreteObjectives:580});
 assert.deepEqual(new Set(Object.keys(CHALLENGE_PATHS).map(id=>skill(id)?.category)),new Set(CATEGORIES.map(c=>c.id)));
 for(const [id,path] of Object.entries(CHALLENGE_PATHS)){
  assert.ok(skill(id),id);assert.equal(path.steps.length,29,id);assert.equal(new Set(path.steps).size,29,id);
  assert.equal(path.quality.length,3,id);assert.equal(path.gifts.length,9,id);
  assert.ok(path.sources.length>0,id);
  for(const source of path.sources)assert.ok(RANKING_SOURCES.some(s=>s.id===source),id+': '+source);
  for(let rank=1;rank<=50;rank++)for(let variant=0;variant<3;variant++){
   const c=challengeFor(skill(id),rank,variant);
   assert.equal(c.rubric.length,4);assert.equal(c.edition,'0.1.2');assert.equal(c.variant,variant);
   for(const field of ['title','objective','instructions','coverage','scope','evidence'])assert.ok(c[field].trim(),id+': '+field);
  }
 }
});

test('all catalog and custom skills still have fifty valid gateways',()=>{
 const custom={id:'custom-pottery',name:'Personal pottery',category:'creative',attribute:'Dexterity'};
 for(const s of [...SKILLS,custom])for(let rank=1;rank<=50;rank++){
  const c=challengeFor(s,rank);assert.equal(c.rubric.length,4);assert.ok(c.instructions.length>20);
  if(!CHALLENGE_PATHS[s.id]){assert.match(c.coverage,/Editorial|starter/);assert.deepEqual(c.sourceIds,[]);}
 }
 assert.throws(()=>challengeFor(custom,0));assert.throws(()=>challengeFor(custom,51));assert.throws(()=>challengeFor(custom,2,3));
});

test('approaches change the visible brief without adding danger or weakening upper rank standing',()=>{
 for(const id of Object.keys(CHALLENGE_PATHS))for(const rank of [1,10,20,30,40,50]){
  const choices=[0,1,2].map(v=>challengeFor(skill(id),rank,v));
  assert.equal(new Set(choices.map(c=>c.objective)).size,3);
  assert.match(choices[2].objective,/greater hazard is never required/);
  assert.ok(choices.every(c=>c.instructions===choices[0].instructions));
  if(rank===50)assert.ok(choices.every(c=>/sustained best-in-world, open-age/i.test(c.objective)&&/age-group/.test(c.rubric[1])));
 }
});

test('new attempts freeze their complete definition against later catalog edits and returned-copy edits',()=>{
 const s=ready(),a=E.startAttempt(s,'cooking',5,2,NOW),saved=E.clone(a.challenge),pack=CHALLENGE_PATHS.cooking;
 const title=pack.steps[4],quality=pack.quality[0];
 try{
  pack.steps[4]='A future revised task';pack.quality[0]='A future criterion';
  assert.notEqual(challengeFor(skill('cooking'),5,2).title,saved.title);
  assert.deepEqual(E.attemptChallenge(s,a),saved);
  const display=E.attemptChallenge(s,a);display.rubric[0]='Mutated copy';display.sourceIds.push('other');
  assert.deepEqual(a.challenge,saved);
  assert.equal(E.startAttempt(s,'cooking',5,0,NOW),a);assert.equal(a.variant,2);
  assert.equal(E.validateState(s),true);
 }finally{pack.steps[4]=title;pack.quality[0]=quality;}
});

test('legacy in-progress and completed milestones retain their old title and rubric without migration',()=>{
 const s=ready('cooking',2),a=E.startAttempt(s,'cooking',2,1,NOW);delete a.challenge;
 const before=JSON.stringify(s),c=E.attemptChallenge(s,a);
 assert.equal(c.title,'Coordinate a complete meal with two components');assert.equal(c.edition,'0.1.1');
 assert.equal(c.rubric[0],'The intended result was completed and can be demonstrated or documented.');
 assert.deepEqual(c.rubric,legacyChallengeFor(skill('cooking'),2,1).rubric);
 assert.equal(JSON.stringify(s),before);assert.equal(E.startAttempt(s,'cooking',2,0,NOW),a);assert.equal(a.challenge,undefined);
 E.submitAttempt(s,a.id,{notes:'Original brief completed'},NOW);E.passAttempt(s,a.id,[true,true,true,true],NOW);
 assert.equal(E.attemptChallenge(s,a).title,c.title);assert.equal(E.validateState(s),true);
});

test('snapshot validation rejects malformed or mismatched saved definitions',()=>{
 const original=ready();E.startAttempt(original,'cooking',5,0,NOW);
 const changes=[c=>c.format=2,c=>c.skillId='baking',c=>c.rank=4,c=>c.variant=1,c=>c.edition=['0.1.2'],c=>c.edition='0.1.12',c=>c.title=' ',c=>c.objective='x'.repeat(8001),c=>c.instructions=null,c=>c.coverage=[],c=>c.scope='',c=>c.evidence=17,c=>c.rubric.pop(),c=>c.rubric[0]='',c=>c.sourceIds=['https://external.example'],c=>c.sourceIds=Array(11).fill('fide')];
 for(const change of changes){const s=E.clone(original);change(s.attempts[0].challenge);assert.throws(()=>E.validateState(s),/saved challenge definition/);}
 for(const value of [null,[],false]){const s=E.clone(original);s.attempts[0].challenge=value;assert.throws(()=>E.validateState(s),/saved challenge definition/);}
 const future=E.clone(original);future.attempts[0].challenge.edition='0.2.0';future.attempts[0].challenge.sourceIds=['future-source'];assert.equal(E.validateState(future),true);
});

test('completion still requires a first claim and all four explicit true checks',()=>{
 const s=ready(),a=E.startAttempt(s,'cooking',5,0,NOW);
 assert.throws(()=>E.passAttempt(s,a.id,[true,true,true,true],NOW),/Complete the attempt/);
 E.submitAttempt(s,a.id,{notes:'A documented result'},NOW);
 for(const checks of [[true,true,true],[true,true,true,true,true],[true,true,true,1],[true,true,true,false]])assert.throws(()=>E.passAttempt(s,a.id,checks,NOW),/every rubric/);
 assert.equal(E.passAttempt(s,a.id,[true,true,true,true],NOW),true);assert.equal(E.passAttempt(s,a.id,[true,true,true,true],NOW),false);
 assert.equal(s.permissions.filter(p=>p.skillId==='cooking').length,5);assert.equal(s.gearOffers.filter(o=>o.skillId==='cooking').length,5);
});

test('catalog changes and income edits never reprice or rename already-earned permissions',()=>{
 const s=ready(),a=E.startAttempt(s,'cooking',5,0,NOW);E.submitAttempt(s,a.id,{},NOW);E.passAttempt(s,a.id,[true,true,true,true],NOW);
 const permissions=E.clone(s.permissions),old=CHALLENGE_PATHS.cooking.gifts[4];
 try{CHALLENGE_PATHS.cooking.gifts[4]='future reward';s.profile.annualIncomeCents*=2;E.resolveRewards(s,NOW);assert.deepEqual(s.permissions,permissions);assert.equal(rewardSuggestion(skill('cooking'),5),'future reward');}
 finally{CHALLENGE_PATHS.cooking.gifts[4]=old;}
});

test('ZIP and legacy JSON roundtrips retain new and old attempts including first-claim state',async()=>{
 const s=ready();const fresh=E.startAttempt(s,'cooking',5,2,NOW);E.assessSkill(s,'baking',3,'2026-10-26');const old=E.startAttempt(s,'baking',3,0,NOW);delete old.challenge;E.submitAttempt(s,old.id,{notes:'Legacy claim'},NOW);
 const payload={format:'human-rpg-backup',schema:1,version:'0.1.2',exportedAt:NOW,state:s};
 const zip=await readBackup(await encodeArchive(payload,[]));assert.deepEqual(zip.state.attempts,s.attempts);
 assert.equal(zip.state.attempts[0].submittedAt,null);assert.equal(E.attemptChallenge(zip.state,zip.state.attempts[0]).title,fresh.challenge.title);
 assert.equal(zip.state.attempts[1].challenge,undefined);assert.equal(E.attemptChallenge(zip.state,zip.state.attempts[1]).title,'Bake a yeast-raised loaf and explain the fermentation');
 const {sha256}=await import('../checksum.js');const body={...payload,photos:[]};const json=await readBackup(JSON.stringify({payload:body,sha256:await sha256(JSON.stringify(body))}));assert.deepEqual(json.state.attempts,s.attempts);
 const invalid=E.clone(payload);invalid.state.attempts[0].challenge.rank=4;await assert.rejects(readBackup(await encodeArchive(invalid,[])),/saved challenge definition/);
});

// Golden digest from catalog.js at the verified 0.1.1 branch checkpoint
// 1d1398786675ebd99e00c52088e0d9dd9f4dd350, generated using its original export.
test('all 30,600 legacy definitions match the independently loaded 0.1.1 catalog',()=>{
 const records=[];for(const s of SKILLS)for(let rank=1;rank<=50;rank++)for(let variant=0;variant<3;variant++)records.push([s.id,rank,variant,legacyChallengeFor(s,rank,variant)]);
 assert.equal(records.length,30600);
 assert.equal(createHash('sha256').update(JSON.stringify(records)).digest('hex'),'a7681914c760f18082a01cbb9d15ab3f3e0d6ba3c0765340a34f4c62fa403869');
});
