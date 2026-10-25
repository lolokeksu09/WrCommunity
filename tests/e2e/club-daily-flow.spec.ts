import {test,expect} from '@playwright/test';
import pg from 'pg';
import {account,api,browserPerson,noOverflow} from './helpers.js';

test('клуб догружает историю, выделяет встречи и объясняет проверку собственных редакций',async({browser},testInfo)=>{
 test.setTimeout(120000);
 const owner=await account(),member=await account();const a=await browserPerson(browser,owner),b=await browserPerson(browser,member);
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try{
  const club=await api(owner.context,'/clubs','POST',{name:'Клуб '+owner.handle,description:'Клуб истории, встреч и настоящих обсуждений',join_mode:'open',feed_visibility:'public'});
  await api(member.context,'/clubs/'+club.id+'/join','POST',{nickname:'Игрок клуба',roles:['mid'],consent:true,consent_version:1,history_acknowledged:true});
  const seeded:string[]=[];
  for(let i=0;i<25;i++){
   const p=(await pool.query("INSERT INTO posts(author_id,club_id,state,audience,created_at) VALUES($1,$2,'pending','public',now()-$3*interval '1 hour') RETURNING id",[owner.id,club.id,i])).rows[0];
   const r=(await pool.query("INSERT INTO post_revisions(post_id,body,status) VALUES($1,$2,'approved') RETURNING id",[p.id,i===24?'Важные правила нашей компании':'Обсуждение клуба '+i])).rows[0];
   await pool.query("UPDATE posts SET state='published',current_revision_id=$2 WHERE id=$1",[p.id,r.id]);seeded.push(p.id);
  }
  await pool.query('UPDATE clubs SET pinned_post_id=$2 WHERE id=$1',[club.id,seeded[24]]);
  await b.page.goto('/clubs/'+club.id);
  await expect(b.page.locator('.club-feed .post')).toHaveCount(20);
  await expect(b.page.locator('.club-feed').getByText('Закреплено', {exact:true})).toBeVisible();
  await expect(b.page.locator('.club-feed .post').first()).toContainText('Важные правила');
  await expect(b.page.getByRole('navigation',{name:'Разделы клуба'}).getByRole('link',{name:'Управление',exact:true})).toHaveCount(0);
  await b.page.getByText('Закреплено',{exact:true}).scrollIntoViewIfNeeded();await b.page.screenshot({path:testInfo.outputPath('club-feed.png')});
  await b.page.route('**/api/v1/clubs/*/feed?*cursor=*',route=>route.abort());
  await b.page.getByRole('button',{name:'Показать ещё',exact:true}).click();await expect(b.page.getByRole('alert')).toBeVisible();
  await b.page.unroute('**/api/v1/clubs/*/feed?*cursor=*');
  await b.page.getByRole('button',{name:'Показать ещё',exact:true}).click();await expect(b.page.locator('.club-feed .post')).toHaveCount(25);
  await b.page.locator('.club-feed .post').last().getByRole('link',{name:'Комментарии',exact:true}).click();
  await expect(b.page.getByRole('heading',{name:'Публикация',exact:true})).toBeVisible();await b.page.goBack();
  await expect(b.page.locator('.club-feed .post')).toHaveCount(25);await expect.poll(()=>b.page.evaluate(()=>window.scrollY)).toBeGreaterThan(1000);
  await noOverflow(b.page);
  const future=(minutes:number)=>new Date(Date.now()+minutes*60000).toISOString();
  async function createEvent(title:string,minutes:number){return api(owner.context,'/clubs/'+club.id+'/events','POST',{title,description:'Совместная игра и обсуждение',audience:'public',starts_at:future(minutes),ends_at:future(minutes+60),registration_closes_at:future(minutes-30),capacity:5});}
  const late=await createEvent('Поздняя встреча',300),early=await createEvent('Ближайшая встреча',120),cancelled=await createEvent('Отменённая встреча',240),past=await createEvent('Прошедшая встреча',400);
  await api(owner.context,'/events/'+cancelled.id+'/cancel','POST',{});
  await pool.query("UPDATE events SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour',registration_closes_at=now()-interval '3 hours' WHERE id=$1",[past.id]);
  await api(member.context,'/events/'+early.id+'/registration','POST',{});
  await b.page.getByRole('navigation',{name:'Разделы клуба'}).getByRole('link',{name:'Встречи',exact:true}).click();
  await expect(b.page.locator('.club-events .event-card h2')).toHaveText(['Ближайшая встреча','Поздняя встреча']);
  await expect(b.page.locator('.club-events').getByText('Ты участвуешь',{exact:true})).toBeVisible();
  await noOverflow(b.page);await b.page.evaluate(()=>window.scrollTo(0,0));await b.page.screenshot({path:testInfo.outputPath('club-events.png'),fullPage:true});
  await b.page.getByRole('link',{name:'Прошедшие',exact:true}).click();await expect(b.page.locator('.club-events .event-card h2')).toHaveText(['Прошедшая встреча']);
  await b.page.getByRole('link',{name:'Отменённые',exact:true}).click();await expect(b.page.locator('.club-events .event-card h2')).toHaveText(['Отменённая встреча']);
  await b.page.getByRole('navigation',{name:'Разделы клуба'}).getByRole('link',{name:'Мои публикации',exact:true}).click();
  await b.page.locator('.page-heading').getByRole('link',{name:'Написать публикацию',exact:true}).click();await b.page.getByLabel('Текст публикации').fill('Первый текст участника');
  await b.page.getByRole('button',{name:'Отправить на проверку'}).click();
  await expect(b.page.locator('.own-club-post')).toContainText('Публикация на проверке');
  await expect(b.page.locator('.own-club-post').getByRole('link',{name:'Открыть опубликованную версию'})).toHaveCount(0);
  await a.page.goto('/clubs/'+club.id+'/manage');await expect(a.page.getByRole('heading',{name:'Рассмотрение'})).toBeVisible();
  await a.page.getByRole('link',{name:/Проверка публикаций/}).click();
  await expect(a.page.getByRole('navigation',{name:'Очереди клуба'}).getByRole('link',{name:'Заявки',exact:true})).toBeVisible();
  await a.page.locator('.request-card').filter({hasText:'Первый текст участника'}).getByRole('button',{name:'Одобрить',exact:true}).click();
  await b.page.reload();await expect(b.page.locator('.own-club-post')).toContainText('Опубликовано');
  const post=(await api(member.context,'/clubs/'+club.id+'/my-posts')).items[0];
  await b.page.locator('.own-club-post').getByRole('link',{name:'Редактировать',exact:true}).click();await b.page.getByLabel('Текст публикации').fill('Новая редакция только для проверки');await b.page.getByRole('button',{name:'Отправить на проверку'}).click();
  await expect(b.page.locator('.own-club-post')).toContainText('Новая редакция на проверке');
  await a.page.reload();const revision=a.page.locator('.request-card').filter({hasText:'Новая редакция только для проверки'});await revision.getByLabel('Причина решения').fill('Добавь подробности о времени игры');await revision.getByRole('button',{name:'Отклонить',exact:true}).click();
  await b.page.reload();await expect(b.page.locator('.own-club-post')).toContainText('Редакция отклонена');await expect(b.page.locator('.own-club-post')).toContainText('Добавь подробности о времени игры');
  await expect(b.page.locator('.own-club-post')).toContainText('Читателям доступна предыдущая версия');
  await noOverflow(b.page);await b.page.screenshot({path:testInfo.outputPath('club-revision.png'),fullPage:true});
  await b.page.locator('.own-club-post').getByRole('link',{name:'Открыть опубликованную версию'}).click();await expect(b.page.locator('.post.detail')).toContainText('Первый текст участника');await expect(b.page.locator('.post.detail')).not.toContainText('Новая редакция только для проверки');
  const publicPost=await api(owner.context,'/posts/'+post.id);expect(publicPost.body).toBe('Первый текст участника');
  await b.page.goto('/clubs/'+club.id+'/my-posts');
  await b.page.getByRole('button',{name:'Удалить публикацию',exact:true}).click();await b.page.getByRole('button',{name:'Подтвердить',exact:true}).click();
  await expect(b.page.getByRole('heading',{name:'Пока нет клубных публикаций'})).toBeVisible();
  expect([...a.errors,...b.errors]).toEqual([]);
 }finally{await pool.end();await a.context.close();await b.context.close();await owner.context.dispose();await member.context.dispose();}
});
