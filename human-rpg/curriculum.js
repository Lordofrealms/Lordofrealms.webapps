import {SKILL_PROFILES} from './skill-profiles.js';

export const CONTENT_EDITION='0.1.3';
export const CAPABILITY_LEVELS=[1,5,10,15,20,25];
export const TASK_TIERS=[0,4,9,14,19,24];
export const CAPABILITY_ANSWERS=[
 {value:0,label:'Not yet / I do not know'},
 {value:1,label:'With guidance or substantial help'},
 {value:2,label:'Independently in a familiar setting'},
 {value:3,label:'Reliably across different appropriate situations'}
];
export const RECOGNITION_LEVELS=[0,30,35,40,45,50];
export function profileFor(skill){
 return SKILL_PROFILES[skill.id]||{specialties:skill.specialties,custom:true,capabilities:[
  `Describe the foundational techniques of ${skill.name} and demonstrate one safely`,
  `Complete a defined beginner ${skill.name} task with appropriate guidance`,
  `Complete a useful ${skill.name} project independently in a familiar setting`,
  `Resolve a nonroutine ${skill.name} problem and explain the tradeoffs`,
  `Demonstrate broad reliable ${skill.name} performance across demanding situations`,
  `Present a varied ${skill.name} portfolio for experienced independent review`
 ]};
}

const SAFETY={
 physical:'Choose activity appropriate to your training and conditions. Use qualified coaching, supervision and protection where needed. Record completed performance; an XP award is never a reason to attempt an unsafe load, distance or technique. Adapted practice can be recorded as a custom task with its actual scope.',
 wellbeing:'These tasks concern learning and routines, not diagnosis or treatment. Follow your qualified care team and recognized course instructions where relevant. Never seek a real emergency or restrict necessary rest or food to earn XP.',
 thinking:'Use ethical methods, accurate attribution and appropriate consent. Distinguish a learning exercise from a validated research finding.',
 communication:'Use consenting participants and protect private recordings. Practice translation or interpretation is not authorization for consequential work beyond your competence.',
 community:'Respect consent, privacy, autonomy and safeguarding. Use anonymized evidence. Do not create conflict or expose vulnerable people to earn XP; refer situations beyond your role.',
 career:'Use work you are authorized to perform. Protect confidential information, share credit and judge outcomes in their actual opportunity and resource context.',
 finance:'Use hypothetical examples or your own authorized records. Check current official rules and seek qualified advice for consequential decisions. Buying assets, taking debt or risking money is never required for XP.',
 business:'Use truthful claims, informed consent and authorized work. Protect customer information and distinguish your contribution from market conditions or others’ work.',
 computing:'Use owned or explicitly authorized systems. Prefer isolated tests and synthetic data; protect credentials and personal information. Back up before consequential changes and verify a rollback or recovery path.',
 science:'Use safe educational simulations, public datasets or properly supervised authorized experiments. Consequential designs require appropriate qualified review; no hazardous experiment is required for a game task.',
 trades:'Follow equipment instructions, isolation, guarding and suitable protection. Use supervised training or noncritical work within your competence. Structural, mains, gas, refrigerant and safety-critical work requires the appropriate qualified authorization and review.',
 home:'Follow current authoritative food-safety and manufacturer instructions. Do not improvise preservation processing, mix cleaning chemicals or work beyond user-serviceable equipment limits.',
 creative:'Use suitable material, hearing and movement precautions; obtain consent and permission for recordings, likenesses and source material. Use qualified instruction for equipment or techniques beyond your training.',
 outdoors:'Check current weather, access rules and equipment limits. Protect wildlife and participants, make conservative turnaround decisions and use qualified supervision where needed. No extra exposure is required for XP.'
};
export const safetyFor=skill=>SAFETY[skill.category]||'Choose appropriate authorized work within your competence and record its actual scope.';

// Fixed awards describe task scope, never the level of the person logging it.
// A completed capability earns 3× the base session award. Complex project awards remain
// available as explicitly described custom tasks; we do not assume every capability is a project.
export function tasksFor(skill){
 const profile=profileFor(skill);
 const tasks=profile.capabilities.flatMap((capability,i)=>[
  {id:`${skill.id}:practice-${i}`,skillId:skill.id,edition:CONTENT_EDITION,title:`Practice: ${capability}`,kind:'practice',tier:TASK_TIERS[i],factor:1,unit:'focused session',minMinutes:20,maxUnits:1,maxDailyUnits:3,
   requirements:`One focused session of at least 20 minutes directed at this capability: ${capability}. Record the specific technique practiced, the feedback or check used, and what improved or remains difficult. Time spent watching or reading alone is not a completed practical session.`},
  {id:`${skill.id}:result-${i}`,skillId:skill.id,edition:CONTENT_EDITION,title:capability,kind:'outcome',tier:TASK_TIERS[i],factor:3,unit:'completed capability',minMinutes:0,maxUnits:1,maxDailyUnits:1,
   requirements:`Complete the full stated result: ${capability}. Record dates, scope and a checkable outcome. A plan or unfinished attempt does not count as the completed result. Do not also award a practice session for the same work; choose one entry. Multi-week capabilities count once when the whole result is finished.`}
 ]);
 if(skill.id==='sales')tasks.push({id:'sales:completed-sale',skillId:skill.id,edition:CONTENT_EDITION,title:'Complete an appropriate sale with customer follow-through',kind:'outcome',tier:9,factor:3,unit:'distinct completed sale',minMinutes:0,maxUnits:100,maxDailyUnits:100,requirements:'Each unit is one distinct completed sale with a real customer need, truthful agreed terms and documented follow-through. Count sales, not emails, calls, line items or repeated entries for the same sale. Record an anonymized count and outcome summary.'});
 if(skill.id==='strength-training')for(const [pounds,tier] of [[45,1],[135,8],[225,15],[315,22],[400,29]])tasks.push({id:`strength-training:bench-${pounds}`,skillId:skill.id,edition:CONTENT_EDITION,title:`Record a completed ${pounds} lb bench press`,kind:'outcome',tier,factor:3,unit:'documented lift result',minMinutes:0,maxUnits:1,maxDailyUnits:1,requirements:`Record an already completed controlled barbell bench press at ${pounds} lb total or more, with load, repetitions, range of motion, equipment and appropriate supervision or safety setup stated. Log this lift under one weight preset only, using the highest applicable preset. This is an editorial XP task, not a percentile, competition title or recommendation to test a maximum. Do not attempt an unsuitable load for XP.`});
 return tasks;
}
export const taskFor=(skill,id)=>tasksFor(skill).find(t=>t.id===id);
export function taskBaseXP(task,units=1){return 10n*(2n**BigInt(task.tier))*BigInt(task.factor)*BigInt(units);}
export function recommendTask(skill,currentLevel=0){
 const eligible=tasksFor(skill).filter(t=>t.kind==='practice'&&t.tier<=currentLevel);
 return eligible.at(-1)||tasksFor(skill)[0];
}

export function estimateAssessment(skill,answers,recognition=0){
 if(!Array.isArray(answers)||answers.length!==6||answers.some(v=>!Number.isInteger(v)||v<0||v>3)||!RECOGNITION_LEVELS.includes(recognition))throw Error('Answer all six capability questions using the available choices.');
 let level=0,continuous=true,gap=-1;
 for(let i=0;i<answers.length;i++){
  const answer=answers[i];
  if(continuous&&answer>=2)level=CAPABILITY_LEVELS[i]+(answer===3?2:0);
  else if(continuous){if(answer===1)level=Math.max(level,Math.max(1,CAPABILITY_LEVELS[i]-3));continuous=false;gap=i;}
 }
 const inconsistent=gap>=0&&answers.slice(gap+1).some(v=>v>=2);
 const recognitionReady=answers.every(v=>v>=2);
 if(recognition&&recognitionReady)level=recognition;
 return {level:Math.min(50,level),inconsistent,gap,recognitionReady,recognitionBlocked:!!recognition&&!recognitionReady,nextCapability:gap>=0?profileFor(skill).capabilities[gap]:null};
}
export function assessmentDefinition(skill){
 return {format:1,edition:CONTENT_EDITION,skillId:skill.id,questions:[...profileFor(skill).capabilities],levels:[...CAPABILITY_LEVELS],answerLabels:CAPABILITY_ANSWERS.map(a=>a.label)};
}

const STAGES=[
 ['First demonstration','Complete the stated capability and record the support or guidance used.'],
 ['Repeatable result','Repeat the capability on a separate occasion and compare the two results.'],
 ['Independent execution','Complete the capability independently and explain the choices that affected the result.'],
 ['Useful variation','Apply the capability with one meaningful appropriate variation, without adding hazard.'],
 ['Reliable range','Present several independent examples showing reliable performance across appropriate variations.']
];
const QUALITY={
 physical:'The record describes technique, conditions and relevant distance, load, time or performance evidence without treating added hazard as skill.',
 wellbeing:'The record demonstrates the stated routine or taught capability, respects individual needs and stays within appropriate care or training scope.',
 thinking:'The reasoning, methods, source attribution and checks are clear enough for another informed person to inspect.',
 communication:'The message is understood by its intended audience, with accurate meaning, appropriate context and feedback recorded.',
 community:'The result respects the participants’ consent and agency, with feedback and the limits of your own contribution recorded.',
 career:'The output meets its stated purpose, with stakeholder feedback, tradeoffs and your own contribution identified.',
 finance:'The figures, assumptions, sources and checks are traceable; a hypothetical exercise is not presented as a financial recommendation.',
 business:'The outcome is honestly attributed and supported by appropriate customer, operational or financial evidence.',
 computing:'The result is reproducible, handles relevant failures and has meaningful checks appropriate to its data and security risks.',
 science:'The units, methods, assumptions and uncertainty are documented, with appropriate independent checks and authorized scope.',
 trades:'Dimensions, workmanship and functional checks meet the declared noncritical or professionally reviewed scope.',
 home:'The result is usable, repeatable and consistent with the relevant food, product and equipment instructions.',
 creative:'Craft, intentional choices and the intended effect are evident in the work and informed feedback.',
 outdoors:'The result is supported by dated observations and sound judgment within local rules, suitable conditions and equipment limits.'
};
export function anchoredChallengeFor(skill,rank,variant=0){
 const pack=SKILL_PROFILES[skill.id];if(!pack)return null;
 const index=rank<5?0:Math.min(5,Math.floor(rank/5));
 const stageIndex=rank<5?rank-1:rank%5;
 const [stage,step]=STAGES[stageIndex],capability=pack.capabilities[index];
 const approach=variant===1?'Use an agreed practical brief and record who the result serves.':variant===2?'Choose a suitable changed constraint and explain its effect; do not increase hazard.':'Use a suitable setting and keep dated evidence of the result.';
 const standing=rank===50?'Sustained historic best-in-world achievement':rank>=40?'Leading national or international achievement':'Recognized expert or substantive local / regional achievement';
 const expertStep=['Establish','Repeat with new evidence','Demonstrate in a different relevant context','Obtain rigorous independent review of','Extend the breadth of','Make an original contribution supporting','Sustain over a meaningful period','Develop others while sustaining','Demonstrate wider independent influence through','Present a substantial new body of evidence for'][(rank-30)%10];
 return {edition:CONTENT_EDITION,variant,
  title:rank<30?`${capability} · ${stage}`:rank===50?`Substantiate historic best-in-world achievement in ${skill.name}`:`${expertStep} ${standing.toLowerCase()} in ${skill.name}`,
  objective:rank<30?`${step} ${rank>=20?'Show broad, dependable amateur or practitioner capability.':rank>=10?'Demonstrate reliable independent capability in familiar settings.':'Guidance is acceptable where the stage permits it.'} ${approach}`:`Document ${standing.toLowerCase()} within a declared ${skill.name} discipline. Address ${pack.specialties.join(', ')} where relevant to its scope. ${rank===50?'Independent evidence must show sustained world-best standing beyond age-group recognition, participation or one isolated win.':'The claim needs new attributable achievement appropriate to this rank, not reuse of the preceding milestone.'} ${approach}`,
  instructions:safetyFor(skill),
  rubric:rank<30?[
   `The full capability was demonstrated: ${capability}.`,
   `The progression condition is supported by dated evidence: ${step}`,
   QUALITY[skill.category],
   'Guidance, mistakes, feedback and limits are recorded honestly; the essential result can be repeated within the declared scope.'
  ]:[
   `Independent dated evidence supports ${standing.toLowerCase()} in the declared discipline.`,
   'Your contribution is attributable and the achievement is additional to the preceding milestone.',
   'The eligible field, comparison context, relevant specialties and limitations are explicit.',
   rank===50?'Sustained best-in-world standing or a defensible historic domain equivalent is independently substantiated.':'An informed independent reviewer could verify the claimed scope and standing from the evidence.'
  ],
  coverage:rank<30?'Six authored capability anchors with shared progression stages; self-assessed':'Editorial expert / elite evidence framework; self-assessed',
  sourceIds:[],scope:`${skill.name}: ${pack.specialties.join(', ')}`,
  evidence:'Capability wording and XP tiers are original Human RPG design, not a validated qualification or percentile conversion. This path uses six authored anchors with shared stages; it is not a separately authored objective at every level. See this skill’s ranking sources for external evidence and known gaps.'};
}
