import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {account,browserPerson,noOverflow} from './helpers.js';

test.setTimeout(90000);

test('вложения публикации открываются внутри сайта с переключением и возвратом фокуса',async({browser})=>{
 const owner=await account();
 const ui=await browserPerson(browser,owner);
 try{
  await ui.page.goto('/posts/new');
  await ui.page.getByLabel('Текст публикации').fill('Два вложения для просмотра '+randomUUID());
  const first=await sharp({create:{width:80,height:80,channels:3,background:'#336699'}}).png().toBuffer();
  const second=await sharp({create:{width:80,height:80,channels:3,background:'#993366'}}).png().toBuffer();
  await ui.page.locator('.upload-button input').setInputFiles([
   {name:'first.png',mimeType:'image/png',buffer:first},
   {name:'second.png',mimeType:'image/png',buffer:second},
  ]);
  await expect(ui.page.locator('.upload-grid img')).toHaveCount(2);
  await ui.page.getByRole('button',{name:'Опубликовать',exact:true}).click();
  await expect(ui.page).toHaveURL(/\/posts\/[a-f0-9-]+$/);
  const postUrl=ui.page.url();
  const opener=ui.page.getByRole('button',{name:'Открыть изображение 1 из 2'});
  await expect(opener).toBeVisible();
  await opener.click();
  const viewer=ui.page.getByRole('dialog',{name:'Просмотр изображений'});
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img',{name:'Изображение 1 из 2'})).toBeVisible();
  await viewer.getByRole('button',{name:'Следующее изображение'}).click();
  await expect(viewer.getByRole('img',{name:'Изображение 2 из 2'})).toBeVisible();
  await ui.page.keyboard.press('ArrowLeft');
  await expect(viewer.getByRole('img',{name:'Изображение 1 из 2'})).toBeVisible();
  await ui.page.keyboard.press('Escape');
  await expect(viewer).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(ui.page.url()).toBe(postUrl);
  await noOverflow(ui.page);
  expect(ui.errors).toEqual([]);
 }finally{
  await ui.context.close();
  await owner.context.dispose();
 }
});
