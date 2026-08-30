'use strict';
const assert=require('assert');
const fmt=require('./project-format-v107.js');

const v5={
  app:'Pad Grade Mapper Mobile',schemaVersion:5,version:5,id:'pg-test-rollback',fileId:'ABCD23',
  createdAt:'2026-08-01T00:00:00.000Z',modifiedAt:'2026-08-30T12:00:00.000Z',status:'open',
  settings:{width:64,length:76,cols:3,rows:3,target:64,tol:.5,refCorner:'SW',name:'Rollback Test',legacySetting:{keep:true}},
  readings:{'0,0':63.9,'0,1':64.1,'0,2':64,'1,0':63.8,'1,1':64.2,'1,2':64,'2,0':63.7,'2,1':64.3,'2,2':64},
  readingMeta:{'1,1':{source:'manual',at:'2026-08-30T12:00:00.000Z'}},
  gps:{corners:{SW:{lat:35,lon:-97},SE:{lat:35,lon:-96.9998},NE:{lat:35.0002,lon:-96.9998},NW:{lat:35.0002,lon:-97}},targetIndex:4,captureIndex:4},
  measureMode:'gps',migration:{sourceVersion:5},dev:{diagnostics:false,custom:'preserve-me'},legacyTopLevel:{also:'preserve'}
};

const up=fmt.normalizeProject(v5,'ABCD23-pg-test-rollback.padgrade');
assert.strictEqual(up.schemaVersion,6);assert.strictEqual(up.version,6);
assert.deepStrictEqual(up.settings.legacySetting,{keep:true});
const text=fmt.serializeV6(up,'ABCD23-pg-test-rollback.padgrade');
assert(text.indexOf('"_pgHeader"')>=0);assert(text.indexOf('"_pgHeader"')<text.indexOf('"app"'));
const head=fmt.parseHeaderText(text.slice(0,4096));
assert(head);assert.strictEqual(head.schemaVersion,6);assert.strictEqual(head.id,v5.id);assert.strictEqual(head.fileId,v5.fileId);
assert.strictEqual(head.catalog.name,'Rollback Test');assert.strictEqual(head.catalog.fullyMeasured,true);assert.strictEqual(head.catalog.gpsReady,true);
const parsed=JSON.parse(text);assert.strictEqual(parsed.dev.custom,'preserve-me');assert.deepStrictEqual(parsed.legacyTopLevel,{also:'preserve'});
const down=fmt.downgradeToV5(parsed);assert.strictEqual(down.schemaVersion,5);assert.strictEqual(down.version,5);assert(!('_pgHeader' in down));
assert(fmt.equivalentV5(v5,parsed),'schema 5 -> schema 6 -> schema 5 must preserve schema-5 semantics');
assert.deepStrictEqual(down.readings,v5.readings);assert.deepStrictEqual(down.readingMeta,v5.readingMeta);assert.deepStrictEqual(down.gps,v5.gps);assert.deepStrictEqual(down.settings,v5.settings);assert.deepStrictEqual(down.dev,v5.dev);assert.deepStrictEqual(down.legacyTopLevel,v5.legacyTopLevel);
const withHole=JSON.parse(JSON.stringify(up));delete withHole.readings['1,1'];withHole.readings.extra=123;
assert.strictEqual(fmt.fullyMeasured(withHole),false,'extra readings must not hide a missing logical grid point');
console.log('project-format-v107 self-test passed');
