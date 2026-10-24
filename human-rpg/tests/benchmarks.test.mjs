import test from 'node:test';
import assert from 'node:assert/strict';
import {bodyComparison,wealthComparison} from '../benchmarks.js';
test('published BMI cohort median and intervals',()=>{assert.equal(bodyComparison('bmi',27.8,35,'male').low,50);assert.equal(bodyComparison('bmi',28,35,'male').high,75);assert.equal(bodyComparison('bmi',28.6,35,'female').low,50);});
test('measurement distribution never extrapolates extremes or unsupported ages',()=>{assert.equal(bodyComparison('bmi',80,25,'female').label,'Above the 95th percentile');assert.equal(bodyComparison('waist',40,85,'male').label,'Below the 5th percentile');assert.equal(bodyComparison('bmi',22,19,'male'),null);assert.equal(bodyComparison('bmi',22,35,''),null);});
test('family median keeps age boundaries and negative wealth',()=>{assert.equal(wealthComparison(0,34).median,33000);assert.equal(wealthComparison(0,35).median,155600);assert.equal(wealthComparison(-1000,80).difference,-505900);});
