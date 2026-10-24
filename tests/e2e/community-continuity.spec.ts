import {test,expect} from '@playwright/test';
import {account,api,browserPerson,noOverflow,password} from './helpers.js';

test('возврат сохраняет страницы и прокрутку, комментарии разделяют черновики и очищаются при выходе',async({browser,isMobile})=>{
 test.setTimeout(90000);
 const owner=await account();const ui=await browserPerson(browser,owner);const p=ui.page;
 try{
  for(let n=1;n<=21;n++)await api(owner.context,'/posts','POST',{body:'Возврат '+n+' '+owner.handle});
  const post=(await api(owner.context,'/posts?authorId='+owner.id)).items[0];
  const parent=await api(owner.context,'/posts/'+post.id+'/comments','POST',{body:'Исходный комментарий'});
  await p.setViewportSize({width:isMobile?390:1440,height:844});
  await p.goto('/me/posts');await p.getByRole('button',{name:'Показать ещё',exact:true}).click();
  await expect(p.locator('.post-list>.post')).toHaveCount(21);
  const oldest=p.locator('.post').filter({hasText:'Возврат 1 '+owner.handle});
  await oldest.locator('.post-content-link').evaluate(el=>el.scrollIntoView({block:'center'}));const scroll=await p.evaluate(()=>window.scrollY);
  await oldest.locator('.post-content-link').click();await expect(p).toHaveURL(/\/posts\/[a-f0-9-]+$/);
  await p.goBack();await expect(p.getByRole('heading',{name:'Мои публикации',exact:true})).toBeVisible();
  await expect(p.locator('.post-list>.post')).toHaveCount(21);
  await expect.poll(async()=>Math.abs(await p.evaluate(()=>window.scrollY)-scroll)).toBeLessThan(120);
  await p.goto('/posts/'+post.id);
  await p.getByLabel('Твой комментарий',{exact:true}).fill('Корневой черновик');
  await p.locator('#comment-'+parent.id).getByRole('button',{name:'Ответить',exact:true}).click();
  await p.getByLabel('Ответить',{exact:true}).fill('Черновик ответа');
  await p.locator('.brand:visible').first().click();await expect(p).toHaveURL('/');
  await p.goBack();await expect(p.getByLabel('Ответить',{exact:true})).toHaveValue('Черновик ответа');
  await expect(p.locator('.reply-context')).toContainText('Исходный комментарий');
  await p.getByRole('button',{name:'Отменить ответ',exact:true}).click();
  await expect(p.getByLabel('Твой комментарий',{exact:true})).toHaveValue('Корневой черновик');
  await p.getByRole('button',{name:'Отправить',exact:true}).click();
  await expect(p.getByLabel('Твой комментарий',{exact:true})).toHaveValue('');
  await p.getByLabel('Твой комментарий',{exact:true}).fill('Очистить после выхода');
  await p.locator('.bottom-nav a[href="/me"]:visible,.sidebar nav a[href="/me"]:visible').click();
  await p.locator('main').getByRole('link',{name:'Настройки',exact:true}).click();
  await p.getByRole('button',{name:'Выйти',exact:true}).click();await expect(p).toHaveURL('/');
  await p.locator('.mobile-header:visible,.sidebar:visible').getByRole('link',{name:isMobile?'Войти':'Войти в сообщество',exact:true}).click();
  await p.getByLabel('Электронная почта',{exact:true}).fill(owner.email);await p.getByLabel('Пароль',{exact:true}).fill(password);
  await p.getByRole('button',{name:'Войти',exact:true}).click();await expect(p).toHaveURL('/me');
  await p.getByRole('link',{name:'Публичный профиль',exact:true}).click();
  await p.locator('.post').filter({hasText:post.body}).locator('.post-content-link').click();
  await expect(p).toHaveURL('/posts/'+post.id);await expect(p.getByLabel('Твой комментарий',{exact:true})).toHaveValue('');
  await noOverflow(p);expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await owner.context.dispose();}
});

