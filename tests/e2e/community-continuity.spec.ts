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
  await oldest.locator('.post-content-link').evaluate(el=>{el.scrollIntoView({block:'center'});el.addEventListener('click',()=>sessionStorage.setItem('e2e:departure-scroll',String(window.scrollY)),{once:true,capture:true});});
  await oldest.locator('.post-content-link').click();await expect(p).toHaveURL(/\/posts\/[a-f0-9-]+$/);
  const scroll=Number(await p.evaluate(()=>sessionStorage.getItem('e2e:departure-scroll')));
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
  await p.locator('main a[href="/me/settings"]').click();
  await p.getByRole('button',{name:'Выйти',exact:true}).click();await expect(p).toHaveURL('/');
  await p.locator('.mobile-header:visible,.sidebar:visible').getByRole('link',{name:isMobile?'Войти':'Войти в сообщество',exact:true}).click();
  await p.getByLabel('Электронная почта',{exact:true}).fill(owner.email);await p.getByLabel('Пароль',{exact:true}).fill(password);
  await p.getByRole('button',{name:'Войти',exact:true}).click();await expect(p).toHaveURL('/me');
  await p.getByRole('link',{name:'Мои публикации',exact:true}).click();
  await p.locator('.post').filter({hasText:post.body}).locator('.post-content-link').click();
  await expect(p).toHaveURL('/posts/'+post.id);await expect(p.getByLabel('Твой комментарий',{exact:true})).toHaveValue('');
  await noOverflow(p);expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await owner.context.dispose();}
});

test('меню закрывается, реакции обновляют только карточку, фильтры и пустые экраны предлагают нужный переход',async({browser,isMobile},testInfo)=>{
 test.setTimeout(90000);
 const owner=await account();const ui=await browserPerson(browser,owner);const p=ui.page;
 try{
  const post=await api(owner.context,'/posts','POST',{body:'Адресное обновление '+owner.handle});
  await api(owner.context,'/lfg','POST',{server:'EU',roles:['mid'],description:'Напарник для проверки поиска',expires_at:new Date(Date.now()+86400000).toISOString(),pending_policy:'keep'});
  await api(owner.context,'/clubs','POST',{name:'Клуб '+owner.handle,description:'Проверка поиска',rules:'Уважать участников',join_mode:'open',feed_visibility:'public'});
  await p.setViewportSize({width:isMobile?390:1440,height:844});await p.goto('/users/'+owner.id);
  const card=p.locator('.post').filter({hasText:post.body}),trigger=card.getByRole('button',{name:'Действия с публикацией',exact:true});
  await trigger.click();await expect(card.getByRole('group',{name:'Действия публикации',exact:true})).toBeVisible();
  await p.keyboard.press('Escape');await expect(trigger).toHaveAttribute('aria-expanded','false');await expect(trigger).toBeFocused();
  await trigger.click();await p.getByRole('heading',{name:'Профиль игрока',exact:true}).click();await expect(trigger).toHaveAttribute('aria-expanded','false');
  await p.route('**/api/v1/posts/'+post.id+'/like',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'verification_required',message:'Подтверди почту'}})}));
  await card.getByRole('button',{name:'Нравится',exact:true}).click();await expect(card.getByRole('alert')).toContainText('Подтверди почту');await expect(card).toBeVisible();
  await expect(card.getByRole('button',{name:'Нравится',exact:true})).toHaveAttribute('aria-pressed','false');await p.unroute('**/api/v1/posts/'+post.id+'/like');
  const requests:string[]=[];const collect=(request:import('@playwright/test').Request)=>{if(request.url().includes('/api/v1/'))requests.push(request.method()+' '+new URL(request.url()).pathname);};
  p.on('request',collect);await card.getByRole('button',{name:'Нравится',exact:true}).click();
  await expect(card.getByRole('button',{name:'Убрать отметку нравится',exact:true})).toHaveAttribute('aria-pressed','true');await p.waitForLoadState('networkidle');p.off('request',collect);
  expect(requests).toEqual(['PUT /api/v1/posts/'+post.id+'/like','GET /api/v1/posts/'+post.id]);
  await p.route('**/api/v1/posts/'+post.id+'/bookmark',route=>route.abort());await card.getByRole('button',{name:'Сохранить в закладки',exact:true}).click();
  await expect(card.getByRole('alert')).toBeVisible();await expect(card.getByRole('button',{name:'Сохранить в закладки',exact:true})).toHaveAttribute('aria-pressed','false');
  await p.unroute('**/api/v1/posts/'+post.id+'/bookmark');await card.getByRole('button',{name:'Сохранить в закладки',exact:true}).click();await expect(card.getByRole('button',{name:'Убрать закладку',exact:true})).toHaveAttribute('aria-pressed','true');
  await p.goto('/me/bookmarks');await p.getByRole('button',{name:'Убрать закладку',exact:true}).click();await expect(p.locator('.post-list>.post')).toHaveCount(0);
  await p.goto('/?mode=following');await expect(p.locator('.empty').getByRole('link',{name:'Найти авторов',exact:true})).toHaveAttribute('href','/discover');
  await p.goto('/discover?server=no-match-'+owner.handle);await expect(p.getByRole('heading',{name:'Пока нет совпадений',exact:true})).toBeVisible();
  await expect(p.getByRole('list',{name:'Выбранные фильтры',exact:true})).toContainText('Сервер: no-match-');
  if(isMobile){await expect(p.getByLabel('Сервер',{exact:true})).not.toBeVisible();await p.getByRole('button',{name:'Фильтры',exact:true}).click();}
  await expect(p.getByLabel('Сервер',{exact:true})).toBeVisible();await p.getByRole('link',{name:'Сбросить фильтры',exact:true}).click();await expect(p).toHaveURL('/discover');await expect(p.getByLabel('Сервер',{exact:true})).toHaveValue('');
  await p.goto('/discover/lfg?server=no-match-'+owner.handle);await expect(p.getByRole('heading',{name:'Команды не найдены',exact:true})).toBeVisible();await expect(p.getByRole('link',{name:'Показать все команды',exact:true})).toHaveAttribute('href','/discover/lfg');
  await noOverflow(p);await p.screenshot({path:testInfo.outputPath('compact-filters.png'),fullPage:true});
  await p.goto('/clubs?search=no-match-'+owner.handle);await expect(p.getByRole('heading',{name:'Клубы не найдены',exact:true})).toBeVisible();await expect(p.getByRole('link',{name:'Показать все клубы',exact:true})).toHaveAttribute('href','/clubs');
  await p.goto('/users/'+owner.id);await p.route('**/api/v1/posts/'+post.id,route=>route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'not_found',message:'Публикация недоступна'}})}));
  await p.locator('.post').getByRole('button',{name:'Убрать отметку нравится',exact:true}).click();await expect(p.locator('.post-list>.post')).toHaveCount(0);
  expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await owner.context.dispose();}
});
