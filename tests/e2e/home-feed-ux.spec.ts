import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {account,api,noOverflow} from './helpers.js';

test('свёрнутая карусель остаётся свёрнутой при переходах внутри сайта',async({page,isMobile})=>{
 test.skip(!isMobile,'Проверка компактной мобильной главной');
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Основная мобильная навигация'});
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

test('первая публичная публикация читаема и видна без прокрутки на 390px',async({page,isMobile})=>{
 test.skip(!isMobile,'Проверка мобильной плотности ленты');
 const player=await account();
 try{
  const body='Проверка читабельности ленты '+randomUUID();
  await api(player.context,'/posts','POST',{body});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const card=page.locator('.post').filter({hasText:body});
  await expect(card).toBeVisible();
  const font=await card.locator('.copy').evaluate(el=>Number.parseFloat(getComputedStyle(el).fontSize));
  expect(font).toBeGreaterThanOrEqual(15);
  const rect=await card.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.y).toBeLessThan(560);
  await noOverflow(page);
 }finally{await player.context.dispose();}
});
