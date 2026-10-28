import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {SKILLS,minTaskXP} from '../catalog.js';
const START='2026-01-01T18:00:00.000Z';
const state=()=>E.createState({name:'Test',timeZone:'America/Chicago',annualIncomeCents:10000000},START);
const baseline=(s,id,rank)=>{s.baseline.skills[id]={level:rank,date:'2026-01-01'};};
test('advanced quests require matching task difficulty and exclude ordinary work and reward bonuses',()=>{
 const s=state(),q=E.createQuest(s,{skillId:'running',title:'Accomplished running',mode:'open',target:1,rank:20},START);
 E.logActivity(s,{skillId:'running',tier:18},START);assert.equal(E.questProgress(s,q),0);
 E.logActivity(s,{skillId:'running',kind:'work',tier:20},START);assert.equal(E.questProgress(s,q),0);
 assert.throws(()=>E.completeQuest(s,q.id,START),/qualifying activity/);
 E.logActivity(s,{skillId:'running',tier:19},START);assert.equal(E.questProgress(s,q),1);
 E.completeQuest(s,q.id,START);assert.equal(E.questProgress(s,q),1);E.validateState(s);
 // Accepted quests from before the difficulty rule retain their original terms.
 const older={...q,minTier:undefined};assert.equal(E.questProgress(s,older),2);
});
test('paused quests exclude paused work; completed quests have an audited correction path',()=>{
 const s=state(),q=E.createQuest(s,{skillId:'running',title:'Test',mode:'open',target:1,rank:1},START);
 E.toggleQuestPause(s,q.id,START);E.logActivity(s,{skillId:'running'},'2026-01-01T19:00:00Z');assert.equal(E.questProgress(s,q),0);
 E.toggleQuestPause(s,q.id,'2026-01-01T20:00:00Z');const a=E.logActivity(s,{skillId:'running'},'2026-01-01T21:00:00Z');
 E.completeQuest(s,q.id,'2026-01-01T22:00:00Z');assert.equal(E.creditBalance(s),25);
 assert.throws(()=>E.voidActivity(s,a.id),/completed quest/);
 E.voidQuestCompletion(s,q.id);assert.equal(E.creditBalance(s),0);assert.equal(q.status,'voided');
 assert.ok(s.activities.find(x=>x.id==='quest-xp:'+q.id).voided);E.voidActivity(s,a.id);assert.ok(a.voided);
 assert.throws(()=>E.completeQuest(s,q.id),/no longer active/);assert.throws(()=>E.voidQuestCompletion(s,q.id),/completed quest/);
 E.validateState(s);
});
test('character gear impacts every skill, with a shared locked ability',()=>{
 const s=state();s.baseline.characterLevel=5;E.validateCharacter(s,5,START);
 const offer=s.gearOffers.find(o=>o.skillId==='character'&&o.rank===5),item=E.chooseGear(s,offer.id,0);
 E.equip(s,item.id,item.slot,START);E.activateAbility(s,item.id,true,START);
 const a=E.logActivity(s,{skillId:'cooking'},START);assert.equal(a.context.gearBps,item.bps);assert.equal(a.context.activeBps,10000);
 assert.throws(()=>E.equip(s,null,item.slot,'2026-01-02T18:00:00Z'),/locked/);E.validateState(s);
});
test('exact fifty-rank arithmetic and character multiple',()=>{
 assert.equal(E.threshold(50),112589990684262300n);
 for(let l=0;l<=50;l++){assert.equal(E.threshold(l,true),E.threshold(l)*50n);assert.equal(E.xpLevel(E.threshold(l)),l);if(l>0)assert.equal(E.xpLevel(E.threshold(l)-1n),l-1);}
 assert.throws(()=>E.xp('1e20'));assert.throws(()=>E.threshold(51));
});
test('accepted reward anchors and monotone interpolation',()=>{
 const income=10000000;for(const [rank,dollars] of [[1,5],[10,200],[20,1000],[30,10000],[40,50000],[50,100000]])assert.equal(E.rewardCents(rank,income),dollars*100);
 for(let l=2;l<=50;l++)assert.ok(E.rewardCents(l,income)>=E.rewardCents(l-1,income));
 assert.equal(E.rewardCents(40,income*2),10000000);assert.equal(E.rewardCents(50,0),0);
});
test('calendar months clamp end of month and use local dates',()=>{
 assert.equal(E.addMonths('2026-01-31',3),'2026-04-30');assert.equal(E.addMonths('2023-11-30',3),'2024-02-29');
 assert.equal(E.dayKey('2026-01-02T02:00:00Z','America/Chicago'),'2026-01-01');assert.equal(E.validDay('2026-02-30'),false);
});
test('protected XP cannot fall below the next-rank start',()=>{
 const s=state();baseline(s,'cooking',10);const p=E.projectSkill(s,'cooking','2026-03-31');
 assert.equal(p.level,10);assert.equal(E.xp(p.xp),E.threshold(9));assert.equal(p.demotions.length,0);
});
test('nine inactive months catch up exactly three demotions, with new floors',()=>{
 const s=state();baseline(s,'cooking',10);const p=E.projectSkill(s,'cooking','2026-10-01');
 assert.equal(p.level,7);assert.deepEqual(p.demotions.map(x=>x.date),['2026-04-01','2026-07-01','2026-10-01']);assert.equal(E.xp(p.xp),E.threshold(7));
});
test('new XP resets the inactivity interval; opening does not',()=>{
 const s=state();baseline(s,'cooking',10);E.logActivity(s,{skillId:'cooking',tier:0,title:'Practice',date:'2026-03-30'},'2026-03-30T18:00:00Z');
 assert.equal(E.projectSkill(s,'cooking','2026-04-01').level,10);assert.equal(E.projectSkill(s,'cooking','2026-06-30').level,9);
});
test('recovery restores previous rank without another gateway',()=>{
 const s=state();baseline(s,'cooking',5);s.promotions.push({id:'old',skillId:'cooking',rank:5,date:'2026-01-01'});
 assert.equal(E.projectSkill(s,'cooking','2026-04-01').level,4);
 E.logActivity(s,{skillId:'cooking',tier:10,units:1},'2026-04-02T18:00:00Z');assert.equal(E.projectSkill(s,'cooking','2026-04-02').level,5);assert.equal(s.promotions.length,1);
});
test('XP alone cannot promote past the previously achieved gateway',()=>{
 const s=state();E.logActivity(s,{skillId:'cooking',tier:20},START);assert.equal(E.project(s,START).skills.cooking.level,0);assert.ok(E.xp(E.project(s,START).skills.cooking.xp)>E.threshold(10));
});
test('late log earns half base XP and no class, gear or active bonuses',()=>{
 const s=state();s.profile.classId='caregiver';const a=E.logActivity(s,{skillId:'cooking',tier:5,date:'2026-01-01'},'2026-01-02T18:00:00Z');a.context.gearBps=10000;a.context.activeBps=20000;a.context.boots=true;
 assert.equal(E.activityAwards(s).get(a.id),160n);assert.equal(a.late,true);
});
test('routine work is modest and limited to one daily award',()=>{
 const s=state();const a=E.logActivity(s,{skillId:'sales',kind:'work',tier:40,units:50},START);assert.equal(E.activityAwards(s).get(a.id),10n);assert.throws(()=>E.logActivity(s,{skillId:'cooking',kind:'work'},START),/once per day/);
});
test('hiking condition adds the bonus to eligible other skills that day',()=>{
 const s=state();s.inventory.push({id:'boots',slot:'feet',rank:10,effect:'hiking-day',bps:500,name:'Boots',skillId:'hiking'});s.equipment.feet='boots';
 const a=E.logActivity(s,{skillId:'programming',tier:0},START);assert.equal(E.activityAwards(s).get(a.id),15n);
 E.logActivity(s,{skillId:'hiking',tier:0,distanceMiles:5},START);assert.equal(E.activityAwards(s).get(a.id),15n); // 15.75 rounds down exactly once.
 const b=E.logActivity(s,{skillId:'programming',tier:5},START);assert.equal(E.activityAwards(s).get(b.id),504n);
});
test('first attempt conceals assessment until submission; pass needs every criterion',()=>{
 const s=state();E.logActivity(s,{skillId:'cooking',tier:4},START);const a=E.startAttempt(s,'cooking',1,0,START);
 assert.equal(a.submittedAt,null);assert.throws(()=>E.passAttempt(s,a.id,[true,true,true,true],START),/Complete the attempt/);
 E.submitAttempt(s,a.id,{notes:'Prepared and documented a meal'},START);assert.throws(()=>E.passAttempt(s,a.id,[true,false,true,true],START),/every rubric/);
 E.passAttempt(s,a.id,[true,true,true,true],START);assert.equal(E.project(s,START).skills.cooking.level,1);assert.equal(E.passAttempt(s,a.id,[true,true,true,true],START),false);
});
test('assessed rank validation grants prerequisite rewards exactly once',()=>{
 const s=state();baseline(s,'cooking',5);E.resolveRewards(s,START);assert.equal(s.rewardClaims.length,0);
 const a=E.startAttempt(s,'cooking',5,0,START);E.submitAttempt(s,a.id,{},START);E.passAttempt(s,a.id,[true,true,true,true],START);
 assert.equal(s.rewardClaims.filter(k=>k.startsWith('cooking:')).length,5);const before=JSON.stringify(s.permissions);E.resolveRewards(s,START);assert.equal(JSON.stringify(s.permissions),before);assert.equal(E.creditBalance(s),0);
});
test('legendary sources never stack and combined level rewards can cascade',()=>{
 const s=state();baseline(s,'running',50);s.promotions.push({id:'run50',skillId:'running',rank:50,date:'2026-01-01'});baseline(s,'sales',40);baseline(s,'sleep-routines',40);
 const result=E.resolveRewards(s,START),p=E.project(s,START);assert.equal(p.skills.sales.effective,50);assert.equal(p.skills['sleep-routines'].effective,50);assert.ok(s.rewardClaims.includes('sales:50'));assert.ok(s.rewardClaims.includes('sleep-routines:50'));assert.ok(result.rounds<=SKILLS.length+2);
 s.legendarySources.push({id:'extra',sourceSkillId:'hiking',attribute:'Charisma',amount:10});assert.equal(E.project(s,START).skills.sales.effective,50);assert.equal(E.project(s,START).skills.sales.legendary,10);
 const count=s.rewardClaims.length;E.resolveRewards(s,START);assert.equal(s.rewardClaims.length,count);assert.equal(new Set(s.rewardClaims).size,count);
});
test('legendary rewards do not manufacture earned skill or character XP',()=>{
 const s=state();baseline(s,'sales',40);const before=E.project(s,START);s.legendarySources.push({id:'renown',sourceSkillId:'running',attribute:'Charisma',amount:10});E.resolveRewards(s,START);const after=E.project(s,START);
 assert.equal(after.skills.sales.level,40);assert.equal(after.skills.sales.effective,50);assert.equal(after.characterXP,before.characterXP);assert.equal(after.skills.sales.xp,before.skills.sales.xp);
});
test('ability activation requires consent and locks the slot for the entire cooldown',()=>{
 const s=state();s.inventory.push({id:'hat',slot:'head',rank:5,skillId:'cooking',name:'Focus',effect:'skill-xp',bps:500,active:true});E.equip(s,'hat','head',START);
 assert.throws(()=>E.activateAbility(s,'hat',false,START),/Confirm/);const a=E.activateAbility(s,'hat',true,START);assert.equal(Date.parse(a.endsAt)-Date.parse(START),86400000);assert.equal(Date.parse(a.lockedUntil)-Date.parse(START),30*86400000);
 assert.throws(()=>E.equip(s,null,'head','2026-01-03T18:00:00Z'),/locked/);assert.throws(()=>E.activateAbility(s,'hat',true,'2026-01-03T18:00:00Z'),/cooldown/);E.equip(s,null,'head','2026-02-01T18:00:00Z');assert.equal(s.equipment.head,null);
});
test('commitment stake reserved, returned on timely success, completion idempotent',()=>{
 const s=state();E.addCredit(s,'seed',1000,'test',START);const q=E.createQuest(s,{skillId:'running',title:'A session',target:1,rank:1,metric:'sessions',mode:'commitment',deadline:'2026-01-02',stakeCents:500,confirmed:true},START);assert.equal(E.creditBalance(s),500);
 E.logActivity(s,{skillId:'running',tier:1},START);E.completeQuest(s,q.id,START);assert.equal(E.creditBalance(s),1000+q.rewardCents);assert.throws(()=>E.completeQuest(s,q.id,START));
});
test('missed commitment keeps the stake forfeited; late activity cannot rescue it',()=>{
 const s=state();E.addCredit(s,'seed',1000,'test',START);const q=E.createQuest(s,{skillId:'running',title:'A session',target:1,rank:1,mode:'commitment',deadline:'2026-01-02',stakeCents:500,confirmed:true},START);
 E.logActivity(s,{skillId:'running',date:'2026-01-02'},'2026-01-03T18:00:00Z');E.settleQuests(s,'2026-01-03T18:00:00Z');assert.equal(q.status,'expired');assert.equal(E.creditBalance(s),500);assert.equal(E.questProgress(s,q),0);
});
test('character and credits survive skill decay; each point allocated only once',()=>{
 const s=state();s.baseline.characterLevel=10;baseline(s,'cooking',10);E.addCredit(s,'seed',1234,'test',START);const start=E.project(s,START),later=E.project(s,'2027-01-01T18:00:00Z');assert.equal(start.characterXP,later.characterXP);assert.equal(later.creditsCents,1234);assert.equal(later.freeAttributePoints,2);
 E.allocatePoint(s,'Wisdom',START);E.allocatePoint(s,'Strength',START);assert.throws(()=>E.allocatePoint(s,'Charisma',START),/No free/);
});
test('reward permissions freeze their income reference and do not charge credits',()=>{
 const s=state();baseline(s,'cooking',10);s.promotions.push({id:'p',skillId:'cooking',rank:10,date:'2026-01-01'});E.resolveRewards(s,START);const p=s.permissions.find(x=>x.key==='cooking:10');assert.equal(p.valueCents,20000);s.profile.annualIncomeCents=20000000;E.resolveRewards(s,START);E.usePermission(s,p.id,'used');assert.equal(p.valueCents,20000);assert.equal(E.creditBalance(s),0);
});
test('validation rejects broken backups and accepts a real character',()=>{
 const s=state();E.logActivity(s,{skillId:'cooking',tier:3},START);E.validateState(s);
 for(const mutate of [x=>x.schema=99,x=>x.activities[0].baseXp='Infinity',x=>x.activities[0].date='2026-02-30',x=>x.equipment.head='missing',x=>x.rewardClaims=['duplicate','duplicate'],x=>x.creditLedger=[{id:'bad',amountCents:-1}],x=>x.legendarySources=[{id:'bad',sourceSkillId:'cooking',attribute:'Charisma',amount:100}]]){const bad=E.clone(s);mutate(bad);assert.throws(()=>E.validateState(bad),/Backup rejected/);}
});
test('zero-XP skills do not become negative over long absences',()=>{const s=state();const p=E.projectSkill(s,'cooking','2046-01-01');assert.equal(p.level,0);assert.equal(p.xp,'0');assert.equal(p.demotions.length,0);});
test('minimum task decay changes as levels fall',()=>{assert.equal(minTaskXP(10),10240n);assert.equal(minTaskXP(9),5120n);const s=state();baseline(s,'cooking',10);const p=E.projectSkill(s,'cooking','2026-04-02');assert.equal(p.level,9);assert.equal(E.xp(p.xp),E.threshold(9)-minTaskXP(9));});
