import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import {account,api,browserPerson,noOverflow,origin,password} from './helpers.js';

test.setTimeout(90000);

test('уведомления и жалобы догружают историю и показывают разрешённый материал',async({browser},testInfo)=>{
 const owner=await account({moderator:true}),other=await account();const ui=await browserPerson(browser,owner);
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try{
  const post=await api<{id:string}>(other.context,'/posts','POST',{body:'История уведомлений '+randomUUID()});
  await db.query(`INSERT INTO notifications(recipient_id,event_type,object_type,object_id,actor_id,created_at,read_at)
   SELECT $1,'comment','post',$2,$3,now()-g*interval '1 microsecond',CASE WHEN g<63 THEN now() ELSE NULL END FROM generate_series(1,63) g`,[owner.id,post.id,other.id]);
  await ui.page.goto('/notifications');
  await expect.soft(ui.page.locator('.sidebar .count-badge')).toHaveText('1');
  const more=ui.page.getByRole('button',{name:'Показать ещё'});
  for(let i=0;i<4&&await more.count();i++){const before=await ui.page.locator('.notification-entry').count();await more.click();await expect(ui.page.locator('.notification-entry')).not.toHaveCount(before);}
  await expect.soft(ui.page.locator('.notification-entry')).toHaveCount(63);
  const mark=ui.page.getByRole('button',{name:'Отметить как прочитанное'});
  await expect.soft(mark).toHaveCount(1);
  if(await mark.count()){
   await mark.click();await expect(ui.page.locator('.notification.unread')).toHaveCount(0);
   await expect(ui.page.locator('.notification-entry')).toHaveCount(63);
   expect((await api(owner.context,'/me/notifications/unread-count')).unread_count).toBe(0);
  }
  const lfg=await api<{id:string}>(other.context,'/lfg','POST',{server:'EU',roles:['mid'],description:'Доступный материал жалобы '+randomUUID(),expires_at:new Date(Date.now()+86400000).toISOString(),pending_policy:'keep'});
  const marker=randomUUID().slice(0,8);const report=await api<{id:string}>(owner.context,'/reports','POST',{target_type:'lfg',target_id:lfg.id,reason:marker+' Старая нерассмотренная жалоба'});
  await db.query("UPDATE reports SET created_at=now()-interval '30 days' WHERE id=$1",[report.id]);
  await db.query(`INSERT INTO reports(reporter_id,target_type,target_id,reason) SELECT $1,'lfg',$2,$3||' Новое обращение '||g FROM generate_series(1,40) g`,[owner.id,lfg.id,marker]);
  await ui.page.goto('/platform/moderation/reports?state=open');
  await expect(ui.page.locator('.report-row').first()).toBeVisible();
  const queueMore=ui.page.getByRole('button',{name:'Показать ещё'});
  const old=ui.page.locator('a[href="/platform/moderation/reports/'+report.id+'"]');
  for(let i=0;i<20&&await queueMore.count()&&!await old.count();i++){const before=await ui.page.locator('.report-row').count();await queueMore.click();await expect(ui.page.locator('.report-row')).not.toHaveCount(before);}
  await expect.soft(ui.page.locator('.report-row').filter({hasText:marker})).toHaveCount(41);
  await expect.soft(old).toBeVisible();
  if(await old.count()){
   await old.click();await expect(ui.page.getByRole('link',{name:'Открыть материал'})).toHaveAttribute('href','/lfg/'+lfg.id);
   await expect(ui.page.locator('.evidence')).toContainText('Доступный материал жалобы');
   await ui.page.screenshot({path:testInfo.outputPath('moderation-evidence.png'),fullPage:true});
  }
  await noOverflow(ui.page);expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await owner.context.dispose();await other.context.dispose();await db.end();}
});

test('формы выделяют ошибки, разрешают конфликт профиля и убирают изображения',async({browser},testInfo)=>{
 const guest=await browser.newContext();const signup=await guest.newPage();
 try{
  let requests=0;signup.on('request',r=>{if(r.url().endsWith('/api/v1/auth/register')&&r.method()==='POST')requests++;});
  await signup.goto(origin+'/signup');
  await signup.locator('[name=email]').fill('test-'+randomUUID()+'@example.com');await signup.locator('[name=display_name]').fill('Новый игрок');
  await signup.locator('[name=handle]').fill('игрок');await signup.locator('[name=password]').fill(password);
  await signup.getByRole('button',{name:'Создать аккаунт'}).click();
  await expect.soft(signup.locator('[name=handle]')).toHaveAttribute('aria-invalid','true');
  await expect.soft(signup.locator('[name=handle]')).toBeFocused();
  expect.soft(requests).toBe(0);
  if(await signup.locator('[name=handle][aria-invalid=true]').count()){
   const described=(await signup.locator('[name=handle]').getAttribute('aria-describedby'))!.split(' ').at(-1);const help=signup.locator('[id="'+described+'"]');
   await expect(help).toContainText('латин');
  }
  await signup.screenshot({path:testInfo.outputPath('signup-error.png'),fullPage:true});
 }finally{await guest.close();}

 const owner=await account();const ui=await browserPerson(browser,owner);
 try{
  const buffer=await sharp({create:{width:160,height:80,channels:3,background:'#526b88'}}).png().toBuffer();
  const session=await(await owner.context.get('/api/v1/auth/session')).json();
  const upload=await owner.context.post('/api/v1/media',{headers:{Origin:origin,'X-CSRF-Token':session.csrfToken},multipart:{file:{name:'avatar.png',mimeType:'image/png',buffer}}});expect(upload.ok(),await upload.text()).toBe(true);
  const media=await upload.json();let profile=await api(owner.context,'/me/profile');
  await api(owner.context,'/me/profile','PATCH',{version:profile.version,avatar_id:media.id,cover_id:media.id});
  await ui.page.goto('/me/edit');const newName='Сохранённый ввод '+randomUUID().slice(0,8);
  await ui.page.locator('[name=display_name]').fill(newName);
  profile=await api(owner.context,'/me/profile');const newBiography='Правка из другой вкладки '+randomUUID();
  await api(owner.context,'/me/profile','PATCH',{version:profile.version,biography:newBiography});
  // A successful upload revalidates the loader; it must not silently adopt a
  // newer version while the text fields still contain the user's old baseline.
  const revalidated=ui.page.waitForResponse(r=>r.url().endsWith('/api/v1/me/profile')&&r.request().method()==='GET');
  await ui.page.getByLabel('Аватар',{exact:true}).setInputFiles({name:'new-avatar.png',mimeType:'image/png',buffer});
  await revalidated;await ui.page.waitForLoadState('networkidle');
  await ui.page.getByRole('link',{name:'Назад',exact:true}).click();await expect(ui.page).toHaveURL(/\/me$/);
  await ui.page.getByRole('link',{name:'Редактировать профиль'}).click();await expect(ui.page.locator('[name=display_name]')).toHaveValue(newName);
  await ui.page.getByRole('button',{name:'Сохранить изменения'}).click();
  const retry=ui.page.getByRole('button',{name:'Сохранить мой ввод',exact:true});await expect.soft(retry).toBeVisible();
  expect.soft((await api(owner.context,'/me/profile')).biography).toBe(newBiography);
  await expect(ui.page.locator('[name=display_name]')).toHaveValue(newName);
  if(await retry.count()){
   await ui.page.screenshot({path:testInfo.outputPath('profile-conflict.png'),fullPage:true});
   await retry.click();await expect(ui.page).toHaveURL(/\/me$/);
   const result=await api(owner.context,'/me/profile');expect(result.display_name).toBe(newName);expect(result.biography).toBe(newBiography);
  }
  await ui.page.goto('/me/edit');
  const avatar=ui.page.getByRole('button',{name:'Убрать аватар',exact:true}),cover=ui.page.getByRole('button',{name:'Убрать обложку',exact:true});
  await expect.soft(avatar).toBeVisible();await expect.soft(cover).toBeVisible();
  if(await avatar.count()&&await cover.count()){
   await avatar.click();await expect(ui.page.getByAltText('Аватар',{exact:true})).toHaveCount(0);
   await ui.page.getByRole('button',{name:'Вернуть сохранённый аватар'}).click();await expect(ui.page.getByAltText('Аватар',{exact:true})).toBeVisible();
   await avatar.click();await cover.click();await ui.page.getByRole('button',{name:'Сохранить изменения'}).click();await expect(ui.page).toHaveURL(/\/me$/);
   const cleared=await api(owner.context,'/me/profile');expect(cleared.avatar_id).toBeNull();expect(cleared.cover_id).toBeNull();
  }
  await noOverflow(ui.page);expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await owner.context.dispose();}
});
