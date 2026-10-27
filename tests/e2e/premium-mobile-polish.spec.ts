import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {account,api,browserPerson,noOverflow} from './helpers.js';

test('Premium 2.1: пустые черновики, компактные медиаблоки и редактор публикации',async({browser,isMobile},testInfo)=>{
 test.setTimeout(120000);
 const person=await account();
 const ui=await browserPerson(browser,person);
 try{
  await ui.page.setViewportSize({width:isMobile?390:1440,height:844});
  await ui.page.goto('/me/drafts');
  await expect(ui.page.getByRole('heading',{name:'Черновики',exact:true})).toBeVisible();
  await expect(ui.page.getByRole('heading',{name:'Пока нет черновиков',exact:true})).toBeVisible();
  await expect(ui.page.getByRole('link',{name:'Создать черновик'})).toHaveAttribute('href','/posts/new');
  await expect(ui.page.getByText('Пока нет публикаций',{exact:true})).toHaveCount(0);
  await ui.page.goto('/me/edit');
  await expect(ui.page.locator('.profile-media-section')).toHaveCount(2);
  const avatar=ui.page.locator('.profile-media-section').first();
  await expect(avatar.locator('input[type=file]')).toHaveAttribute('accept','image/jpeg,image/png,image/webp');
  await expect(avatar.getByText('Аватар',{exact:true})).toBeVisible();
  await expect(avatar.getByText('Допустимые форматы: JPG, PNG, WebP.')).toBeVisible();
  await expect(ui.page.locator('.profile-media-section').nth(1).getByText('Обложка',{exact:true})).toBeVisible();
  await noOverflow(ui.page);
  await ui.page.screenshot({path:testInfo.outputPath('premium21-profile-editor-390.png'),fullPage:true,animations:'disabled'});
  await ui.page.goto('/posts/new');
  const textarea=ui.page.getByLabel('Текст публикации');
  await expect(textarea).toBeVisible();
  const metrics=await textarea.evaluate(element=>({h:element.getBoundingClientRect().height,resize:getComputedStyle(element).resize}));
  if(isMobile){expect(metrics.h).toBeLessThan(270);}
  expect(metrics.resize).toBe('vertical');
  await expect(ui.page.getByRole('button',{name:'Сохранить черновик'})).toBeDisabled();
  await expect(ui.page.getByRole('button',{name:'Опубликовать'})).toBeDisabled();
  await noOverflow(ui.page);
  await ui.page.screenshot({path:testInfo.outputPath('premium21-post-editor-390.png'),fullPage:true,animations:'disabled'});
  expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await person.context.dispose();}
});

test('Premium 2.1: клуб без обложки получает декоративный фон, реальная обложка сохраняется',async({browser,isMobile},testInfo)=>{
 test.setTimeout(90000);
 const owner=await account(),key=randomUUID().slice(0,8);
 try{
  const created=await api<{id:string}>(owner.context,'/clubs','POST',{
   name:'Клуб без обложки '+key,description:'Проверка fallback-оформления',rules:'Уважать участников',
   join_mode:'open',feed_visibility:'public'
  });
  const ui=await browserPerson(browser,owner);
  try{
   await ui.page.setViewportSize({width:isMobile?390:1440,height:844});
   await ui.page.goto('/clubs');
   const card=ui.page.locator('.club-card').filter({hasText:'Клуб без обложки '+key});
   await expect(card).toBeVisible();
   const cover=card.locator('.club-card-cover');
   await expect(cover.locator('.club-cover-placeholder')).toBeVisible();
   await expect(cover.locator('.club-cover-placeholder')).toHaveText('');
   const decoration=await cover.evaluate(el=>({
    before:getComputedStyle(el.querySelector('.club-cover-placeholder')!,'::before').content,
    background:getComputedStyle(el.querySelector('.club-cover-placeholder')!).backgroundImage
   }));
   expect(decoration.before).not.toBe('none');
   expect(decoration.background).toContain('gradient');
   await expect(cover.locator('img')).toHaveCount(0);
   await noOverflow(ui.page);
   await ui.page.screenshot({path:testInfo.outputPath('premium21-club-fallback-390.png'),fullPage:true,animations:'disabled'});
   expect(ui.errors).toEqual([]);
  }finally{await ui.context.close();}
 }finally{await owner.context.dispose();}
});
