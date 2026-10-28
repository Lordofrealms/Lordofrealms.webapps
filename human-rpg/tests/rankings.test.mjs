import test from 'node:test';
import assert from 'node:assert/strict';
import {SKILLS} from '../catalog.js';
import {RANKING_SOURCES,coverageFor,rowingComparison,swimmingPoints,SWIM_EVENTS} from '../rankings.js';
test('every skill has honest coverage, and source mappings name real catalog skills',()=>{
 const ids=new Set(SKILLS.map(s=>s.id));assert.equal(ids.size,SKILLS.length);
 for(const s of SKILLS){const c=coverageFor(s);assert.ok(c.note);assert.ok(Array.isArray(c.sources));}
 const sourceIds=new Set();for(const source of RANKING_SOURCES){assert.ok(!sourceIds.has(source.id));sourceIds.add(source.id);assert.ok(source.url.startsWith('https://'));assert.ok(source.cohort&&source.limitation);for(const id of source.skillIds)assert.ok(ids.has(id),id);}
 assert.ok(coverageFor(SKILLS.find(s=>s.id==='parenting')).sources.length===0);
});
test('rowing percentile brackets preserve slower/faster direction and bounded tails',()=>{
 assert.deepEqual(rowingComparison(475),{low:50,high:50,label:'Around the 50th participant percentile'});
 assert.equal(rowingComparison(440).low,50);assert.equal(rowingComparison(440).high,75);
 assert.equal(rowingComparison(400).low,90);assert.equal(rowingComparison(600).high,25);
 for(const n of [0,-1,Infinity,NaN])assert.equal(rowingComparison(n),null);
});
test('swimming points use event and sex-specific short-course bases, not percentiles',()=>{
 assert.equal(swimmingPoints('100m Freestyle','male',44.84).points,1000);
 assert.equal(swimmingPoints('100m Freestyle','female',49.93*2).points,125);
 assert.equal(swimmingPoints('400m Medley','female',255.48).points,1000);
 for(const event of SWIM_EVENTS)assert.ok(swimmingPoints(event,'male',200).base>0);
 assert.equal(swimmingPoints('100m Freestyle','unknown',60),null);
 assert.equal(swimmingPoints('100m Freestyle','male',0),null);
 assert.equal(swimmingPoints('unknown','male',60),null);
});
