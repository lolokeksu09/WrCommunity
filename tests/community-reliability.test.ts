import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {app,createUser,request,closeTests} from './helpers.js';
import {execute,one,pool} from '../server/db/index.js';

test.after(closeTests);

test('notification history and unread count remain complete, bounded and private',async()=>{
 const recipient=await createUser(),author=await createUser(),hidden=await createUser({visibility:'hidden'}),other=await createUser();
 const post=(await request('POST','/posts',author,{body:'Notification pagination fixture'})).json();
 await execute(`INSERT INTO notifications(recipient_id,event_type,object_type,object_id,created_at,read_at)
  SELECT $1,'comment','post',$2,'2026-01-01T00:00:00.123456Z'::timestamptz-g*interval '1 microsecond',CASE WHEN g<201 THEN now() ELSE NULL END FROM generate_series(1,201) g`,[recipient.id,post.id]);
 const unread=await request('GET','/me/notifications/unread-count',recipient);
 assert.equal(unread.statusCode,200,unread.body);assert.equal(unread.json().unread_count,1);
 let acquisitions=0;const acquired=()=>{acquisitions++;};pool.on('acquire',acquired);
 let first;
 try{first=await request('GET','/me/notifications?limit=30',recipient);}finally{pool.removeListener('acquire',acquired);}
 assert.equal(first.statusCode,200,first.body);assert.equal(first.json().items.length,30);assert.ok(acquisitions<=10,`One page used ${acquisitions} DB acquisitions`);
 const cursor=first.json().nextCursor as string;assert.ok(cursor);
 assert.equal((await request('GET','/me/notifications?cursor='+cursor,other)).statusCode,422,'Cursor cannot switch recipient');
 assert.equal((await request('GET','/me/notifications?cursor=bad',recipient)).statusCode,422);
 const ids=new Set<string>();let next:string|undefined;let pages=0;
 do{
  const r=await request('GET','/me/notifications?limit=30'+(next?'&cursor='+next:''),recipient);assert.equal(r.statusCode,200,r.body);
  for(const item of r.json().items){assert.ok(!ids.has(item.id),'Duplicate notification');ids.add(item.id);}
  next=r.json().nextCursor;assert.ok(++pages<12,'Pagination must terminate');
 }while(next);
 assert.equal(ids.size,201,'Old notifications must remain reachable');
 const comment=(await request('POST','/posts/'+post.id+'/comments',hidden,{body:'Hidden author in a public discussion'})).json();
 await execute("INSERT INTO notifications(recipient_id,event_type,object_type,object_id,actor_id) VALUES($1,'comment','comment',$2,$3),($1,'follow','profile',$3,$3)",[recipient.id,comment.id,hidden.id]);
 const visible=await request('GET','/me/notifications',recipient);const hiddenAuthor=visible.json().items.find((n:{object_id?:string;actor:unknown;href:string})=>n.href==='/posts/'+post.id&&n.actor===null);
 assert.ok(hiddenAuthor,'Hidden comment author may notify without exposing identity');
 assert.ok(!JSON.stringify(visible.json()).includes(hidden.id),'Hidden account ID must not leave the notification DTO');
 assert.equal((await request('GET','/me/notifications/unread-count',recipient)).json().unread_count,2,'Hidden follow must not count');
 assert.equal((await request('PUT','/profiles/'+hidden.id+'/block',recipient,{})).statusCode,200);
 assert.equal((await request('GET','/me/notifications/unread-count',recipient)).json().unread_count,1);
 await execute("UPDATE users SET visibility='hidden' WHERE id=$1",[author.id]);
 assert.equal((await request('GET','/me/notifications/unread-count',recipient)).json().unread_count,0);
 assert.equal((await request('GET','/me/notifications',recipient)).json().items.length,0);
});

test('moderation pages retain old work and evidence follows existing object access',async()=>{
 const owner=await createUser(),moderator=await createUser({platform_role:'moderator'}),outsider=await createUser();
 const club=(await request('POST','/clubs',owner,{name:'Review fixture',description:'Public metadata for moderation evidence',join_mode:'open',feed_visibility:'public'})).json();
 const lfg=(await request('POST','/lfg',owner,{server:'EU',roles:['mid'],description:'Public LFG review fixture',expires_at:new Date(Date.now()+86400000).toISOString(),pending_policy:'keep'})).json();
 const event=(await request('POST','/clubs/'+club.id+'/events',owner,{title:'Review fixture event',description:'Event evidence',audience:'public',starts_at:new Date(Date.now()+3600000).toISOString(),ends_at:new Date(Date.now()+7200000).toISOString(),registration_closes_at:new Date(Date.now()+1800000).toISOString(),capacity:5})).json();
 assert.ok(club.id);assert.ok(lfg.id);assert.ok(event.id);
 const report=(await request('POST','/reports',outsider,{target_type:'lfg',target_id:lfg.id,reason:'Review public announcement'})).json();assert.ok(report.id);
 await execute("UPDATE reports SET created_at='2025-01-01' WHERE id=$1",[report.id]);
 await execute(`INSERT INTO reports(reporter_id,target_type,target_id,reason,created_at) SELECT $1,'lfg',$2,'New report '||g,'2026-01-01T00:00:00.123456Z'::timestamptz-g*interval '1 microsecond' FROM generate_series(1,101) g`,[outsider.id,lfg.id]);
 const detail=await request('GET','/moderation/reports/'+report.id,moderator);
 const first=await request('GET','/moderation/reports?state=open&limit=25',moderator);
 assert.deepEqual({href:detail.json().evidence?.href,pageSize:first.json().items.length,cursor:typeof first.json().nextCursor==='string'},
  {href:'/lfg/'+lfg.id,pageSize:25,cursor:true},'Readable evidence and complete queue must both be present');
 let next:string|undefined;const ids=new Set<string>();let pages=0;
 do{
  const r=await request('GET','/moderation/reports?state=open&limit=25'+(next?'&cursor='+next:''),moderator);assert.equal(r.statusCode,200,r.body);
  for(const item of r.json().items){assert.ok(!ids.has(item.id));ids.add(item.id);}next=r.json().nextCursor;assert.ok(++pages<8);
 }while(next);
 assert.equal(ids.size,102);assert.ok(ids.has(report.id));
 assert.equal((await request('GET','/moderation/reports?state=resolved&cursor='+first.json().nextCursor,moderator)).statusCode,422);
 assert.equal((await request('GET','/moderation/reports',owner)).statusCode,403);
 for(const [type,id,href] of [['club',club.id,'/clubs/'+club.id],['event',event.id,'/events/'+event.id]]){
  const created=await request('POST','/reports',outsider,{target_type:type,target_id:id,reason:'Review accessible material'});assert.equal(created.statusCode,201,created.body);
  const r=await request('GET','/moderation/reports/'+created.json().id,moderator);assert.equal(r.json().evidence?.href,href,r.body);
 }
 const eventReport=(await request('POST','/reports',owner,{target_type:'event',target_id:event.id,reason:'Private event review'})).json();
 await execute("UPDATE events SET audience='members_only' WHERE id=$1",[event.id]);
 await execute("INSERT INTO notifications(recipient_id,event_type,object_type,object_id) VALUES($1,'event_update','event',$2)",[moderator.id,event.id]);
 assert.equal((await request('GET','/me/notifications/unread-count',moderator)).json().unread_count,0);
 assert.equal((await request('GET','/moderation/reports/'+eventReport.id,moderator)).json().evidence,null,'Moderator does not gain club membership');
 await execute("INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consented_at,consent_version) VALUES($1,$2,'member','active','reviewer','reviewer',now(),1)",[club.id,moderator.id]);
 assert.equal((await request('GET','/moderation/reports/'+eventReport.id,moderator)).json().evidence?.href,'/events/'+event.id);
 assert.equal((await request('GET','/me/notifications/unread-count',moderator)).json().unread_count,1);
 await execute('UPDATE club_memberships SET revoked_at=now() WHERE club_id=$1 AND user_id=$2',[club.id,moderator.id]);
 assert.equal((await request('GET','/me/notifications/unread-count',moderator)).json().unread_count,0);
 assert.equal((await request('GET','/moderation/reports/'+eventReport.id,moderator)).json().evidence,null);
 await request('PUT','/profiles/'+owner.id+'/block',moderator,{});
 assert.equal((await request('GET','/moderation/reports/'+report.id,moderator)).json().evidence,null,'Blocked LFG stays unavailable through evidence');
});

test('validation returns safe named fields without echoing secrets or regex syntax',async()=>{
 const actor=await createUser();
 const password='tiny-key';
 const r=await request('POST','/auth/register',actor,{email:randomUUID()+'@example.com',handle:'игрок',display_name:'Player',password});
 assert.equal(r.statusCode,422,r.body);
 const error=r.json().error;
 assert.equal(typeof error.fields?.handle,'string');assert.equal(typeof error.fields?.password,'string');
 assert.match(error.fields.handle,/латин/i);assert.ok(!r.body.includes(password));assert.ok(!error.message.includes('^[a-z'));
 assert.equal((await one<{n:number}>('SELECT count(*)::int AS n FROM users WHERE handle=$1',['игрок']))?.n,0);
});
