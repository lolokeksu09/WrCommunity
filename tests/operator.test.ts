import test from 'node:test';
import assert from 'node:assert/strict';
import {grantAdmin} from '../server/commands/grant-admin.js';
import {one} from '../server/db/index.js';
import {createUser,closeTests} from './helpers.js';
test.after(closeTests);
test('operator role grant requires confirmation and verified account and writes an audit decision',async()=>{
 const unverified=await createUser({verified:false});
 await assert.rejects(()=>grantAdmin(unverified.email,true));
 const user=await createUser();await assert.rejects(()=>grantAdmin(user.email,false));
 assert.equal((await one<{platform_role:string}>('SELECT platform_role FROM users WHERE id=$1',[user.id]))?.platform_role,'member');
 await grantAdmin(user.email,true);
 assert.equal((await one<{platform_role:string}>('SELECT platform_role FROM users WHERE id=$1',[user.id]))?.platform_role,'admin');
 assert.ok(await one("SELECT id FROM audit_actions WHERE actor_id=$1 AND action='platform_admin_grant'",[user.id]));
});
