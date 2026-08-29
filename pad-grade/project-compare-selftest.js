'use strict';
const assert=require('assert');
const core=require('./project-compare-core.js');

function project({id='p',target=60,readings,rows=2,cols=2,width=40,length=20,corners}){
  return {
    id,
    settings:{name:id,target,tol:.5,rows,cols,width,length},
    readings:readings||{'0,0':target,'0,1':target,'1,0':target,'1,1':target},
    gps:{corners:corners||{
      SW:{lat:35,lon:-97,accuracy:1},
      SE:{lat:35,lon:-96.99986,accuracy:1},
      NE:{lat:35.000055,lon:-96.99986,accuracy:1},
      NW:{lat:35.000055,lon:-97,accuracy:1}
    }}
  };
}

const complete=project({id:'complete'});
assert.strictEqual(core.isFullyFilled(complete),true,'complete grid should be eligible');
const incomplete=project({id:'incomplete'});delete incomplete.readings['1,1'];
assert.strictEqual(core.isFullyFilled(incomplete),false,'missing one reading must make project ineligible');

// Each project is first normalized to target grade = 0. Different target-rod
// setups therefore cancel when both surveys observe the same relative grade.
const datumA=project({id:'datumA',target:60,readings:{'0,0':60,'0,1':60,'1,0':60,'1,1':60}});
const datumB=project({id:'datumB',target:72,readings:{'0,0':72,'0,1':72,'1,0':72,'1,1':72}});
let cmp=core.buildComparison(datumA,datumB);
assert.deepStrictEqual(Object.values(cmp.readings),[0,0,0,0],'target-rod change alone must create zero project delta');

// First survey is 5 inches high at SW; second survey is on target there.
// Second - First ground elevation must be -5 inches: 5 inches of cut occurred.
const cutFirst=project({id:'cut-first',target:60,readings:{'0,0':55,'0,1':60,'1,0':60,'1,1':60}});
const cutSecond=project({id:'cut-second',target:72,readings:{'0,0':72,'0,1':72,'1,0':72,'1,1':72}});
cmp=core.buildComparison(cutFirst,cutSecond);
assert.strictEqual(cmp.readings['0,0'],-5,'lower second surface should report 5 inches cut');
assert.strictEqual(cmp.maxCut,5);

// First survey is 5 inches low at NE; second survey is on target there.
// Second - First ground elevation must be +5 inches: 5 inches of fill occurred.
const fillFirst=project({id:'fill-first',target:60,readings:{'0,0':60,'0,1':60,'1,0':60,'1,1':65}});
const fillSecond=project({id:'fill-second',target:72,readings:{'0,0':72,'0,1':72,'1,0':72,'1,1':72}});
cmp=core.buildComparison(fillFirst,fillSecond);
assert.strictEqual(cmp.readings['1,1'],5,'higher second surface should report 5 inches fill');
assert.strictEqual(cmp.maxFill,5);

const wrongGrid=project({id:'wrong',rows:3,cols:2,readings:{'0,0':60,'0,1':60,'1,0':60,'1,1':60,'2,0':60,'2,1':60}});
assert.strictEqual(core.sameLogicalGrid(complete,wrongGrid),false,'row/column mismatch must not be remapped by GPS proximity');
assert.throws(()=>core.buildComparison(complete,wrongGrid),/same row and column count/);

const shifted=project({id:'shifted'});
for(const c of core.CORNERS){shifted.gps.corners[c].lat+=0.000010;shifted.gps.corners[c].lon+=0.000020;}
const avg=core.averageGpsCorners(complete,shifted);
assert.ok(Math.abs(avg.SW.lat-35.000005)<1e-12,'paired GPS corner latitude should be arithmetic mean');
assert.ok(Math.abs(avg.SW.lon-(-96.99999))<1e-12,'paired GPS corner longitude should be arithmetic mean');

const geo=core.buildSharedGeometry(complete,shifted,core.buildComparison(complete,shifted));
const p=core.fitPointLatLon(geo.fit,17.5,8.25),xy=core.padXYFromLatLon(geo.fit,p.lat,p.lon);
assert.ok(Math.abs(xy.x-17.5)<1e-5&&Math.abs(xy.y-8.25)<1e-5,'shared GPS fit should round-trip comparison grid coordinates');

console.log('Pad Grade project comparison self-test PASS');
