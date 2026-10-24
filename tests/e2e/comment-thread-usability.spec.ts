import {test,expect} from '@playwright/test';
import {account,api,browserPerson,noOverflow} from './helpers.js';

test('длинная ветка сообщает число вложенных ответов и позволяет развернуть её',async({browser})=>{
 const owner=await account();
 const ui=await browserPerson(browser,owner);
 try{
  const post=await api<{id:string}>(owner.context,'/posts','POST',{body:'Проверка обсуждения '+owner.handle,state:'published'});
  const root=await api<{id:string}>(owner.context,'/posts/'+post.id+'/comments','POST',{body:'Корень '+owner.handle});
  const child=await api<{id:string}>(owner.context,'/posts/'+post.id+'/comments','POST',{body:'Ответ первого уровня '+owner.handle,parent_id:root.id});
  await api(owner.context,'/posts/'+post.id+'/comments','POST',{body:'Ответ второго уровня '+owner.handle,parent_id:child.id});
  await ui.page.goto('/posts/'+post.id);
  const rootNode=ui.page.locator('.comment').filter({has:ui.page.getByText('Корень '+owner.handle,{exact:true})});
  await expect(rootNode.getByRole('button',{name:'Скрыть 2 ответа'})).toBeVisible();
  await rootNode.getByRole('button',{name:'Скрыть 2 ответа'}).click();
  const control=rootNode.getByRole('button',{name:'Показать 2 ответа'});
  await expect(control).toHaveAttribute('aria-expanded','false');
  await expect(rootNode.getByText('Ответ первого уровня '+owner.handle,{exact:true})).toHaveCount(0);
  await expect(rootNode.getByText('Ответ второго уровня '+owner.handle,{exact:true})).toHaveCount(0);
  await control.click();
  await expect(rootNode.getByRole('button',{name:'Скрыть 2 ответа'})).toHaveAttribute('aria-expanded','true');
  await expect(rootNode.getByText('Ответ второго уровня '+owner.handle,{exact:true})).toBeVisible();
  await noOverflow(ui.page);
  expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await owner.context.dispose();}
});

test('редактор ответа показывает исходный комментарий и ссылку возврата',async({browser})=>{
 const owner=await account();
 const ui=await browserPerson(browser,owner);
 try{
  const post=await api<{id:string}>(owner.context,'/posts','POST',{body:'Тест навигации '+owner.handle,state:'published'});
  const comment=await api<{id:string}>(owner.context,'/posts/'+post.id+'/comments','POST',{body:'Важный вопрос о матче '+owner.handle});
  await ui.page.setViewportSize({width:360,height:780});
  await ui.page.goto('/posts/'+post.id);
  const node=ui.page.locator('.comment').filter({has:ui.page.getByText('Важный вопрос о матче '+owner.handle,{exact:true})});
  await node.getByRole('button',{name:'Ответить',exact:true}).click();
  const context=ui.page.locator('.reply-context');
  await expect(context).toContainText('Важный вопрос о матче '+owner.handle);
  const backlink=context.getByRole('link',{name:'К комментарию'});
  await expect(backlink).toHaveAttribute('href','#comment-'+comment.id);
  await expect(ui.page.getByLabel('Ответить',{exact:true})).toBeFocused();
  await backlink.click();
  await expect(node).toBeInViewport();
  await noOverflow(ui.page);
  expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await owner.context.dispose();}
});

test('гостю ответ на комментарий предлагает вход с возвратом к публикации',async({page,request})=>{
 const owner=await account();
 try{
  const post=await api<{id:string}>(owner.context,'/posts','POST',{body:'Открытая дискуссия '+owner.handle,state:'published'});
  await api(owner.context,'/posts/'+post.id+'/comments','POST',{body:'Комментарий владельца '+owner.handle});
  await page.goto('/posts/'+post.id);
  const node=page.locator('.comment').filter({has:page.getByText('Комментарий владельца '+owner.handle,{exact:true})});
  await node.getByRole('link',{name:'Ответить',exact:true}).click();
  await expect(page).toHaveURL(new RegExp('/login\\?returnTo=%2Fposts%2F'+post.id+'$'));
 }finally{await owner.context.dispose();}
});
