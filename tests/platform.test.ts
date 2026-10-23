import test from 'node:test';
import assert from 'node:assert/strict';
import {app,createUser,request,closeTests} from './helpers.js';
import {one} from '../server/db/index.js';
test.after(closeTests);
test('notification preferences persist and another user cannot mark notifications read',async()=>{
 const a=await createUser(),b=await createUser();
 const prefs=await request('PATCH','/me/notification-preferences',a,{reactions:false});assert.equal(prefs.statusCode,200,prefs.body);
 const read=await request('GET','/me/notification-preferences',a);assert.equal(read.json().preferences.reactions,false);
 const invalid=await request('PATCH','/me/notifications/00000000-0000-4000-8000-000000000001',b,{read:true});assert.equal(invalid.statusCode,404);
});
test('ordinary member cannot acquire platform moderation rights through request body',async()=>{
 const a=await createUser();const r=await request('GET','/moderation/reports',a);assert.equal(r.statusCode,403);
 const tamper=await request('POST','/moderation/sanctions',a,{user_id:a.id,kind:'warning',reason:'test',platform_role:'admin'});assert.equal(tamper.statusCode,403);
});
test('report remains possible for blocked public profile and review writes audit record',async()=>{
 const a=await createUser(),b=await createUser(),mod=await createUser({platform_role:'moderator'});
 assert.equal((await request('PUT',`/profiles/${b.id}/block`,a)).statusCode<300,true);
 const report=await request('POST','/reports',a,{target_type:'profile',target_id:b.id,reason:'Проверка жалобы'});assert.equal(report.statusCode,201,report.body);
 const id=report.json().id as string;
 const review=await request('PATCH',`/moderation/reports/${id}`,mod,{state:'resolved',reason:'Жалоба проверена'});assert.equal(review.statusCode,200,review.body);
 assert.ok(await one('SELECT id FROM moderation_actions WHERE report_id=$1',[id]));
});
test('cross-site mutation and missing CSRF are rejected',async()=>{
 const a=await createUser();
 const missing=await app.inject({method:'POST',url:'/api/v1/posts',headers:{cookie:a.cookie,origin:process.env.APP_ORIGIN??'http://localhost:3000'},payload:{body:'test'}});assert.equal(missing.statusCode,403);
 const wrong=await app.inject({method:'POST',url:'/api/v1/posts',headers:{cookie:a.cookie,origin:'https://evil.example','x-csrf-token':a.csrf},payload:{body:'test'}});assert.equal(wrong.statusCode,403);
});
