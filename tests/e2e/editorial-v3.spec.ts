import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {account,api,browserPerson,noOverflow} from './helpers.js';

test('Editorial V3: compact home and quick player search preserve active filters',async({page,isMobile},testInfo)=>{
 test.skip(!isMobile,'Mobile-first information hierarchy');
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.getByRole('region',{name:'Сообщество за пределами матча'})).toBeVisible();
 const masthead=await page.locator('.home-stage').boundingBox();
 expect(masthead?.height).toBeLessThan(205);
 await noOverflow(page);
 await page.goto('/discover?server=EU&role=mid');
 const quick=page.getByRole('search');
 await expect(quick.getByLabel('Поиск по имени или нику')).toBeVisible();
 const filters=page.getByRole('button',{name:'Фильтры',exact:true});
 await expect(filters).toHaveAttribute('aria-expanded','false');
 await expect(page.getByLabel('Игровая роль')).toBeHidden();
 await quick.getByLabel('Поиск по имени или нику').fill('Тест');
 await quick.getByRole('button',{name:'Найти',exact:true}).click();
 await expect(page).toHaveURL(/\/discover\?/);
 const url=new URL(page.url());
 expect(url.searchParams.get('server')).toBe('EU');
 expect(url.searchParams.get('role')).toBe('mid');
 expect(url.searchParams.get('q')).toBe('Тест');
 expect(url.searchParams.has('cursor')).toBe(false);
 await expect(page.getByRole('button',{name:'Фильтры',exact:true})).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:'Фильтры',exact:true}).click();
 await expect(page.getByLabel('Игровая роль')).toBeVisible();
 await expect(page.getByLabel('Игровая роль')).toHaveValue('mid');
 await expect(page.locator('.active-filters')).toContainText('Тест');
 await page.screenshot({path:testInfo.outputPath('editorial-v3-discovery-390.png'),fullPage:true,animations:'disabled'});
 await noOverflow(page);
 for(const width of [320,360,430]){
  await page.setViewportSize({width,height:844});
  await noOverflow(page);
  const quickRow=page.locator('.discovery-quick-row');
  const fits=await quickRow.evaluate(el=>el.scrollWidth<=el.clientWidth+1);
  expect(fits,`Quick search overflows at ${width}`).toBe(true);
 }
});

test('Editorial V3: real club dossier and own-profile shortcut grid preserve routes',async({browser,isMobile},testInfo)=>{
 test.skip(!isMobile,'Mobile-first club and profile layout');
 const owner=await account(),key=randomUUID().slice(0,8);
 const club=await api<{id:string}>(owner.context,'/clubs','POST',{
  name:'Редизайн '+key,description:'Настоящее тестовое сообщество для проверки экранов мобильной версии',
  join_mode:'open',feed_visibility:'public'
 });
 const ui=await browserPerson(browser,owner);
 try{
  for(const width of [320,390,430]){
   await ui.page.setViewportSize({width,height:844});
   await ui.page.goto('/me');
   await expect(ui.page.getByRole('heading',{name:'Мой профиль',exact:true})).toBeVisible();
   const activity=ui.page.getByRole('navigation',{name:'Твоя активность'});
   const company=ui.page.getByRole('navigation',{name:'Твоя компания'});
   for(const link of ['/me/posts','/me/drafts','/me/bookmarks','/me/following','/me/followers'])
    await expect(activity.locator('a[href="'+link+'"]')).toBeVisible();
   for(const link of ['/me/clubs','/me/lfg'])
    await expect(company.locator('a[href="'+link+'"]')).toBeVisible();
   const style=await activity.evaluate(el=>({display:getComputedStyle(el).display,columns:getComputedStyle(el).gridTemplateColumns}));
   expect(style.display).toBe('grid');
   expect(style.columns.split(' ').length).toBe(2);
   await noOverflow(ui.page);
   if(width===390)await ui.page.screenshot({path:testInfo.outputPath('editorial-v3-profile-390.png'),fullPage:true,animations:'disabled'});
   await ui.page.goto('/clubs/'+club.id);
   const dossier=ui.page.getByRole('region',{name:'Обзор клуба'});
   await expect(dossier).toBeVisible();
   await expect(dossier.getByRole('heading',{name:club.name,exact:true})).toBeVisible();
   await expect(dossier).toContainText('Открытая лента');
   await expect(dossier.getByRole('link',{name:/Написать/})).toHaveAttribute('href','/clubs/'+club.id+'/posts/new');
   await noOverflow(ui.page);
   if(width===390)await ui.page.screenshot({path:testInfo.outputPath('editorial-v3-club-390.png'),fullPage:true,animations:'disabled'});
  }
  expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await owner.context.dispose();}
});
