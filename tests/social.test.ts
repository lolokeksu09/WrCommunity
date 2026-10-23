import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createUser, request, app, type TestUser } from './helpers.js';
import { execute, one } from '../server/db/index.js';
import sharp from 'sharp';

async function post(user:TestUser,body='Содержательная запись',extra:Record<string,unknown>={}){
 const result=await request('POST','/posts',user,{body,...extra});assert.equal(result.statusCode,200,result.body);return result.json();
}
async function comment(user:TestUser,postId:string,body='Комментарий',parent_id?:string){
 const result=await request('POST',`/posts/${postId}/comments`,user,{body,...(parent_id?{parent_id}:{})});assert.equal(result.statusCode,200,result.body);return result.json();
}
async function upload(user:TestUser,bytes:Buffer,name='photo.jpg',mime='image/jpeg'){
 const boundary='wr-'+randomUUID();
 const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 return app.inject({method:'POST',url:'/api/v1/media',headers:{cookie:user.cookie,'x-csrf-token':user.csrf,origin:process.env.APP_ORIGIN??'http://localhost:3000','content-type':`multipart/form-data; boundary=${boundary}`},payload});
}
async function clubPost(owner:TestUser,member:TestUser,audience='members_only'){
 const club=await one<{id:string}>(`INSERT INTO clubs(owner_id,name,description,join_mode,feed_visibility) VALUES($1,'Приватный клуб','Описание тестового клуба','open',$2) RETURNING id`,[owner.id,audience]);
 for(const [user,nickname,role] of [[owner,'Владелец','owner'],[member,'Клубный псевдоним','member']] as const){await execute(`INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consent_version,consented_at) VALUES($1,$2,$3,'active',$4,$4,1,now())`,[club!.id,user.id,role,nickname]);}
 const p=await one<{id:string}>(`INSERT INTO posts(author_id,club_id,state,audience) VALUES($1,$2,'published',$3) RETURNING id`,[owner.id,club!.id,audience]);
 const revision=await one<{id:string}>(`INSERT INTO post_revisions(post_id,body,status) VALUES($1,'Одобренная запись','approved') RETURNING id`,[p!.id]);await execute('UPDATE posts SET current_revision_id=$2 WHERE id=$1',[p!.id,revision!.id]);
 return {postId:p!.id,clubId:club!.id};
}

test('ordinary posts retain revisions, enforce codepoint/image limits, draft privacy and verified mutations',async()=>{
 const owner=await createUser();const other=await createUser();const unverified=await createUser({verified:false});
 assert.equal((await request('POST','/posts',unverified,{body:'Запрещено'})).statusCode,403);
 assert.equal((await request('POST','/posts',owner,{body:'x'.repeat(5001)})).statusCode,422);
 assert.equal((await request('POST','/posts',owner,{body:'test',images:Array.from({length:5},()=>randomUUID())})).statusCode,422);
 const draft=await post(owner,'😀'.repeat(5000),{state:'draft',tags:['Тактика']});
 assert.equal((await request('GET',`/posts/${draft.id}`)).statusCode,404);
 assert.equal((await request('GET',`/posts/${draft.id}`,other)).statusCode,404);
 assert.equal((await request('GET',`/posts?authorId=${owner.id}&state=draft`,owner)).json().items.some((p:any)=>p.id===draft.id),true);
 assert.equal((await request('PATCH',`/posts/${draft.id}`,other,{body:'Чужая правка'})).statusCode,404);
 const published=await request('PATCH',`/posts/${draft.id}`,owner,{body:'Опубликованная редакция',state:'published'});assert.equal(published.statusCode,200,published.body);
 assert.equal((await request('GET',`/posts/${draft.id}`)).json().body,'Опубликованная редакция');
 assert.equal((await request('GET',`/posts/${draft.id}/revisions`,owner)).json().items.length,2);
 assert.equal((await request('GET',`/posts/${draft.id}/revisions`,other)).statusCode,404);
 assert.equal((await request('DELETE',`/posts/${draft.id}`,owner)).statusCode,200);
 assert.equal((await request('GET',`/posts/${draft.id}`,owner)).statusCode,404);
});

test('feed, follows, tags, mentions and bookmarks inherit current privacy and are idempotent',async()=>{
 const owner=await createUser();const reader=await createUser();
 assert.equal((await request('PUT',`/profiles/${owner.id}/follow`,reader)).statusCode,200);
 const first=await post(owner,`Обращение @${reader.viewer.handle}`,{tags:['Тактика']});const second=await post(owner,'Следующая запись');
 const following=(await request('GET','/feed?mode=following&limit=1',reader)).json();assert.equal(following.items[0].id,second.id);assert.ok(following.nextCursor);
 const next=(await request('GET',`/feed?mode=following&limit=1&cursor=${following.nextCursor}`,reader)).json();assert.equal(next.items[0].id,first.id);
 assert.equal((await request('GET','/feed?tag=тактика')).json().items.some((p:any)=>p.id===first.id),true);
 assert.equal((await request('GET','/mentions',reader)).json().items.some((p:any)=>p.id===first.id),true);
 for(let i=0;i<2;i++){assert.equal((await request('PUT',`/posts/${first.id}/bookmark`,reader)).statusCode,200);assert.equal((await request('PUT',`/posts/${first.id}/like`,reader)).statusCode,200);}
 assert.equal((await request('GET',`/posts/${first.id}`,reader)).json().like_count,1);
 assert.equal((await request('GET','/bookmarks',reader)).json().items.some((p:any)=>p.id===first.id),true);
 await execute("UPDATE users SET visibility='hidden' WHERE id=$1",[owner.id]);
 assert.equal((await request('GET',`/posts/${first.id}`,reader)).statusCode,404);
 assert.equal((await request('GET','/bookmarks',reader)).json().items.some((p:any)=>p.id===first.id),false);
 assert.equal((await request('GET','/mentions',reader)).json().items.some((p:any)=>p.id===first.id),false);
});

test('hidden followers never leak in lists, counts or identifying follow notifications',async()=>{
 const owner=await createUser();const hidden=await createUser({visibility:'hidden'});const publicFollower=await createUser();
 assert.equal((await request('PUT',`/profiles/${owner.id}/follow`,hidden)).statusCode,200);
 let followers=(await request('GET',`/profiles/${owner.id}/followers`,owner)).json();assert.equal(followers.count,0);assert.deepEqual(followers.items,[]);
 assert.equal(Number((await one<{count:string}>("SELECT count(*) FROM outbox WHERE type='notification' AND payload->>'recipient'=$1 AND payload->>'eventType'='follow' AND payload->>'actorId'=$2",[owner.id,hidden.id]))?.count),0);
 assert.equal((await request('GET',`/profiles/${hidden.id}/following`,hidden)).json().items[0].id,owner.id);
 assert.equal((await request('GET',`/profiles/${hidden.id}/following`)).statusCode,404);
 await request('PUT',`/profiles/${owner.id}/follow`,publicFollower);
 followers=(await request('GET',`/profiles/${owner.id}/followers`)).json();assert.equal(followers.count,1);assert.equal(followers.items[0].id,publicFollower.id);assert.ok(!JSON.stringify(followers).includes(hidden.id));
});

test('block serializes follow/like races, cleans both directions and preserves filtered nested history',async()=>{
 const a=await createUser();const b=await createUser();const c=await createUser();const pa=await post(a);const pb=await post(b);const pc=await post(c);
 await request('PUT',`/profiles/${b.id}/follow`,a);await request('PUT',`/profiles/${a.id}/follow`,b);
 await request('PUT',`/posts/${pb.id}/like`,a);await request('PUT',`/posts/${pa.id}/like`,b);
 const ca=await comment(a,pc.id,'От A');const cb=await comment(b,pc.id,'От B',ca.id);const cc=await comment(c,pc.id,'Ответ C',cb.id);
 const race=await Promise.all([request('PUT',`/profiles/${b.id}/follow`,a),request('PUT',`/posts/${pb.id}/like`,a),request('PUT',`/profiles/${b.id}/block`,a)]);
 assert.equal(race[2].statusCode,200,race[2].body);
 assert.equal(Number((await one<{count:string}>('SELECT count(*) FROM follows WHERE (follower_id=$1 AND followee_id=$2) OR (follower_id=$2 AND followee_id=$1)',[a.id,b.id]))?.count),0);
 assert.equal(Number((await one<{count:string}>('SELECT count(*) FROM reactions WHERE (user_id=$1 AND post_id=$3) OR (user_id=$2 AND post_id=$4)',[a.id,b.id,pb.id,pa.id]))?.count),0);
 const seenA=(await request('GET',`/posts/${pc.id}/comments`,a)).json().items;assert.equal(seenA.some((x:any)=>x.id===cb.id),false);assert.equal(seenA.find((x:any)=>x.id===cc.id).parent_id,null);
 const guest=(await request('GET',`/posts/${pc.id}/comments`)).json().items;assert.equal(guest.length,3);
 assert.equal((await request('POST',`/posts/${pc.id}/comments`,a,{body:'Ответ через заблокированного предка',parent_id:cc.id})).statusCode,404);
 assert.equal((await request('POST',`/posts/${pb.id}/comments`,a,{body:'Запрещено'})).statusCode,404);
 await request('PUT',`/profiles/${a.id}/block`,b);await request('DELETE',`/profiles/${b.id}/block`,a);
 assert.equal((await request('PUT',`/profiles/${b.id}/follow`,a)).statusCode,404);
 await request('DELETE',`/profiles/${a.id}/block`,b);assert.equal((await request('GET',`/profiles/${a.id}/following`,a)).json().count,0);
});

test('hidden ordinary comment exposes only the permitted name and supports own editing',async()=>{
 const owner=await createUser();const hidden=await createUser({visibility:'hidden'});const p=await post(owner);const c=await comment(hidden,p.id);
 const publicComment=(await request('GET',`/posts/${p.id}/comments`)).json().items[0];assert.equal(publicComment.author.id,null);assert.equal(publicComment.author.handle,hidden.viewer.handle);assert.equal(publicComment.author.profile_url,null);assert.equal(publicComment.author.avatar_url,null);assert.equal(publicComment.can_edit,false);
 assert.equal(c.can_edit,true);assert.equal((await request('PATCH',`/comments/${c.id}`,hidden,{body:'Изменено'})).statusCode,200);
 assert.equal((await request('DELETE',`/comments/${c.id}`,hidden)).statusCode,200);assert.equal((await request('GET',`/posts/${p.id}/comments`)).json().items.length,0);
});

test('club comments enforce public/member rules and preserve private nickname under old archive ACL',async()=>{
 const owner=await createUser();const hidden=await createUser({visibility:'hidden'});const f=await clubPost(owner,hidden);
 assert.equal((await request('GET',`/posts/${f.postId}`)).statusCode,404);const c=await comment(hidden,f.postId);
 assert.equal(c.author.display_name,'Клубный псевдоним');assert.equal(c.author.handle,null);assert.equal(c.author.profile_url,null);
 await execute("UPDATE clubs SET feed_visibility='public' WHERE id=$1",[f.clubId]);
 assert.equal((await request('GET',`/posts/${f.postId}`)).statusCode,404);
 await execute("UPDATE club_memberships SET state='left',revoked_at=now() WHERE club_id=$1 AND user_id=$2",[f.clubId,hidden.id]);
 const history=(await request('GET',`/posts/${f.postId}/comments`,owner)).json().items;assert.equal(history[0].author.display_name,'Клубный псевдоним');
 const publicClub=await clubPost(owner,hidden,'public');
 assert.equal((await request('POST',`/posts/${publicClub.postId}/comments`,hidden,{body:'Не разрешено'})).statusCode,403);
 const outsider=await createUser();assert.equal((await request('POST',`/posts/${publicClub.postId}/comments`,outsider,{body:'Без членства'})).statusCode,403);
 await execute("UPDATE clubs SET feed_visibility='members_only' WHERE id=$1",[publicClub.clubId]);assert.equal((await request('GET',`/posts/${publicClub.postId}`)).statusCode,404);
 await execute("UPDATE clubs SET state='archived' WHERE id=$1",[f.clubId]);assert.equal((await request('POST',`/posts/${f.postId}/comments`,owner,{body:'В архиве'})).statusCode,409);
});

test('media validates actual bytes, strips metadata and checks privacy on every read and revision',async()=>{
 const owner=await createUser();const other=await createUser();
 const jpeg=await sharp({create:{width:8,height:8,channels:3,background:'#336699'}}).jpeg().withExif({IFD0:{Artist:'Private metadata'}}).toBuffer();
 const uploaded=await upload(owner,jpeg);assert.equal(uploaded.statusCode,200,uploaded.body);const image=uploaded.json();
 assert.equal((await request('GET',`/media/${image.id}`)).statusCode,404);
 const own=await request('GET',`/media/${image.id}`,owner);assert.equal(own.statusCode,200);assert.equal(own.headers['cache-control'],'private, no-store');const meta=await sharp(own.rawPayload).metadata();assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);
 assert.equal((await upload(owner,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),'fake.png','image/png')).statusCode,422);
 assert.equal((await upload(owner,Buffer.alloc(10*1024*1024+1,1))).statusCode,413);
 const p=await post(owner,'Изображение',{images:[image.id]});assert.equal((await request('GET',`/media/${image.id}`)).statusCode,200);
 assert.equal((await request('DELETE',`/media/${image.id}`,owner)).statusCode,409);
 assert.equal((await request('POST','/posts',other,{body:'Чужое изображение',images:[image.id]})).statusCode,422);
 await execute("UPDATE users SET visibility='hidden' WHERE id=$1",[owner.id]);assert.equal((await request('GET',`/media/${image.id}`,other)).statusCode,404);
 await execute("UPDATE users SET visibility='public' WHERE id=$1",[owner.id]);assert.equal((await request('GET',`/media/${image.id}`)).statusCode,200);
 await request('PATCH',`/posts/${p.id}`,owner,{images:[]});assert.equal((await request('GET',`/media/${image.id}`)).statusCode,404);
 assert.equal((await request('DELETE',`/media/${image.id}`,owner)).statusCode,200);assert.equal((await request('GET',`/media/${image.id}`,owner)).statusCode,404);
});

test('profile and historic private club avatar media inherit their own ACL, including after leaving and deletion',async()=>{
 const owner=await createUser();const hidden=await createUser({visibility:'hidden'});const outsider=await createUser();
 const jpeg=await sharp({create:{width:6,height:6,channels:3,background:'#117755'}}).jpeg().toBuffer();
 const image=(await upload(hidden,jpeg)).json();await execute('UPDATE users SET avatar_id=$2 WHERE id=$1',[hidden.id,image.id]);
 assert.equal((await request('GET',`/media/${image.id}`)).statusCode,404);assert.equal((await request('GET',`/media/${image.id}`,outsider)).statusCode,404);
 const f=await clubPost(owner,hidden);await execute('UPDATE club_memberships SET avatar_id=$3 WHERE club_id=$1 AND user_id=$2',[f.clubId,hidden.id,image.id]);
 const c=await comment(hidden,f.postId);assert.equal(c.author.avatar_url,`/api/v1/media/${image.id}`);
 assert.equal((await request('GET',`/media/${image.id}`,owner)).statusCode,200);assert.equal((await request('GET',`/media/${image.id}`,outsider)).statusCode,404);
 await execute("UPDATE club_memberships SET state='left',revoked_at=now() WHERE club_id=$1 AND user_id=$2",[f.clubId,hidden.id]);
 assert.equal((await request('GET',`/media/${image.id}`,owner)).statusCode,200);
 await execute("UPDATE users SET status='deleted' WHERE id=$1",[hidden.id]);
 const historical=(await request('GET',`/posts/${f.postId}/comments`,owner)).json().items[0];assert.equal(historical.author.display_name,'Удалённый участник');assert.equal(historical.author.avatar_url,null);
 assert.equal((await request('GET',`/media/${image.id}`,owner)).statusCode,404);
});
