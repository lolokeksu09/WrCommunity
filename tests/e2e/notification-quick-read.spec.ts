import {test,expect} from '@playwright/test';
import {account,api,browserPerson,noOverflow} from './helpers.js';

test.setTimeout(90000);

test('новое уведомление можно прочитать без перехода со страницы',async({browser})=>{
 const owner=await account(),reader=await account();
 const ui=await browserPerson(browser,owner);
 try{
  const post=await api<{id:string}>(owner.context,'/posts','POST',{body:'Проверка управления уведомлениями '+owner.handle,state:'published'});
  await api(reader.context,'/posts/'+post.id+'/comments','POST',{body:'Новый ответ на публикацию'});
  await expect.poll(async()=>{
   const list=await api<{items:{id:string;read_at:string|null}[]}>(owner.context,'/me/notifications');
   return list.items.some(n=>!n.read_at);
  },{timeout:20000}).toBe(true);

  await ui.page.goto('/notifications');
  const item=ui.page.locator('.notification').filter({hasText:'Новый ответ в обсуждении'}).first();
  await expect(item).toBeVisible();
  await expect(item).toHaveClass(/unread/);
  await ui.page.getByRole('button',{name:'Отметить как прочитанное'}).first().click();
  await expect(ui.page).toHaveURL(/\/notifications$/);
  await expect(item).not.toHaveClass(/unread/);
  expect((await api<{items:{read_at:string|null}[]}>(owner.context,'/me/notifications')).items.every(n=>Boolean(n.read_at))).toBe(true);
  await ui.page.reload();
  await expect(item).not.toHaveClass(/unread/);
  await item.click();
  await expect(ui.page).toHaveURL(new RegExp('/posts/'+post.id+'$'));
  await noOverflow(ui.page);
  expect(ui.errors).toEqual([]);
 }finally{
  await ui.context.close();
  await owner.context.dispose();
  await reader.context.dispose();
 }
});
