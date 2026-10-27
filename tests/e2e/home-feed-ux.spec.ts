import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {account,api,browserPerson,noOverflow} from './helpers.js';

test('свёрнутая карусель остаётся свёрнутой при переходах внутри сайта',async({page,isMobile})=>{
 test.skip(!isMobile,'Проверка компактной мобильной главной');
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Основная мобильная навигация'});
 // Compact by default, with real shortcuts visible before the first post.
 await expect(page.getByRole('button',{name:'Развернуть'})).toBeVisible();
 await expect(page.locator('.hero')).toHaveCount(0);
 const shortcuts=page.getByRole('navigation',{name:'Быстрые переходы'});
 await expect(shortcuts.getByRole('link',{name:/Игроки/})).toHaveAttribute('href','/discover');
 await expect(shortcuts.getByRole('link',{name:/Клубы/})).toHaveAttribute('href','/clubs');
 await expect(shortcuts.getByRole('link',{name:/Ищу команду/})).toHaveAttribute('href','/discover/lfg');
 await page.getByRole('button',{name:'Развернуть'}).click();
 await expect(page.locator('.hero')).toBeVisible();
 await page.getByRole('button',{name:'Свернуть'}).click();
 await expect(page.locator('.hero')).toHaveCount(0);
 await nav.getByRole('link',{name:'Клубы'}).click();
 await nav.getByRole('link',{name:'Лента'}).click();
 await expect(page.getByRole('button',{name:'Развернуть'})).toBeVisible();
 await expect(page.locator('.hero')).toHaveCount(0);
 await page.getByRole('button',{name:'Развернуть'}).click();
 await expect(page.locator('.hero')).toBeVisible();
});

test('вертикальный жест не перелистывает карусель, горизонтальный листает',async({page,isMobile})=>{
 test.skip(!isMobile,'Касания нужны только на мобильном устройстве');
 await page.goto('/');
 await page.getByRole('button',{name:'Развернуть'}).click();
 await expect(page.getByText('1 из 3')).toBeVisible();
 await page.locator('.hero').evaluate(hero=>{
  const start=new Touch({identifier:1,target:hero,clientX:200,clientY:180});
  const end=new Touch({identifier:1,target:hero,clientX:144,clientY:60});
  hero.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[start],changedTouches:[start]}));
  hero.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[end]}));
 });
 await expect(page.getByText('1 из 3')).toBeVisible();
 await page.locator('.hero').evaluate(hero=>{
  const start=new Touch({identifier:2,target:hero,clientX:215,clientY:160});
  const end=new Touch({identifier:2,target:hero,clientX:95,clientY:153});
  hero.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[start],changedTouches:[start]}));
  hero.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[end]}));
 });
 await expect(page.getByText('2 из 3')).toBeVisible();
 await noOverflow(page);
});

test('первая публичная публикация читаема и видна без прокрутки на 390px',async({page,isMobile},testInfo)=>{
 test.skip(!isMobile,'Проверка мобильной плотности ленты');
 const player=await account();
 try{
  const body='Проверка читабельности ленты '+randomUUID();
  await api(player.context,'/posts','POST',{body});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  // Other E2E workers may publish newer posts. Measure the first feed card,
  // not this fixture's position in a shared, concurrently updated feed.
  const card=page.locator('.post').first();
  await expect(card).toBeVisible();
  const font=await card.locator('.copy').evaluate(el=>Number.parseFloat(getComputedStyle(el).fontSize));
  expect(font).toBeGreaterThanOrEqual(15);
  const rect=await card.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.y).toBeLessThan(560);
  await expect(card).toHaveClass(/player-post/);
  await page.screenshot({path:testInfo.outputPath('premium2-populated-390.png'),fullPage:true});
  await noOverflow(page);
 }finally{await player.context.dispose();}
});

test('длинный и многострочный пост разворачивается в ленте без потери реакций',async({browser,isMobile})=>{
 const player=await account();
 const ui=await browserPerson(browser,player);
 try{
  const longBody=('Текст для чтения в ленте. '.repeat(100))+'Конец длинной публикации';
  const multiBody=Array.from({length:10},(_,i)=>'Строка '+(i+1)).join('\n');
  const long=await api(player.context,'/posts','POST',{body:longBody});
  await api(player.context,'/posts','POST',{body:multiBody});
  await api(player.context,'/posts','POST',{body:'Короткая публикация'});
  await ui.page.setViewportSize({width:isMobile?360:1440,height:900});
  await ui.page.goto('/users/'+player.id);
  const card=ui.page.locator('.post').filter({hasText:'Конец длинной публикации'});
  const toggle=card.getByRole('button',{name:'Читать полностью',exact:true});
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  const previewHeight=await card.locator('.copy').evaluate(el=>el.clientHeight);
  const url=ui.page.url();
  await toggle.focus();
  await ui.page.keyboard.press('Enter');
  const collapse=card.getByRole('button',{name:'Свернуть текст',exact:true});
  await expect(collapse).toHaveAttribute('aria-expanded','true');
  await expect(collapse).toBeFocused();
  await expect.poll(()=>card.locator('.copy').evaluate(el=>el.clientHeight)).toBeGreaterThan(previewHeight);
  expect(ui.page.url()).toBe(url);
  await card.getByRole('button',{name:'Нравится',exact:true}).click();
  await expect(card.getByRole('button',{name:'Убрать отметку нравится',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(collapse).toHaveAttribute('aria-expanded','true');
  await collapse.click();
  await expect(card.getByRole('button',{name:'Читать полностью',exact:true})).toHaveAttribute('aria-expanded','false');
  await expect.poll(()=>card.locator('.copy').evaluate(el=>el.clientHeight)).toBe(previewHeight);
  const short=ui.page.locator('.post').filter({hasText:'Короткая публикация'});
  await expect(short.getByRole('button',{name:'Читать полностью',exact:true})).toHaveCount(0);
  const multi=ui.page.locator('.post').filter({hasText:'Строка 10'});
  await multi.getByRole('button',{name:'Читать полностью',exact:true}).click();
  await expect(multi.getByRole('button',{name:'Свернуть текст',exact:true})).toHaveAttribute('aria-expanded','true');
  await noOverflow(ui.page);
  await card.getByRole('link',{name:'Открыть публикацию',exact:true}).click();
  await expect(ui.page).toHaveURL('/posts/'+long.id);
  await expect(ui.page.locator('.post.detail .copy')).toHaveText(longBody);
  await expect(ui.page.getByRole('button',{name:'Читать полностью',exact:true})).toHaveCount(0);
  expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await player.context.dispose();}
});
