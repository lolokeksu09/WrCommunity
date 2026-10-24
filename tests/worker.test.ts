import test from 'node:test';
import assert from 'node:assert/strict';
import {createUser,closeTests} from './helpers.js';
import {one,execute,transaction} from '../server/db/index.js';
import {notify} from '../server/lib.js';
import {processOutbox} from '../server/worker.js';
test.after(closeTests);
test('outbox is idempotent and hidden follow actor is never delivered',async()=>{
 const recipient=await createUser(),actor=await createUser({visibility:'hidden'});
 await transaction(tx=>notify(tx,recipient.id,'follow','profile',actor.id,actor.id));
 await processOutbox(1000);await processOutbox(1000);
 assert.equal((await one<{count:string}>('SELECT count(*) FROM notifications WHERE recipient_id=$1',[recipient.id]))?.count,'0');
 await execute("UPDATE users SET visibility='public' WHERE id=$1",[actor.id]);
 await transaction(tx=>notify(tx,recipient.id,'follow','profile',actor.id,actor.id));
 await processOutbox(1000);await processOutbox(1000);
 assert.equal((await one<{count:string}>('SELECT count(*) FROM notifications WHERE recipient_id=$1',[recipient.id]))?.count,'1');
});
