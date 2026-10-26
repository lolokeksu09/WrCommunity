import test from 'node:test';
import assert from 'node:assert/strict';
import {localBaselineOrigin} from '../scripts/ci/premium-baseline-guard.mjs';

test('accepts only local non-credentialed HTTP origins',()=>{
 assert.equal(localBaselineOrigin('http://127.0.0.1:13000/'),'http://127.0.0.1:13000');
 assert.equal(localBaselineOrigin('http://localhost:5173/'),'http://localhost:5173');
});
test('does not allow production, DNS rebinding aliases or HTTPS',()=>{
 for(const origin of ['https://139.100.205.135/','http://example.com/','http://localhost.evil.test/','https://localhost/','http://user:secret@localhost:13000/','http://127.0.0.1:13000/api','http://127.0.0.1:13000/?x=1'])assert.throws(()=>localBaselineOrigin(origin),/only accepts/);
});
