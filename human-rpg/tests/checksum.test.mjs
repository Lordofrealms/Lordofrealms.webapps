import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256,sha256Fallback} from '../checksum.js';
test('portable checksum matches independent SHA-256 on padding boundaries and Unicode',async()=>{
 for(const text of ['', 'abc','a'.repeat(55),'a'.repeat(56),'a'.repeat(64),'a'.repeat(65),'a'.repeat(1000000),'Milestone 🏔️ café 日本語']){
  const expected=createHash('sha256').update(text).digest('hex');
  assert.equal(sha256Fallback(text),expected);assert.equal(await sha256(text),expected);
 }
});
