import {curatedChallengeFor,pathRewardSuggestion,CHALLENGE_EDITION} from './challenges.js';
export {CHALLENGE_PATHS,CHALLENGE_EDITION,APPROACHES,challengePathSummary} from './challenges.js';
export const VERSION = '0.1.2';
export const ATTRIBUTES = ['Strength','Dexterity','Endurance','Intellect','Wisdom','Charisma','Discipline'];
export const SLOTS = ['head','torso','hands','feet','waist','neck','ring1','ring2','main','off'];
export const SLOT_LABELS = {head:'Head',torso:'Torso',hands:'Hands',feet:'Feet',waist:'Waist',neck:'Neck',ring1:'Ring I',ring2:'Ring II',main:'Main hand',off:'Off hand'};
const definitions = [
 ['physical','Physical capability','Strength','Running|Hiking|Strength training|Swimming|Cycling|Rowing|Climbing|Gymnastics|Balance|Mobility|Sprinting|Distance walking|Triathlon|Powerlifting|Olympic weightlifting|Calisthenics|Basketball|Soccer|Tennis|Golf|Baseball|Volleyball|Martial arts|Archery|Skating|Skiing'],
 ['wellbeing','Health & self-care','Discipline','Meal planning|Sleep routines|Stress management|Meditation|First aid|Emergency response|Personal care|Health literacy|Recovery practices|Mindful eating'],
 ['thinking','Thinking & learning','Intellect','Chess|Speedcubing|Reading|Mathematics|Logic|Critical thinking|Research|Learning techniques|Memory techniques|Statistical reasoning|Scientific reasoning|Problem solving|Information literacy|Systems thinking|Decision analysis'],
 ['communication','Communication & languages','Charisma','Public speaking|Writing|Listening|Negotiation|Storytelling|Debate|Technical writing|Interviewing|Presentation design|Spanish|French|German|Mandarin|Japanese|American Sign Language|Translation'],
 ['community','Relationships & community','Wisdom','Conflict resolution|Mentoring|Caregiving|Parenting|Community organizing|Volunteering|Coaching|Facilitation|Collaboration|Cross-cultural communication'],
 ['career','Career & leadership','Charisma','Project management|Team leadership|Delegation|Teaching|Strategic planning|Operations management|Hiring|Career development|Change management|Quality management|Time management|Meeting facilitation'],
 ['finance','Personal finance','Wisdom','Budgeting|Saving|Debt management|Financial analysis|Investment literacy|Tax literacy|Retirement planning|Insurance literacy|Bookkeeping|Financial recordkeeping'],
 ['business','Business & enterprise','Charisma','Sales|Marketing|Entrepreneurship|Customer service|Product management|Business planning|Market research|Procurement|Supply-chain management|Business analytics|Pricing|Account management|E-commerce|Business development'],
 ['computing','Computing & technology','Intellect','Programming|Web development|Mobile development|Cybersecurity|Networking|Database administration|Data analysis|Machine learning|Cloud computing|Systems administration|Software testing|User-experience design|Automation|Technical support|Game development|Digital accessibility'],
 ['science','Science & engineering','Intellect','Physics|Chemistry|Biology|Astronomy|Geology|Ecology|Mechanical engineering|Electrical engineering|Civil engineering|Electronics|CAD|Robotics|Materials science|Environmental science'],
 ['trades','Trades & repair','Dexterity','Carpentry|Welding|Plumbing|Electrical work|Automotive repair|Machining|Masonry|HVAC maintenance|Small-engine repair|Woodworking|Metalworking|Appliance repair|Painting & finishing|Construction planning|Surveying'],
 ['home','Home & daily life','Discipline','Cooking|Baking|Food preservation|Home organization|Cleaning|Sewing|Clothing repair|Laundry care|Household maintenance|Event planning|Personal administration|Home safety'],
 ['creative','Creative arts','Dexterity','Drawing|Painting|Photography|Filmmaking|Graphic design|Sculpture|Pottery|Illustration|Creative writing|Music composition|Singing|Piano|Guitar|Drums|Violin|Dance|Acting|Audio production|Animation'],
 ['outdoors','Outdoors & agriculture','Endurance','Navigation|Camping|Gardening|Horticulture|Animal care|Agronomy|Forestry|Conservation|Fishing|Bird identification|Weather observation|Outdoor leadership|Beekeeping|Soil management|Tractor operation']
];
export const CATEGORIES = definitions.map(([id,name,attribute])=>({id,name,attribute}));
export const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const attributeOverrides={running:'Endurance',hiking:'Endurance',swimming:'Endurance',cycling:'Endurance',climbing:'Strength',balance:'Dexterity',mobility:'Dexterity',gymnastics:'Dexterity',cooking:'Wisdom',baking:'Dexterity',writing:'Intellect',listening:'Wisdom',sales:'Charisma','public-speaking':'Charisma',programming:'Intellect','strength-training':'Strength','distance-walking':'Endurance',meditation:'Wisdom'};
const specialties={cooking:['Heat control','Sauces','Regional cuisines','Menu planning'],baking:['Bread','Pastry','Cakes','Fermentation'],running:['Track','Road','Trail','Distance'],programming:['Algorithms','Systems','Applications','Architecture'],photography:['Portrait','Landscape','Documentary','Studio'],sales:['Discovery','Negotiation','Closing','Account growth'],carpentry:['Framing','Joinery','Finish work'],hiking:['Day hikes','Navigation','Expeditions']};
export const SKILLS = definitions.flatMap(([category,,attribute,names])=>names.split('|').map(name=>({id:slug(name),name,category,attribute:attributeOverrides[slug(name)]||attribute,specialties:specialties[slug(name)]||['Foundations','Applied practice','Advanced practice','Contribution'],custom:false})));
export const CLASSES = [
 {id:'explorer',name:'Explorer',subtitle:'A little of everything',categories:[],multiplier:15000},
 {id:'technologist',name:'Technologist',subtitle:'Build, analyze, solve',categories:['computing','science'],multiplier:30000},
 {id:'craftsperson',name:'Craftsperson',subtitle:'Make things that last',categories:['trades','physical'],multiplier:30000},
 {id:'entrepreneur',name:'Entrepreneur',subtitle:'Create value and opportunity',categories:['business','finance'],multiplier:30000},
 {id:'educator',name:'Educator',subtitle:'Turn knowledge into possibility',categories:['thinking','communication','career'],multiplier:30000},
 {id:'caregiver',name:'Caregiver',subtitle:'Support people and communities',categories:['community','wellbeing','home'],multiplier:30000},
 {id:'athlete',name:'Athlete',subtitle:'Train with purpose',categories:['physical','wellbeing'],multiplier:30000},
 {id:'artist',name:'Artist',subtitle:'Create something only you can',categories:['creative','communication'],multiplier:30000},
 {id:'steward',name:'Land steward',subtitle:'Grow, maintain, explore',categories:['outdoors','trades'],multiplier:30000},
 {id:'leader',name:'Leader',subtitle:'Help a team achieve more',categories:['career','community','communication'],multiplier:30000}
];
export function allSkills(state){return [...SKILLS,...(state?.customSkills||[])];}
export function skillById(state,id){return allSkills(state).find(s=>s.id===id);}
export function rankName(level){return level===50?'Historic mastery':level>=40?'World class':level>=30?'Expert':level>=20?'Accomplished':level>=10?'Practitioner':level>0?'Foundation':'Unassessed';}
export const RANK_DESCRIPTIONS = ['Develop foundations through guided practice.','Work independently and consistently in familiar situations.','Demonstrate broad, reliable capability in demanding real situations.','Show recognized expertise and substantive local or regional achievement.','Demonstrate national or international leadership in the discipline.','Document sustained open-age world-best achievement or an equivalent historic contribution.'];
export function minTaskXP(level){return 10n*(2n**BigInt(Math.min(50,Math.max(0,level))));}
export const PRACTICE_TYPES=[{id:'practice',name:'Deliberate practice',factor:1},{id:'outcome',name:'Meaningful outcome',factor:3},{id:'project',name:'Completed project',factor:8},{id:'work',name:'Routine workday',factor:1}];
const concrete={
 cooking:['Prepare a simple meal from raw ingredients','Coordinate a complete meal with two components','Reproduce a dish with controlled heat and seasoning','Prepare a meal for guests with a timed service plan','Create a repeatable multi-course menu'],
 baking:['Bake a simple recipe and record the result','Produce an evenly baked cake with consistent texture','Bake a yeast-raised loaf and explain the fermentation','Produce a pastry with multiple controlled components','Design and reproduce a small bakery collection'],
 running:['Record a comfortable, appropriate baseline session','Complete a planned session with controlled pacing','Repeat a route and compare pacing and recovery','Execute a progressive training block and document results','Complete a suitable organized event or personal time trial'],
 programming:['Write and explain a small working program','Build a program with input validation and tests','Debug a reproducible failure and explain its cause','Deliver an application another person can use','Build and document a maintainable multi-component project'],
 sales:['Document a customer discovery conversation','Match a customer need to a suitable offer','Handle an objection and record the outcome','Complete a sale and document the full process','Deliver several sales with consistent customer follow-through'],
 hiking:['Plan and complete an appropriate short route','Follow a route with a clear return plan','Complete a hike using your own navigation plan','Document a longer route with pacing and equipment choices','Lead a suitable outing with a complete preparation plan']
};
// Immutable legacy wording: saved attempts without a snapshot must keep these terms.
// Keep these copies independent of future display names/standards.
const legacyRankName=level=>level===50?'Historic mastery':level>=40?'World class':level>=30?'Expert':level>=20?'Accomplished':level>=10?'Practitioner':level>0?'Foundation':'Unassessed';
const LEGACY_RANK_DESCRIPTIONS=Object.freeze(['Develop foundations through guided practice.','Work independently and consistently in familiar situations.','Demonstrate broad, reliable capability in demanding real situations.','Show recognized expertise and substantive local or regional achievement.','Demonstrate national or international leadership in the discipline.','Document sustained open-age world-best achievement or an equivalent historic contribution.']);
export function legacyChallengeFor(skill,rank,variant=0){
 const band=Math.min(5,Math.floor(rank/10));
 const example=concrete[skill.id];
 let title=rank<=5&&example?example[rank-1]:`${['Demonstrate','Apply','Extend'][variant%3]} ${skill.name.toLowerCase()} at ${legacyRankName(rank).toLowerCase()} rank ${rank}`;
 if(rank>=30)title=`Document ${rank>=50?'historic open-age world-best':rank>=40?'national or international':'expert / local or regional'} achievement in ${skill.name.toLowerCase()}`;
 const standards=rank>=30?[
   'Describe the specific achievement and your personal contribution.',
   `Provide a dated result, publication, portfolio, or independent recognition appropriate to ${legacyRankName(rank).toLowerCase()} standing.`,
   rank===50?'Evidence reflects sustained best-in-world achievement beyond an age-group title.':'Explain why the scope and standard meet this rank, beyond routine practice.',
   'Identify the discipline, competitive division or professional context, and the limits of the evidence.'
 ]:[
   'The intended result was completed and can be demonstrated or documented.',
   `The work meets the ${legacyRankName(rank).toLowerCase()} standard described in the objective.`,
   'You can explain your choices, identify errors, and repeat the essential process.',
   rank>=20?'The result demonstrates breadth, independence, and reliable quality.':'The result demonstrates the intended technique with appropriate care.'
 ];
 return {title,objective:LEGACY_RANK_DESCRIPTIONS[band],instructions:'Choose an appropriate setting, tools, and scope. Follow applicable safety instructions and your own limitations. Record what you actually did; a suggested objective is not professional training or permission to perform hazardous work.',rubric:standards,coverage:rank<=5&&example?'Curated starter objective; self-assessed':'Editorial rank framework; self-assessed',variant};
}
export function challengeFor(skill,rank,variant=0){
 if(!skill||!Number.isInteger(rank)||rank<1||rank>50||!Number.isInteger(variant)||variant<0||variant>2)throw Error('Choose a skill, level 1–50 and a supported approach.');
 return curatedChallengeFor(skill,rank,variant)||{...legacyChallengeFor(skill,rank,variant),edition:CHALLENGE_EDITION,sourceIds:[],scope:skill.name,evidence:'Editorial framework; no independently validated rank conversion is implied.'};
}
export const GEAR_NAMES={head:['Focus Headphones','Trail Cap'],torso:['Field Jacket','Studio Apron'],hands:['Precision Gloves','Work Gloves'],feet:['Training Shoes','Quality Hiking Boots'],waist:['Utility Belt','Trail Belt'],neck:['Mentor Pendant','Explorer Badge'],ring1:['Focus Ring','Resolve Ring'],ring2:['Practice Ring','Patience Ring'],main:['Signature Tool','Field Camera'],off:['Field Notebook','Reference Kit']};
export function gearOffer(skill,rank,key){
 const slot=SLOTS[(rank-1)%SLOTS.length];
 return {id:`offer:${key}`,key,skillId:skill.id,skillName:skill.name,rank,slot,claimed:false};
}
export function makeGear(offer,variant=0){
 const active=offer.rank%5===0;
 return {id:`gear:${offer.key}`,offerId:offer.id,key:offer.key,name:`${GEAR_NAMES[offer.slot][variant%2]} · ${offer.skillName}`,slot:offer.slot,rank:offer.rank,skillId:offer.skillId,variant,effect:variant===0?'skill-xp':'decay',bps:Math.min(2500,300+offer.rank*30),active,activeName:active?'Deep Focus':null};
}
export const LEGENDARY_TARGET = {Strength:'Charisma',Dexterity:'Charisma',Endurance:'Charisma',Intellect:'Wisdom',Wisdom:'Intellect',Charisma:'Discipline',Discipline:'Dexterity'};
export const REWARD_SUGGESTIONS={physical:['a favorite treat','training accessories','quality training equipment','an event experience','a major sporting experience','a dream expedition'],wellbeing:['a quiet treat','a recovery accessory','a comfortable home setup','a restorative experience','an extended personal retreat','a defining personal experience'],thinking:['a favorite treat','a new book','a course collection','a learning trip','a major education experience','a life-changing learning project'],communication:['a favorite treat','a useful book','recording equipment','a professional workshop','an immersive learning experience','a major creative or cultural journey'],community:['a favorite treat','a meaningful keepsake','a shared experience','a community celebration','a major shared journey','a legacy celebration'],career:['a favorite treat','a desk accessory','a workspace upgrade','a professional development experience','a major career experience','a career-defining celebration'],finance:['a favorite treat','a useful reference','a planning setup','a personal milestone experience','a major personal project','a lasting life achievement'],business:['a favorite treat','a useful accessory','business tools','a substantial workspace upgrade','a major business experience','a defining personal celebration'],computing:['a favorite treat','a useful peripheral','development equipment','a workstation upgrade','a major technology project','a dream technology experience'],science:['a favorite treat','a science book','a learning kit','a substantial workshop upgrade','an exceptional science experience','a defining research or learning journey'],trades:['a favorite treat','a useful hand tool','quality workshop equipment','a major workshop upgrade','a substantial workshop project','a dream workshop'],home:['a favorite treat','mixing bowls or a useful kitchen accessory','quality kitchen equipment','a kitchen upgrade','a major home project','a dream home experience'],creative:['a favorite treat','creative supplies','quality creative tools','a studio upgrade','a major creative journey','a lifetime creative project'],outdoors:['a favorite treat','field accessories','quality outdoor equipment','an expedition','a substantial outdoor project','a dream expedition']};
const STARTER_REWARDS={
 cooking:['a favorite treat','a mixing or prep bowl','measuring tools','a useful kitchen utensil','a recipe book or kitchen tool'],
 baking:['a favorite treat','a mixing bowl','a cake or loaf pan','a cooling rack','a useful baking tool'],
 running:['a favorite treat','comfortable running socks','a running accessory','a training journal','an event-entry contribution'],
 hiking:['a favorite treat','a trail map','hiking socks','a navigation accessory','a trail-equipment contribution'],
 programming:['a favorite treat','a technical reference','a development accessory','a project notebook','a useful software tool'],
 sales:['a favorite treat','a sales notebook','a useful reference','a presentation accessory','a professional-learning resource']
};
export function rewardSuggestion(skill,rank){
 const pathSuggestion=pathRewardSuggestion(skill,rank);if(pathSuggestion)return pathSuggestion;
 const choices=REWARD_SUGGESTIONS[skill.category]||REWARD_SUGGESTIONS.thinking;
 if(rank<10)return STARTER_REWARDS[skill.id]?.[Math.min(4,rank-1)]||(rank===1?choices[0]:choices[1]);
 return choices[Math.min(5,Math.floor(rank/10))];
}
