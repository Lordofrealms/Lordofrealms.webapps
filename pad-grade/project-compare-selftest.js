'use strict';
const assert=require('assert');
const core=require('./project-compare-core.js');

function rectangleCorners({originLat=35,originLon=-97,width=40,length=20,east=0,north=0,thetaDeg=0}={}){
  const theta=thetaDeg*Math.PI/180,ct=Math.cos(theta),st=Math.sin(theta);
  const q={SW:[0,0],SE:[width,0],NE:[width,length],NW:[0,length]},out={};
  for(const [name,[x,y]] of Object.entries(q)){
    const e=east+ct*x-st*y,n=north+st*x+ct*y;
    const ll=core.latLonFromLocalFeet(originLat,originLon,e,n);
    out[name]={lat:ll.lat,lon:ll.lon,accuracy:0.5};
  }
  return out;
}

function project({id='p',target=60,readings,rows=2,cols=2,width=40,length=20,corners}={}){
  return {
    id,
    settings:{name:id,target,tol:.5,rows,cols,width,length},
    readings:readings||{'0,0':target,'0,1':target,'1,0':target,'1,1':target},
    gps:{corners:corners||rectangleCorners({width,length})}
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

const wrongGrid=project({id:'wrong-grid',rows:3,cols:2,readings:{'0,0':60,'0,1':60,'1,0':60,'1,1':60,'2,0':60,'2,1':60}});
assert.strictEqual(core.sameLogicalGrid(complete,wrongGrid),false,'row/column mismatch must not be remapped by GPS proximity');
assert.throws(()=>core.buildComparison(complete,wrongGrid),/same row and column count/);

const wrongSize=project({id:'wrong-size',width:41});
assert.strictEqual(core.samePhysicalSize(complete,wrongSize),false,'different pad dimensions must fail comparison');
assert.throws(()=>core.buildComparison(complete,wrongSize),/same pad width and length/);

const tooFar=project({id:'too-far',corners:rectangleCorners({width:40,length:20,east:25})});
const farEligibility=core.comparisonEligibility(complete,tooFar,20);
assert.strictEqual(farEligibility.ok,false,'corresponding corners more than 20 ft apart must fail');
assert.match(farEligibility.reason,/maximum 20 ft/);

// Both source models are exact rectangles, but the second survey is shifted and
// rotated slightly. Every comparison point must be the local east/north midpoint
// of the two already-fitted project grid positions, and the resulting grid must
// still be one rectangle.
const spatialA=project({id:'spatial-a',corners:rectangleCorners({width:40,length:20,east:0,north:0,thetaDeg:0})});
const spatialB=project({id:'spatial-b',corners:rectangleCorners({width:40,length:20,east:5,north:2,thetaDeg:2})});
const eligibility=core.comparisonEligibility(spatialA,spatialB,20);
assert.strictEqual(eligibility.ok,true,'nearby same-size project rectangles should compare');
const geo=core.buildSharedGeometry(spatialA,spatialB,core.buildComparison(spatialA,spatialB));
const x=17.5,y=8.25;
const p1=core.fitPointLatLon(geo.firstFit,x,y),p2=core.fitPointLatLon(geo.secondFit,x,y);
const expectedMid=core.midpointLatLonLocal(p1,p2),actualMid=core.fitPointLatLon(geo.fit,x,y);
assert.ok(core.localDeltaFeet(expectedMid.lat,expectedMid.lon,actualMid.lat,actualMid.lon).distance<0.01,'comparison point should be the midpoint of the two fitted logical point positions');

const sw=core.fitPointLatLon(geo.fit,0,0),se=core.fitPointLatLon(geo.fit,40,0),nw=core.fitPointLatLon(geo.fit,0,20);
const eastVec=core.localDeltaFeet(sw.lat,sw.lon,se.lat,se.lon),northVec=core.localDeltaFeet(sw.lat,sw.lon,nw.lat,nw.lon);
const dot=eastVec.east*northVec.east+eastVec.north*northVec.north;
assert.ok(Math.abs(dot)<0.02*eastVec.distance*northVec.distance,'averaged comparison grid must remain rectangular');

const roundTrip=core.padXYFromLatLon(geo.fit,actualMid.lat,actualMid.lon);
assert.ok(Math.abs(roundTrip.x-x)<1e-4&&Math.abs(roundTrip.y-y)<1e-4,'averaged GPS fit should round-trip comparison grid coordinates');

console.log('Pad Grade project comparison self-test PASS');
