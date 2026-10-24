import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {account,api,browserPerson,noOverflow} from './helpers.js';

test('поиск игроков и LFG догружает результаты и использует совместимые русские роли',async({browser})=>{
 test.setTimeout(90000);
 const owner=await account(),viewer=await account();const key=randomUUID().replaceAll('-','').slice(0,12),server='roles-'+key;
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
 const customRole='СохранённаяРоль'.repeat(5).slice(0,60);
 try{
  const initial=await api(viewer.context,'/me/profile');
  await api(viewer.context,'/me/profile','PATCH',{version:initial.version,game:{roles:{value:[customRole],public:false}}});
  for(let i=0;i<23;i++){
   await pool.query("INSERT INTO users(email,password_hash,handle,display_name,visibility,game) SELECT $1,password_hash,$2,$3,'public',$4::jsonb FROM users WHERE id=$5",[`${key}${i}@example.com`,`role_${key}_${i}`,`Игрок ${key} ${i}`,JSON.stringify({server:{value:server,public:true},roles:{value:['Мид'],public:true}}),owner.id]);
   await pool.query("INSERT INTO lfg_announcements(author_id,server,roles,description,expires_at,pending_policy) VALUES($1,$2,'[\"Мид\"]'::jsonb,$3,now()+interval '1 day','keep')",[owner.id,server,`Объявление ${key} ${i}`]);
  }
  const ui=await browserPerson(browser,viewer);
  try{
   await ui.page.goto('/discover?server='+encodeURIComponent(server)+'&role=mid');
   await expect(ui.page.locator('.person')).toHaveCount(20);
   await ui.page.route('**/api/v1/players/search?**cursor=*',route=>route.abort());
   await ui.page.getByRole('button',{name:'Показать ещё',exact:true}).click();
   await expect(ui.page.getByRole('alert')).toBeVisible();
   await expect(ui.page.locator('.person')).toHaveCount(20);
   await ui.page.unroute('**/api/v1/players/search?**cursor=*');
   await ui.page.getByRole('button',{name:'Показать ещё',exact:true}).click();
   await expect(ui.page.locator('.person')).toHaveCount(23);
   await expect(ui.page.getByRole('button',{name:'Показать ещё',exact:true})).toHaveCount(0);
   await ui.page.getByLabel('Игровая роль').selectOption('support');
   await ui.page.getByRole('button',{name:'Найти игроков',exact:true}).click();
   await expect(ui.page.locator('.person')).toHaveCount(0);
   await expect(ui.page.getByRole('heading',{name:'Пока нет совпадений'})).toBeVisible();
   await ui.page.goto('/discover/lfg?server='+encodeURIComponent(server)+'&role=mid');
   await expect(ui.page.locator('.lfg-card')).toHaveCount(20);
   await expect(ui.page.locator('.lfg-card h2').first()).toHaveText('Мид');
   await ui.page.getByRole('button',{name:'Показать ещё',exact:true}).click();
   await expect(ui.page.locator('.lfg-card')).toHaveCount(23);
   await ui.page.goto('/me/game');
   await expect(ui.page.getByRole('group',{name:'Роли',exact:true}).getByRole('checkbox',{name:customRole,exact:true})).toBeChecked();
   await noOverflow(ui.page);
   await ui.page.getByRole('group',{name:'Роли',exact:true}).getByRole('checkbox',{name:'Мид',exact:true}).check();
   await ui.page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
   await expect(ui.page.getByRole('heading',{name:'Мой профиль',exact:true})).toBeVisible();
   const saved=await api(viewer.context,'/me/profile');
   expect(saved.game.roles.value).toEqual(['mid',customRole]);expect(saved.game.roles.public).toBe(false);
   await ui.page.goto('/lfg/new');
   await ui.page.getByRole('group',{name:'Кого ищешь',exact:true}).getByRole('checkbox',{name:'Поддержка',exact:true}).check();
   await ui.page.getByLabel('Сервер',{exact:true}).fill(server);
   await ui.page.getByLabel('Описание',{exact:true}).fill('Объявление с ролью из общего словаря');
   await ui.page.getByLabel('Принимать отклики до').fill('2099-01-01T20:00');
   await ui.page.getByLabel('Что делать с нерассмотренными заявками после завершения').selectOption('keep');
   await ui.page.getByRole('button',{name:'Опубликовать объявление',exact:true}).click();
   await expect(ui.page.getByRole('heading',{name:'Поиск команды',exact:true})).toBeVisible();
   await expect(ui.page.locator('.pills')).toContainText('Поддержка');
   await noOverflow(ui.page);expect(ui.errors).toEqual([]);
  }finally{await ui.context.close();}
 }finally{await pool.end();await owner.context.dispose();await viewer.context.dispose();}
});
