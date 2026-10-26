import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {catalog,stableId,editorialEmail,validateCatalog,SEED_VERSION,EDITORIAL_PASSWORD_HASH} from '../scripts/editorial-seed.mjs';
test('editorial content uses explicit identities and safe stable keys',()=>{
  assert.deepEqual(validateCatalog(),{authors:5,clubs:3,posts:24});
  assert.equal(SEED_VERSION,'wrcommunity-editorial-v1');
  const ids=new Set();
  for(const a of catalog.authors){
    assert.match(a.display,/редакция/);
    assert.match(editorialEmail(a.handle),/@example\.invalid$/);
    assert.notEqual(EDITORIAL_PASSWORD_HASH.slice(0,7),'$argon2');
    const id=stableId('author',a.handle);assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);ids.add(id);
  }
  for(const c of catalog.clubs)ids.add(stableId('club',c.slug));
  for(const p of catalog.posts){ids.add(stableId('post',p.slug));ids.add(stableId('revision',p.slug));}
  assert.equal(ids.size,5+3+24*2);
});
test('preview never needs a database and does not apply content',()=>{
  const r=spawnSync(process.execPath,['scripts/editorial-seed.mjs'],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:'',NODE_ENV:'test'},encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.deepEqual(JSON.parse(r.stdout),{mode:'preview',version:SEED_VERSION,authors:5,clubs:3,posts:24,no_database_write:true});
});
test('apply is blocked in test mode',()=>{
  const r=spawnSync(process.execPath,['scripts/editorial-seed.mjs','--apply'],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:'',NODE_ENV:'test'},encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/configured production DATABASE_URL/);
});
