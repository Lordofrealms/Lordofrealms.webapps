import {METRICS} from './benchmarks.js';
import {VERSION,SKILLS,ATTRIBUTES,SLOTS,CLASSES,CATEGORIES,PRACTICE_TYPES,allSkills,skillById,minTaskXP,gearOffer,makeGear,LEGENDARY_TARGET,rewardSuggestion,challengeFor,legacyChallengeFor} from './catalog.js';

export const SCHEMA=1;
export const MAX_LEVEL=50;
export const REWARD_ANCHORS=[[1,0.00005],[10,0.002],[20,0.01],[30,0.1],[40,0.5],[50,1]];
export const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clone=value=>structuredClone(value);
export function xp(value){if(typeof value==='bigint')return value;if(!/^\d{1,40}$/.test(String(value)))throw Error('Invalid XP value.');return BigInt(value);}
export function threshold(level,character=false){if(!Number.isInteger(level)||level<0||level>50)throw Error('Level must be between 0 and 50.');return (character?5000n:100n)*(2n**BigInt(level)-1n);}
export function xpLevel(value,character=false){const amount=xp(value);let l=0;while(l<50&&amount>=threshold(l+1,character))l++;return l;}
export function progress(value,level,character=false){if(level>=50)return 1;const lo=threshold(level,character),hi=threshold(level+1,character);return Math.max(0,Math.min(1,Number(xp(value)-lo)/Number(hi-lo)));}
export function formatXP(value){const n=xp(value);if(n<1000000n)return n.toLocaleString('en-US');for(const [scale,suffix] of [[10n**18n,'Qi'],[10n**15n,'Qa'],[10n**12n,'T'],[10n**9n,'B'],[10n**6n,'M']])if(n>=scale)return `${(Number(n*100n/scale)/100).toLocaleString('en-US',{maximumFractionDigits:2})}${suffix}`;return n.toString();}
export function dayKey(value=new Date(),zone='America/Chicago'){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const get=t=>parts.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function validDay(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;const d=new Date(`${day}T12:00:00Z`);return !isNaN(d)&&d.toISOString().slice(0,10)===day;}
export const dayNumber=day=>Math.floor(Date.parse(`${day}T00:00:00Z`)/86400000);
export const dayFromNumber=n=>new Date(n*86400000).toISOString().slice(0,10);
export function addMonths(day,count){const [y,m,d]=day.split('-').map(Number);const end=new Date(Date.UTC(y,m-1+count+1,0)).getUTCDate();return new Date(Date.UTC(y,m-1+count,Math.min(d,end))).toISOString().slice(0,10);}
export function rewardCents(rank,incomeCents){
 if(!Number.isSafeInteger(incomeCents)||incomeCents<0)throw Error('Income must be a supported nonnegative amount.');
 if(rank<1)return 0;
 const r=Math.min(50,rank);let a=REWARD_ANCHORS[0],b=REWARD_ANCHORS.at(-1);
 for(let i=1;i<REWARD_ANCHORS.length;i++)if(r<=REWARD_ANCHORS[i][0]){a=REWARD_ANCHORS[i-1];b=REWARD_ANCHORS[i];break;}
 const fraction=a[1]*(b[1]/a[1])**((r-a[0])/(b[0]-a[0]));
 return Math.round(incomeCents*fraction);
}
export function createState(profile={},now=new Date().toISOString()){
 const timeZone=profile.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Chicago';
 const state={schema:SCHEMA,version:VERSION,id:uid(),revision:0,createdAt:now,updatedAt:now,profile:{name:'Adventurer',timeZone,classId:'explorer',interests:['physical','home','thinking'],annualIncomeCents:0,age:null,comparisonSex:'',...profile},baseline:{characterLevel:0,skills:{}},customSkills:[],activities:[],promotions:[],attempts:[],quests:[],creditLedger:[],gearOffers:[],inventory:[],equipment:Object.fromEntries(SLOTS.map(s=>[s,null])),abilities:[],rewardClaims:[],permissions:[],legendarySources:[],attributePoints:Object.fromEntries(ATTRIBUTES.map(a=>[a,0])),measurements:[],rankingResults:[],audit:[],characterGate:19,characterValidated:0,lastBackupAt:null};
 for(const s of SKILLS)state.baseline.skills[s.id]={level:0,date:dayKey(now,timeZone)};
 return state;
}
export function assessSkill(state,skillId,level,date=dayKey(new Date(),state.profile.timeZone)){
 const s=skillById(state,skillId);if(!s)throw Error('Unknown skill.');
 if(!Number.isInteger(level)||level<0||level>50)throw Error('Invalid assessment level.');
 if(state.activities.some(a=>!a.voided&&a.skillId===skillId)||state.promotions.some(p=>p.skillId===skillId)||(state.baseline.skills[skillId]?.level||0)>0)throw Error('This skill already has progress. Use its next challenge or log practice.');
 state.baseline.skills[skillId]={level,date,assessed:true};state.audit.push({id:uid(),type:'assessment',skillId,level,date});
}
export function creditBalance(state){return state.creditLedger.reduce((sum,e)=>sum+e.amountCents,0);}
export function addCredit(state,id,amountCents,reason,now=new Date().toISOString()){
 if(state.creditLedger.some(e=>e.id===id))return false;
 if(!Number.isSafeInteger(amountCents)||Math.abs(amountCents)>1e14)throw Error('Unsupported credit amount.');
 state.creditLedger.push({id,amountCents,reason,date:now});return true;
}
export function classMultiplier(state,skill){const c=CLASSES.find(c=>c.id===state.profile.classId)||CLASSES[0];return !c.categories.length||c.categories.includes(skill.category)?c.multiplier:10000;}
function equipContext(state,skill,now){
 const items=Object.values(state.equipment).map(id=>state.inventory.find(i=>i.id===id)).filter(Boolean);
 return {classBps:classMultiplier(state,skill),gearBps:Math.min(10000,items.filter(i=>i.effect==='skill-xp'&&(i.skillId===skill.id||i.skillId==='character')).reduce((v,i)=>v+i.bps,0)),activeBps:Math.min(20000,state.abilities.filter(a=>Date.parse(a.activatedAt)<=Date.parse(now)&&Date.parse(a.endsAt)>Date.parse(now)&&(a.skillId===skill.id||a.skillId==='character')).reduce((n,a)=>n+a.bps,0)),boots:items.some(i=>i.effect==='hiking-day')};
}
export function logActivity(state,input,now=new Date().toISOString()){
 const skill=skillById(state,input.skillId);if(!skill)throw Error('Choose a known skill.');
 const today=dayKey(now,state.profile.timeZone),date=input.date||today;
 if(!validDay(date)||date>today||date<dayKey(state.createdAt,state.profile.timeZone))throw Error('Activity date must be between character creation and today.');
 const type=PRACTICE_TYPES.find(t=>t.id===input.kind)||PRACTICE_TYPES[0];
 let tier=Number(input.tier??0),units=Number(input.units??1),minutes=Number(input.minutes??0),distanceMiles=Number(input.distanceMiles??0);
 if(!Number.isInteger(tier)||tier<0||tier>50||!Number.isInteger(units)||units<1||units>10000||!Number.isFinite(minutes)||minutes<0||minutes>1440||!Number.isFinite(distanceMiles)||distanceMiles<0||distanceMiles>1000)throw Error('Check the activity difficulty, units, duration, and distance.');
 if(type.id==='work'){
  if(state.activities.some(a=>!a.voided&&a.kind==='work'&&a.date===date))throw Error('The modest routine workday award is available once per day. Log meaningful outcomes separately.');
  tier=0;units=1;
 }
 const a={id:uid(),skillId:skill.id,title:String(input.title||type.name).slice(0,200),notes:String(input.notes||'').slice(0,4000),date,loggedAt:now,kind:type.id,tier,units,minutes,distanceMiles,baseXp:(minTaskXP(tier)*BigInt(type.factor)*BigInt(units)).toString(),late:date<today,context:type.id==='work'?{classBps:10000,gearBps:0,activeBps:0,boots:false}:equipContext(state,skill,now),photos:input.photos||[],voided:false};
 state.activities.push(a);return a;
}
export function activityAwards(state){
 const hikingDays=new Set();
 const distances={};for(const a of state.activities)if(!a.voided&&!a.late&&a.skillId==='hiking'){distances[a.date]=(distances[a.date]||0)+a.distanceMiles;}
 for(const [d,n] of Object.entries(distances))if(n>=5)hikingDays.add(d);
 return new Map(state.activities.filter(a=>!a.voided).map(a=>{
  const base=xp(a.baseXp);if(a.kind==='quest')return [a.id,base];
  if(a.late)return [a.id,base/2n];
  const c=a.context||{classBps:10000,gearBps:0,activeBps:0,boots:false};
  const extra=Math.min(30000,(c.gearBps||0)+(c.activeBps||0)+(c.boots&&hikingDays.has(a.date)?500:0));
  return [a.id,base*BigInt(c.classBps||10000)*BigInt(10000+extra)/100000000n];
 }));
}
function decayReduction(state,skillId,day){
 // Equipment intervals are recorded, so changing today's loadout cannot rewrite old decay.
 let bps=0;
 for(const e of state.audit)if(e.type==='equipment-interval'&&(e.skillId===skillId||e.skillId==='character')&&e.effect==='decay'&&e.startDay<=day&&(!e.endDay||day<e.endDay))bps+=e.bps;
 return Math.min(5000,bps);
}
export function projectSkill(state,skillId,today=dayKey(new Date(),state.profile.timeZone),awards=activityAwards(state)){
 const baseline=state.baseline.skills[skillId]||{level:0,date:dayKey(state.createdAt,state.profile.timeZone)};
 let level=baseline.level,ceiling=level,value=threshold(level),passed=0,cursor=baseline.date,lastActive=baseline.date,due=addMonths(lastActive,3),lost=0n;
 const demotions=[];
 const events=[...state.activities.filter(a=>!a.voided&&a.skillId===skillId&&a.date>=baseline.date&&a.date<=today).map(a=>({date:a.date,order:0,id:a.id,amount:awards.get(a.id)||0n})),...state.promotions.filter(p=>p.skillId===skillId&&p.date>=baseline.date&&p.date<=today).map(p=>({date:p.date,order:1,rank:p.rank}))].sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order);
 const advance=end=>{
  let n=dayNumber(cursor),stop=dayNumber(end);
  while(n<stop){
   if(level===0&&value===0n){n=stop;break;}
   const floor=threshold(Math.max(0,level-1));
   if(level>0&&value===floor&&dayFromNumber(n)<due){const jump=Math.min(stop,dayNumber(due)-1);if(jump>n){n=jump;continue;}}
   n++;const d=dayFromNumber(n),reduction=decayReduction(state,skillId,d);
   const rate=minTaskXP(level)*BigInt(10000-reduction)/10000n;
   const next=value-rate;const limited=next<floor?floor:next;lost+=value-limited;value=limited;
   if(level>0&&d>=due&&value<threshold(level)){const from=level;level--;demotions.push({date:d,from,to:level});due=addMonths(d,3);}
  }
  cursor=end;
 };
 for(const e of events){advance(e.date);if(e.order===0){value+=e.amount;if(e.amount>0n){lastActive=e.date;due=addMonths(e.date,3);}while(level<ceiling&&value>=threshold(level+1))level++;}else{passed=Math.max(passed,e.rank);ceiling=Math.max(ceiling,e.rank);if(value>=threshold(e.rank))level=Math.max(level,e.rank);}}
 advance(today);
 return {skillId,level,ceiling,passed,assessed:baseline.level,xp:value.toString(),lostXp:lost.toString(),lastActive,nextDemotion:due,demotions,progress:progress(value,level),effective:level,legendary:0};
}
export function project(state,now=new Date().toISOString()){
 const today=dayKey(now,state.profile.timeZone),awards=activityAwards(state),skills={};let baselineXP=0n;
 for(const s of allSkills(state)){skills[s.id]=projectSkill(state,s.id,today,awards);baselineXP+=threshold(state.baseline.skills[s.id]?.level||0);}
 const charBaseline=threshold(state.baseline.characterLevel||0,true);let charXP=baselineXP>charBaseline?baselineXP:charBaseline;for(const a of awards.values())charXP+=a;
 const potentialCharacterLevel=xpLevel(charXP,true),characterLevel=Math.min(potentialCharacterLevel,state.characterGate||19);
 for(const s of allSkills(state)){
  const applicable=state.legendarySources.filter(x=>x.attribute===s.attribute&&x.sourceSkillId!==s.id).sort((a,b)=>b.amount-a.amount||a.id.localeCompare(b.id));
  if(applicable.length){skills[s.id].legendary=applicable[0].amount;skills[s.id].legendarySource=applicable[0].id;}
  skills[s.id].effective=Math.min(50,skills[s.id].level+skills[s.id].legendary);
 }
 const attrs={};for(const attr of ATTRIBUTES){const vals=allSkills(state).filter(s=>s.attribute===attr).map(s=>skills[s.id].effective).sort((a,b)=>b-a).slice(0,5);attrs[attr]=10+Math.floor(vals.reduce((a,b)=>a+b,0)/5)+(state.attributePoints[attr]||0);}
 return {today,skills,awards,characterXP:charXP.toString(),characterLevel,potentialCharacterLevel,characterProgress:progress(charXP,characterLevel,true),creditsCents:creditBalance(state),attributes:attrs,freeAttributePoints:Math.max(0,Math.floor(characterLevel/5)-Object.values(state.attributePoints).reduce((a,b)=>a+b,0))};
}
export function resolveRewards(state,now=new Date().toISOString()){
 const claimed=new Set(state.rewardClaims),catalog=allSkills(state);let count=0,changed=true,rounds=0;
 function grant(skill,rank,key){
  if(claimed.has(key))return false;claimed.add(key);state.rewardClaims.push(key);count++;
  state.gearOffers.push(gearOffer(skill,rank,key));
  state.permissions.push({id:`permission:${key}`,key,skillId:skill.id,rank,title:`You've earned ${rewardSuggestion(skill,rank)}`,valueCents:state.profile.annualIncomeCents>0?rewardCents(rank,state.profile.annualIncomeCents):null,incomeCents:state.profile.annualIncomeCents,status:'available',awardedAt:now});
  if(rank===50&&skill.id!=='character')state.legendarySources.push({id:`legend:${skill.id}`,sourceSkillId:skill.id,attribute:LEGENDARY_TARGET[skill.attribute]||'Charisma',amount:10,awardedAt:now});
  return true;
 }
 while(changed){
  if(rounds++>catalog.length+2)throw Error('Legendary reward resolution did not converge.');changed=false;const p=project(state,now);
  for(const s of catalog){const k=p.skills[s.id],eligible=k.legendary? k.effective:Math.min(k.level,k.passed);for(let l=1;l<=eligible;l++)if(grant(s,l,`${s.id}:${l}`))changed=true;}
 }
 const p=project(state,now),character={id:'character',name:'Character',category:'career',attribute:'Wisdom'};
 for(let l=1;l<=Math.min(p.characterLevel,state.characterValidated);l++)grant(character,l,`character:${l}`);
 const hike=state.activities.find(a=>!a.voided&&!a.late&&a.skillId==='hiking'&&a.distanceMiles>=20);
 if(hike&&!claimed.has('feat:hiking-20')){state.rewardClaims.push('feat:hiking-20');state.inventory.push({id:'gear:hiking-20',key:'feat:hiking-20',name:'Quality Hiking Boots',slot:'feet',rank:10,skillId:'hiking',variant:0,effect:'hiking-day',bps:500,active:true,activeName:'Trail Focus'});count++;}
 return {count,rounds};
}
export function attemptChallenge(state,attempt){
 if(attempt.challenge)return clone(attempt.challenge);
 const skill=skillById(state,attempt.skillId);if(!skill)throw Error('Unknown challenge skill.');
 return {...legacyChallengeFor(skill,attempt.rank,attempt.variant),edition:'0.1.1',sourceIds:[],scope:skill.name,evidence:'Preserved legacy challenge wording; self-assessed.'};
}
export function startAttempt(state,skillId,rank,variant=0,now=new Date().toISOString()){
 if(!Number.isInteger(variant)||variant<0||variant>2)throw Error('Choose a supported challenge approach.');
 const p=project(state,now),k=p.skills[skillId];if(!k)throw Error('Unknown skill.');
 if(!Number.isInteger(rank)||rank<1||rank>50||rank>Math.max(k.level+1,k.assessed)||xp(k.xp)<threshold(rank))throw Error('Earn the required XP before this promotion challenge.');
 const old=state.attempts.find(a=>a.skillId===skillId&&a.rank===rank&&!a.passed);if(old)return old;
 const a={id:uid(),skillId,rank,variant,startedAt:now,submittedAt:null,checks:[],photos:[],notes:'',passed:false,challenge:{format:1,skillId,rank,...clone(challengeFor(skillById(state,skillId),rank,variant))}};state.attempts.push(a);return a;
}
export function submitAttempt(state,id,input={},now=new Date().toISOString()){
 const a=state.attempts.find(a=>a.id===id);if(!a||a.passed)throw Error('Attempt unavailable.');
 a.submittedAt=a.submittedAt||now;a.notes=String(input.notes||a.notes||'').slice(0,8000);a.photos=[...new Set([...(a.photos||[]),...(input.photos||[])])];return a;
}
export function passAttempt(state,id,checks,now=new Date().toISOString()){
 const a=state.attempts.find(a=>a.id===id);if(!a?.submittedAt)throw Error('Complete the attempt before revealing and scoring the rubric.');
 if(a.passed)return false;const definition=attemptChallenge(state,a);if(!Array.isArray(checks)||checks.length!==definition.rubric.length||!checks.every(v=>v===true))throw Error('Meet every rubric criterion or record another attempt.');
 const p=project(state,now),k=p.skills[a.skillId];if(xp(k.xp)<threshold(a.rank))throw Error('Rebuild the required XP before confirming this promotion.');
 a.passed=true;a.checks=checks;a.passedAt=now;
 state.promotions.push({id:`promotion:${a.id}`,attemptId:a.id,skillId:a.skillId,rank:a.rank,date:dayKey(now,state.profile.timeZone)});resolveRewards(state,now);return true;
}
export function validateCharacter(state,rank,now=new Date().toISOString()){
 if(!Number.isInteger(rank)||rank<1||rank>50)throw Error('Invalid character rank.');
 const p=project(state,now);if(rank>p.potentialCharacterLevel)throw Error('More character XP is required.');
 if(rank>=20)state.characterGate=Math.max(state.characterGate,rank>=50?50:Math.min(49,(Math.floor(rank/10)+1)*10-1));
 state.characterValidated=Math.max(state.characterValidated,rank);state.audit.push({id:uid(),type:'character-validation',rank,date:now});resolveRewards(state,now);
}
export function allocatePoint(state,attribute,now=new Date().toISOString()){
 if(!ATTRIBUTES.includes(attribute)||project(state,now).freeAttributePoints<1)throw Error('No free attribute point is available.');state.attributePoints[attribute]++;
}
export function chooseGear(state,offerId,variant){const o=state.gearOffers.find(o=>o.id===offerId);if(!o||o.claimed)throw Error('This reward has already been chosen.');if(![0,1].includes(variant))throw Error('Invalid gear variant.');const item=makeGear(o,variant);state.inventory.push(item);o.claimed=true;return item;}
export function lockedUntil(state,itemId,now=new Date().toISOString()){return state.abilities.filter(a=>a.itemId===itemId&&Date.parse(a.lockedUntil)>Date.parse(now)).map(a=>a.lockedUntil).sort().at(-1)||null;}
export function equip(state,itemId,slot,now=new Date().toISOString()){
 if(!SLOTS.includes(slot))throw Error('Unknown equipment slot.');const existing=state.equipment[slot];if(existing&&lockedUntil(state,existing,now))throw Error(`This slot is locked until ${lockedUntil(state,existing,now)}.`);
 const item=itemId?state.inventory.find(i=>i.id===itemId):null;if(itemId&&!item)throw Error('Item not found.');if(item&&item.slot!==slot)throw Error('This item belongs in another slot.');
 if(item&&Object.entries(state.equipment).some(([s,id])=>s!==slot&&id===item.id))throw Error('This item is already equipped.');
 const day=dayKey(now,state.profile.timeZone);for(const interval of state.audit)if(interval.type==='equipment-interval'&&interval.slot===slot&&!interval.endDay)interval.endDay=day;
 state.equipment[slot]=itemId||null;
 if(item?.effect==='decay')state.audit.push({id:uid(),type:'equipment-interval',slot,itemId: item.id,skillId:item.skillId,effect:'decay',bps:item.bps,startDay:day,endDay:null});
}
export function activateAbility(state,itemId,confirmed,now=new Date().toISOString()){
 if(!confirmed)throw Error('Confirm the full equipment lock before activating.');
 const item=state.inventory.find(i=>i.id===itemId);if(!item?.active||!Object.values(state.equipment).includes(itemId))throw Error('Equip an item with an active ability first.');
 if(lockedUntil(state,itemId,now))throw Error('This ability is still on cooldown.');
 const a={id:uid(),itemId,skillId:item.skillId,activatedAt:now,endsAt:new Date(Date.parse(now)+86400000).toISOString(),lockedUntil:new Date(Date.parse(now)+30*86400000).toISOString(),bps:10000};state.abilities.push(a);return a;
}
export function createQuest(state,input,now=new Date().toISOString()){
 if(!skillById(state,input.skillId))throw Error('Choose a skill.');const mode=['open','timed','commitment'].includes(input.mode)?input.mode:'open';
 const target=Number(input.target),rank=Number(input.rank||1),stake=Math.round(Number(input.stakeCents||0));
 if(!Number.isFinite(target)||target<=0||target>1e6||!Number.isInteger(rank)||rank<1||rank>50||!Number.isSafeInteger(stake)||stake<0)throw Error('Invalid quest target, rank, or stake.');
 const deadline=mode==='open'?null:input.deadline;
 if(deadline&&(!validDay(deadline)||deadline<dayKey(now,state.profile.timeZone)))throw Error('Choose a deadline today or later.');if(mode!=='open'&&!deadline)throw Error('This quest needs a deadline.');
 if(mode==='commitment'&&(!input.confirmed||stake<=0))throw Error('Confirm a positive, disclosed commitment stake.');
 if(mode==='commitment'&&creditBalance(state)<stake)throw Error('Not enough available credits for this commitment stake.');
 const q={id:uid(),title:String(input.title||'Personal quest').slice(0,200),skillId:input.skillId,mode,metric:['sessions','minutes','miles','units'].includes(input.metric)?input.metric:'sessions',target,rank,minTier:Math.max(0,rank-1),deadline,stakeCents:mode==='commitment'?stake:0,status:'active',acceptedAt:now,rewardCents:Math.round(rewardCents(rank,state.profile.annualIncomeCents)*0.05),rewardXP:(minTaskXP(rank)*5n).toString()};
 state.quests.push(q);if(q.stakeCents)addCredit(state,`stake:${q.id}`,-q.stakeCents,`Reserved stake: ${q.title}`,now);return q;
}
export function questProgress(state,q){
 const start=dayKey(q.acceptedAt,state.profile.timeZone);
 return state.activities.filter(a=>!a.voided&&!a.late&&!['quest','work'].includes(a.kind)&&a.tier>=(q.minTier||0)&&a.skillId===q.skillId&&Date.parse(a.loggedAt)>=Date.parse(q.acceptedAt)&&a.date>=start&&(!q.deadline||a.date<=q.deadline)&&!(q.pauses||[]).some(p=>a.loggedAt>=p.start&&(!p.end||a.loggedAt<p.end))).reduce((n,a)=>n+(q.metric==='minutes'?a.minutes:q.metric==='miles'?a.distanceMiles:q.metric==='units'?a.units:1),0);
}
export function toggleQuestPause(state,id,now=new Date().toISOString()){
 const q=state.quests.find(q=>q.id===id);if(!q||q.mode!=='open'||!['active','paused'].includes(q.status))throw Error('Only open quests can be paused. Timed and commitment deadlines continue.');
 q.pauses=q.pauses||[];if(q.status==='active'){q.status='paused';q.pauses.push({start:now,end:null});}else{q.status='active';q.pauses.at(-1).end=now;}
}
export function settleQuests(state,now=new Date().toISOString()){
 const day=dayKey(now,state.profile.timeZone);for(const q of state.quests)if(q.status==='active'&&q.deadline&&day>q.deadline){q.status='expired';q.closedAt=now;state.audit.push({id:uid(),type:'quest-expired',questId:q.id,date:now,stakeForfeited:q.stakeCents});}
}
export function completeQuest(state,id,now=new Date().toISOString()){
 settleQuests(state,now);const q=state.quests.find(q=>q.id===id);if(!q||q.status!=='active')throw Error('This quest is no longer active.');if(questProgress(state,q)<q.target)throw Error('Log enough qualifying activity before claiming completion.');
 q.status='completed';q.closedAt=now;addCredit(state,`quest-reward:${q.id}`,q.rewardCents,`Quest completed: ${q.title}`,now);if(q.stakeCents)addCredit(state,`stake-return:${q.id}`,q.stakeCents,`Stake returned: ${q.title}`,now);
 state.activities.push({id:`quest-xp:${q.id}`,skillId:q.skillId,title:`Quest bonus: ${q.title}`,notes:'Explicit completion bonus; original activity XP is counted once.',date:dayKey(now,state.profile.timeZone),loggedAt:now,kind:'quest',tier:q.rank,units:0,minutes:0,distanceMiles:0,baseXp:q.rewardXP,late:false,context:{},photos:[],voided:false});resolveRewards(state,now);
}
export function abandonQuest(state,id,now=new Date().toISOString()){
 const q=state.quests.find(q=>q.id===id);if(!q||!['active','paused'].includes(q.status))throw Error('Quest unavailable.');q.status='abandoned';q.closedAt=now;state.audit.push({id:uid(),type:'quest-abandoned',questId:q.id,stakeForfeited:q.stakeCents,date:now});
}
export function usePermission(state,id,status){const p=state.permissions.find(p=>p.id===id);if(!p||!['used','passed','available'].includes(status))throw Error('Permission unavailable.');p.status=status;}
export function buyItem(state,offer,now=new Date().toISOString()){
 const price=Number(offer.priceCents);if(!Number.isSafeInteger(price)||price<0||creditBalance(state)<price)throw Error('Not enough reward credits.');
 if(state.inventory.some(i=>i.key===offer.key))throw Error('This shop item is already owned.');
 const item=makeGear(offer,offer.variant||0);item.name=offer.name||item.name;state.inventory.push(item);addCredit(state,`purchase:${item.id}`,-price,`Shop: ${item.name}`,now);return item;
}
export function voidActivity(state,id,now=new Date().toISOString()){
 const a=state.activities.find(a=>a.id===id);if(!a||a.voided||a.kind==='quest')throw Error('This entry cannot be voided here.');
 if(state.quests.some(q=>q.status==='completed'&&q.skillId===a.skillId&&Date.parse(q.acceptedAt)<=Date.parse(a.loggedAt)))throw Error('This activity supports a completed quest. Export a backup and resolve that quest before correcting the entry; its reward cannot silently be erased.');
 a.voided=true;state.audit.push({id:uid(),type:'activity-voided',activityId:id,date:now});
}
export function voidQuestCompletion(state,id,now=new Date().toISOString()){
 const q=state.quests.find(q=>q.id===id);
 if(!q||q.status!=='completed')throw Error('Choose a completed quest.');
 if(creditBalance(state)<q.rewardCents)throw Error('This completion reward has already been spent. Earn enough credits to return its bonus before voiding it; no debt or silent deletion was created.');
 addCredit(state,`quest-correction:${id}`,-q.rewardCents,`Correction of quest completion: ${q.title}`,now);
 const bonus=state.activities.find(a=>a.id===`quest-xp:${id}`);if(bonus)bonus.voided=true;
 q.status='voided';state.audit.push({id:uid(),type:'quest-completion-voided',questId:id,date:now});
}
export function addCustomSkill(state,input,now=new Date().toISOString()){
 const name=String(input.name||'').trim();if(!name||name.length>80||allSkills(state).some(s=>s.name.toLowerCase()===name.toLowerCase()))throw Error('Choose a unique skill name.');
 if(!ATTRIBUTES.includes(input.attribute))throw Error('Choose an attribute.');
 const skill={id:`custom-${uid()}`,name,category:input.category||'thinking',attribute:input.attribute,specialties:['Foundations','Applied practice','Advanced practice','Contribution'],custom:true};state.customSkills.push(skill);state.baseline.skills[skill.id]={level:0,date:dayKey(now,state.profile.timeZone)};return skill;
}
export function validateState(s){
 const fail=m=>{throw Error(`Backup rejected: ${m}`);};
 if(!s||s.schema!==SCHEMA||typeof s.id!=='string'||!s.profile||!s.baseline)fail('unsupported character format.');
 if(!Number.isSafeInteger(s.revision)||s.revision<0||!Number.isFinite(Date.parse(s.createdAt)))fail('invalid revision or creation date.');
 try{dayKey(s.createdAt,s.profile.timeZone);}catch{fail('invalid time zone.');}
 if(typeof s.profile.name!=='string'||s.profile.name.length>120||!Number.isSafeInteger(s.profile.annualIncomeCents)||s.profile.annualIncomeCents<0||s.profile.annualIncomeCents>1e14)fail('invalid profile.');
 for(const key of ['customSkills','activities','promotions','attempts','quests','creditLedger','gearOffers','inventory','abilities','rewardClaims','permissions','legendarySources','measurements','audit'])if(!Array.isArray(s[key])||s[key].length>100000)fail(`invalid ${key}.`);
 const ids=new Set(SKILLS.map(s=>s.id));for(const c of s.customSkills){if(!c.id?.startsWith('custom-')||ids.has(c.id)||typeof c.name!=='string'||c.name.length>80||!ATTRIBUTES.includes(c.attribute))fail('invalid custom skill.');ids.add(c.id);}
 const rank=n=>Number.isInteger(n)&&n>=0&&n<=50;
 if(!rank(s.baseline.characterLevel)||!rank(s.characterValidated)||!rank(s.characterGate))fail('invalid character level.');
 for(const [id,b] of Object.entries(s.baseline.skills)){if(!ids.has(id)||!rank(b.level)||!validDay(b.date)||b.date<dayKey(s.createdAt,s.profile.timeZone))fail('invalid skill baseline.');}
 for(const key of ['activities','attempts','quests','inventory','permissions','legendarySources','creditLedger']){const seen=new Set();for(const e of s[key]){if(typeof e.id!=='string'||seen.has(e.id))fail(`duplicate or missing ${key} ID.`);seen.add(e.id);}}
 for(const a of s.activities){try{xp(a.baseXp);}catch{fail('invalid activity XP.');}if(!ids.has(a.skillId)||!validDay(a.date)||!Number.isFinite(Date.parse(a.loggedAt))||typeof a.title!=='string'||typeof a.late!=='boolean'||!Number.isFinite(a.units)||!Number.isFinite(a.minutes)||!Number.isFinite(a.distanceMiles)||a.units<0||a.minutes<0||a.distanceMiles<0)fail('invalid activity.');const c=a.context||{};if(a.kind!=='quest'&&(!Number.isInteger(c.classBps)||c.classBps<10000||c.classBps>100000||!Number.isInteger(c.gearBps)||c.gearBps<0||c.gearBps>10000||!Number.isInteger(c.activeBps)||c.activeBps<0||c.activeBps>20000))fail('invalid activity bonus.');}
 for(const p of s.promotions)if(!ids.has(p.skillId)||!rank(p.rank)||!validDay(p.date))fail('invalid promotion.');
 for(const q of s.quests){try{xp(q.rewardXP);}catch{fail('invalid quest XP.');}if(!ids.has(q.skillId)||!Number.isFinite(q.target)||q.target<=0||!Number.isSafeInteger(q.rewardCents)||q.rewardCents<0||!Number.isSafeInteger(q.stakeCents)||q.stakeCents<0||!Number.isFinite(Date.parse(q.acceptedAt))||(q.deadline&&!validDay(q.deadline)))fail('invalid quest.');}
 let balance=0;for(const e of s.creditLedger){if(!Number.isSafeInteger(e.amountCents)||Math.abs(e.amountCents)>1e14)fail('invalid credit ledger.');balance+=e.amountCents;if(!Number.isSafeInteger(balance))fail('credit total too large.');}if(balance<0)fail('negative credit balance.');
 if(new Set(s.rewardClaims).size!==s.rewardClaims.length||s.rewardClaims.some(k=>typeof k!=='string'))fail('duplicate reward claims.');
 for(const l of s.legendarySources)if(!ids.has(l.sourceSkillId)||!ATTRIBUTES.includes(l.attribute)||!Number.isInteger(l.amount)||l.amount<1||l.amount>50)fail('invalid legendary source.');
 for(const i of s.inventory)if(!SLOTS.includes(i.slot)||!rank(i.rank)||!Number.isInteger(i.bps)||i.bps<0||i.bps>10000||typeof i.name!=='string')fail('invalid equipment.');
 if(!s.equipment||SLOTS.some(slot=>!(slot in s.equipment)))fail('missing equipment slots.');
 const equipped=new Set();for(const [slot,id] of Object.entries(s.equipment)){if(!SLOTS.includes(slot))fail('unknown equipment slot.');if(id){const item=s.inventory.find(i=>i.id===id);if(!item||item.slot!==slot||equipped.has(id))fail('invalid equipped item.');equipped.add(id);}}
 for(const a of s.abilities)if(!s.inventory.some(i=>i.id===a.itemId)||![a.activatedAt,a.endsAt,a.lockedUntil].every(t=>Number.isFinite(Date.parse(t)))||Date.parse(a.endsAt)>Date.parse(a.lockedUntil)||!Number.isInteger(a.bps)||a.bps<0||a.bps>20000)fail('invalid ability lock.');
 if(!s.attributePoints||ATTRIBUTES.some(a=>!Number.isInteger(s.attributePoints[a])||s.attributePoints[a]<0||s.attributePoints[a]>10))fail('invalid attribute allocation.');
 for(const p of s.permissions)if(p.valueCents!==null&&(!Number.isSafeInteger(p.valueCents)||p.valueCents<0))fail('invalid reward permission.');
 const text=(v,max=8000)=>typeof v==='string'&&v.length<=max;
 const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const refs=v=>Array.isArray(v)&&v.length<=10000&&v.every(id=>text(id,200));
 if(!CLASSES.some(c=>c.id===s.profile.classId)||!Array.isArray(s.profile.interests)||s.profile.interests.some(id=>!CATEGORIES.some(c=>c.id===id))||!['','male','female'].includes(s.profile.comparisonSex)||(s.profile.age!==null&&(!Number.isInteger(s.profile.age)||s.profile.age<18||s.profile.age>120)))fail('invalid profile choices.');
 if(!s.baseline.skills||typeof s.baseline.skills!=='object'||Array.isArray(s.baseline.skills)||!timestamp(s.updatedAt))fail('invalid baseline or save date.');
 for(const key of ['promotions','gearOffers','abilities','measurements','audit']){const seen=new Set();for(const entry of s[key]){if(!entry||!text(entry.id,200)||seen.has(entry.id))fail(`invalid or duplicate ${key} ID.`);seen.add(entry.id);}}
 for(const a of s.activities)if(!rank(a.tier)||!['practice','outcome','project','work','quest'].includes(a.kind)||!text(a.notes,8000)||!refs(a.photos)||typeof a.voided!=='boolean')fail('invalid activity details.');
 for(const a of s.attempts)if(!ids.has(a.skillId)||!rank(a.rank)||a.rank<1||!Number.isInteger(a.variant)||a.variant<0||a.variant>2||!timestamp(a.startedAt)||(a.submittedAt&&!timestamp(a.submittedAt))||!text(a.notes)||!refs(a.photos)||!Array.isArray(a.checks)||a.checks.some(v=>typeof v!=='boolean')||typeof a.passed!=='boolean'||(a.passed&&(!timestamp(a.passedAt)||a.checks.length!==4||!a.checks.every(Boolean))))fail('invalid milestone attempt.');
 for(const a of s.attempts)if(a.challenge!==undefined){
  const c=a.challenge,nonempty=(value,max)=>text(value,max)&&value.trim().length>0;
  if(!c||Array.isArray(c)||c.format!==1||c.skillId!==a.skillId||c.rank!==a.rank||c.variant!==a.variant||typeof c.edition!=='string'||!/^\d\.\d\.\d$/.test(c.edition)||!nonempty(c.title,500)||!nonempty(c.objective,8000)||!nonempty(c.instructions,4000)||!nonempty(c.coverage,500)||!nonempty(c.scope,1000)||!nonempty(c.evidence,4000)||!Array.isArray(c.rubric)||c.rubric.length!==4||!c.rubric.every(v=>nonempty(v,2000))||!Array.isArray(c.sourceIds)||c.sourceIds.length>10||c.sourceIds.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{0,60}$/.test(id)))fail('invalid saved challenge definition.');
 }
 for(const q of s.quests){
  if((q.minTier!==undefined&&!rank(q.minTier))||!rank(q.rank)||q.rank<1||!['open','timed','commitment'].includes(q.mode)||!['active','paused','completed','expired','abandoned','voided'].includes(q.status)||!['sessions','minutes','miles','units'].includes(q.metric)||!text(q.title,200)||(q.mode!=='open'&&!q.deadline))fail('invalid quest details.');
  if(q.pauses&&(!Array.isArray(q.pauses)||q.pauses.some(p=>!timestamp(p.start)||(p.end&&(!timestamp(p.end)||p.end<p.start)))))fail('invalid quest pauses.');
 }
 for(const o of s.gearOffers)if(!text(o.key,200)||!text(o.skillName,120)||(!ids.has(o.skillId)&&o.skillId!=='character')||!SLOTS.includes(o.slot)||!rank(o.rank)||o.rank<1||typeof o.claimed!=='boolean')fail('invalid gear choice.');
 for(const i of s.inventory)if((!ids.has(i.skillId)&&i.skillId!=='character')||!['skill-xp','decay','hiking-day'].includes(i.effect)||typeof i.active!=='boolean')fail('invalid item effect.');
 for(const p of s.permissions)if((!ids.has(p.skillId)&&p.skillId!=='character')||!rank(p.rank)||!['available','used','passed'].includes(p.status)||!text(p.title,500)||!timestamp(p.awardedAt))fail('invalid purchase permission.');
 for(const m of s.measurements){const spec=METRICS.find(x=>x.id===m.metric);if(!spec||!Number.isFinite(m.value)||m.value<spec.min||m.value>spec.max||!validDay(m.date)||!text(m.notes,2000)||!['','male','female'].includes(m.sex)||(m.age!==null&&(!Number.isInteger(m.age)||m.age<18||m.age>120)))fail('invalid measurement.');}
 if(s.rankingResults!==undefined){
  if(!Array.isArray(s.rankingResults)||s.rankingResults.length>100000)fail('invalid ranking history.');
  const seen=new Set();for(const r of s.rankingResults){if(!r||!text(r.id,200)||seen.has(r.id)||!ids.has(r.skillId)||!['population','participant','competition','framework','record','context'].includes(r.type)||!text(r.result,300)||!text(r.cohort,500)||!text(r.sourceName,200)||!text(r.sourceUrl,2000)||(r.sourceUrl&&!/^https?:\/\//i.test(r.sourceUrl))||!text(r.notes,2000)||!validDay(r.date)||typeof r.voided!=='boolean')fail('invalid ranking result.');seen.add(r.id);}
 }
 for(const a of s.audit)if(a.type==='equipment-interval'&&((!ids.has(a.skillId)&&a.skillId!=='character')||!validDay(a.startDay)||(a.endDay&&!validDay(a.endDay))||!Number.isInteger(a.bps)||a.bps<0||a.bps>10000))fail('invalid equipment history.');
 return true;
}
