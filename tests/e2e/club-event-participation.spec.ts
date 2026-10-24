import {test,expect} from '@playwright/test';
import {account,api,browserPerson,noOverflow} from './helpers.js';

test('встреча объясняет вступление и запись, клубные роли и ссылки участников сохраняют приватность',async({browser,page,isMobile},testInfo)=>{
 test.setTimeout(90000);
 const owner=await account(),player=await account(),hidden=await account({hidden:true});
 const ui=await browserPerson(browser,player),manager=await browserPerson(browser,owner);const p=ui.page;
 const identity=(nickname:string,roles:string[]=[])=>({nickname,roles,consent:true,consent_version:1,history_acknowledged:true});
 try{
  const club=await api(owner.context,'/clubs','POST',{name:'Встречи '+owner.handle,description:'Вечерняя игра',rules:'Общаемся уважительно',join_mode:'approval',feed_visibility:'public'});
  const event=await api(owner.context,'/clubs/'+club.id+'/events','POST',{title:'Совместный матч',description:'Собираемся играть вместе',audience:'public',starts_at:new Date(Date.now()+7200000).toISOString(),ends_at:new Date(Date.now()+10800000).toISOString(),registration_closes_at:new Date(Date.now()+3600000).toISOString(),capacity:3});
  await page.goto('/events/'+event.id);
  await expect(page.getByRole('link',{name:'Войти для участия',exact:true})).toHaveAttribute('href','/login?returnTo='+encodeURIComponent('/events/'+event.id));
  await p.setViewportSize({width:isMobile?390:1440,height:844});await p.goto('/events/'+event.id);
  await expect(p.getByRole('heading',{name:'Сначала вступи в клуб',exact:true})).toBeVisible();
  await p.getByRole('link',{name:'Подать заявку в клуб',exact:true}).click();
  await p.getByLabel('Клубный псевдоним',{exact:true}).fill('Напарник встречи');
  await p.getByRole('group',{name:'Игровые роли',exact:true}).getByRole('checkbox',{name:'Мид',exact:true}).check();
  await p.getByRole('checkbox',{name:'Разрешаю раскрыть эти данные в контексте этого клуба.',exact:true}).check();
  await p.getByRole('checkbox',{name:'Я понимаю правило сохранения исторических подписей.',exact:true}).check();
  await p.getByRole('button',{name:'Подать заявку',exact:true}).click();await expect(p).toHaveURL('/clubs/'+club.id);
  await p.goto('/events/'+event.id);await expect(p.getByRole('heading',{name:'Заявка в клуб на рассмотрении',exact:true})).toBeVisible();await expect(p.getByRole('button',{name:'Участвовать',exact:true})).toHaveCount(0);
  const request=(await api(owner.context,'/clubs/'+club.id+'/requests')).items.find((r:{nickname:string})=>r.nickname==='Напарник встречи');
  await api(owner.context,'/clubs/requests/'+request.membership_id+'/decision','POST',{decision:'approve'});
  await p.reload();await p.getByRole('button',{name:'Участвовать',exact:true}).click();await expect(p.getByRole('heading',{name:'Ты участвуешь',exact:true})).toBeVisible();await p.reload();await expect(p.getByRole('button',{name:'Отменить участие',exact:true})).toBeVisible();
  await api(owner.context,'/clubs/'+club.id+'/identity','PATCH',identity('Организатор',['Мид','Тактик']));
  await manager.page.setViewportSize({width:isMobile?390:1440,height:844});await manager.page.goto('/clubs/'+club.id+'/identity');
  const roles=manager.page.getByRole('group',{name:'Игровые роли',exact:true});await expect(roles.getByRole('checkbox',{name:'Мид',exact:true})).toBeChecked();await expect(roles.getByRole('checkbox',{name:'Тактик',exact:true})).toBeChecked();await roles.getByRole('checkbox',{name:'Лес',exact:true}).check();
  await manager.page.getByRole('button',{name:'Сохранить клубную личность',exact:true}).click();await expect(manager.page).toHaveURL('/clubs/'+club.id);
  expect((await api(owner.context,'/clubs/'+club.id)).membership.roles).toEqual(['jungle','mid','Тактик']);
  await api(owner.context,'/events/'+event.id+'/registration','POST',{});
  await api(hidden.context,'/clubs/'+club.id+'/requests','POST',identity('Скрытый участник встречи',['support']));
  const secret=(await api(owner.context,'/clubs/'+club.id+'/requests')).items.find((r:{nickname:string})=>r.nickname==='Скрытый участник встречи');await api(owner.context,'/clubs/requests/'+secret.membership_id+'/decision','POST',{decision:'approve'});await api(hidden.context,'/events/'+event.id+'/registration','POST',{});
  await page.reload();await expect(page.getByRole('heading',{name:'Мест нет',exact:true})).toBeVisible();
  await page.goto('/events/'+event.id+'/participants');await expect(page.locator('a[href="/users/'+player.id+'"]').first()).toBeVisible();await expect(page.getByText('Скрытый участник встречи',{exact:true})).toHaveCount(0);await expect(page.locator('a[href="/users/'+hidden.id+'"]')).toHaveCount(0);
  await manager.page.goto('/events/'+event.id+'/participants');await expect(manager.page.getByText('Скрытый участник встречи',{exact:true})).toBeVisible();await expect(manager.page.locator('a[href="/users/'+hidden.id+'"]')).toHaveCount(0);await expect(manager.page.getByText('Поддержка',{exact:true})).toBeVisible();
  await p.reload();await p.getByRole('button',{name:'Отменить участие',exact:true}).click();await expect(p.getByRole('button',{name:'Участвовать',exact:true})).toBeVisible();
  await noOverflow(p);await p.screenshot({path:testInfo.outputPath('event-participation.png'),fullPage:true});
  await api(owner.context,'/events/'+event.id+'/cancel','POST',{});await p.reload();await expect(p.getByRole('heading',{name:'Встреча отменена',exact:true})).toBeVisible();await expect(p.getByRole('button',{name:'Участвовать',exact:true})).toHaveCount(0);
  expect([...ui.errors,...manager.errors]).toEqual([]);
 }finally{await ui.context.close();await manager.context.close();await owner.context.dispose();await player.context.dispose();await hidden.context.dispose();}
});
