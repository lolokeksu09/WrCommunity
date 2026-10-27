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

test('Rift Signal соединяет три реальных маршрута и сохраняет адаптивность',async({page,isMobile},testInfo)=>{
 test.skip(!isMobile,'Проверка сигнатуры маршрутов выполняется в мобильном Chromium');
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const signal=page.locator('.rift-signal');
 await expect(signal).toBeVisible();
 await expect(signal.locator('.rift-map-compact')).toHaveAttribute('aria-hidden','true');
 const shortcuts=signal.getByRole('navigation',{name:'Быстрые переходы'});
 await expect(shortcuts.getByRole('link',{name:/Игроки/})).toHaveAttribute('href','/discover');
 await expect(shortcuts.getByRole('link',{name:/Клубы/})).toHaveAttribute('href','/clubs');
 await expect(shortcuts.getByRole('link',{name:/Ищу команду/})).toHaveAttribute('href','/discover/lfg');
 await page.screenshot({path:testInfo.outputPath('rift-signal-390.png'),fullPage:true,animations:'disabled'});
 for(const width of [320,360,390,430,1440]){
  await page.setViewportSize({width,height:900});
  await noOverflow(page);
  if(width===1440)await page.screenshot({path:testInfo.outputPath('rift-signal-wide-1440.png'),fullPage:true,animations:'disabled'});
 }
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
  // The card heading alone is insufficient: the first readable lines must fit
  // into the *initial* 390x844 viewport without scrolling.
  const textRect=await card.locator('.copy').first().boundingBox();
  expect(textRect).not.toBeNull();
  expect(textRect!.height).toBeGreaterThan(0);
  expect(textRect!.y).toBeGreaterThanOrEqual(0);
  expect(textRect!.y+Math.min(48,textRect!.height)).toBeLessThanOrEqual(844);
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
  const unbroken='НеразрывнаяСтрока'.repeat(60);
  await api(player.context,'/posts','POST',{body:unbroken});
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
  await expect(ui.page.locator('.post').filter({hasText:unbroken.slice(0,28)})).toBeVisible();
  for(const width of [360,390,430,1440]){
   await ui.page.setViewportSize({width,height:900});
   await noOverflow(ui.page);
  }
  await card.getByRole('link',{name:'Открыть публикацию',exact:true}).click();
  await expect(ui.page).toHaveURL('/posts/'+long.id);
  await expect(ui.page.locator('.post.detail .copy')).toHaveText(longBody);
  await expect(ui.page.getByRole('button',{name:'Читать полностью',exact:true})).toHaveCount(0);
  expect(ui.errors).toEqual([]);
 }finally{await ui.context.close();await player.context.dispose();}
});


test('редакционная метка и оформление видны в изолированной ленте на 390px и 1440px',async({page,isMobile},testInfo)=>{
 test.skip(!isMobile,'Evidence captured on the enabled mobile-chromium project; manual 1440 viewport in the same browser');
 const player=await account();
 try{
  const body='Редакционный визуальный тест '+randomUUID();
  const post=await api<{id:string}>(player.context,'/posts','POST',{body});
  const fixture=await api<{id:string;author?:Record<string,unknown>}>(player.context,'/posts/'+post.id);
  // Deterministic, request-scoped editorial fixture: concurrent E2E writers may
  // push the test post outside the first public feed page. Never change the DB.
  let transformed=0;
  await page.route('**/api/v1/feed*',async route=>{
   const response=await route.fetch();
   if(!response.ok()){await route.fulfill({response});return;}
   const data=await response.json() as {items?:Array<{id:string;author?:Record<string,unknown>}>};
   if(!Array.isArray(data.items)){await route.fulfill({response});return;}
   const otherPosts=data.items.filter(item=>item.id!==post.id);
   const visibleCount=Math.max(data.items.length,1);
   data.items=[{...fixture,author:{...fixture.author,editorial:true}},...otherPosts].slice(0,visibleCount);
   transformed++;
   await route.fulfill({response,json:data});
  });
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   await page.goto('/');
   const card=page.locator('.post').filter({hasText:body});
   await expect(card).toHaveClass(/editorial-post/);
   await expect(card.getByText('Редакция',{exact:true})).toBeVisible();
   const ratio=await card.evaluate(el=>{
    const sample=el.querySelector('.copy');
    if(!sample)throw new Error('Missing post body for contrast evaluation');
    const channels=(value:string)=>{
     const match=value.match(/rgba?\(([^)]+)\)/);
     if(!match)throw new Error('Color is not numeric: '+value);
     return match[1].split(',').slice(0,3).map(Number);
    };
    const luminance=(rgb:number[])=>rgb.map(x=>{
     const c=x/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;
    }).reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
    const foreground=luminance(channels(getComputedStyle(sample).color));
    const background=luminance(channels(getComputedStyle(el).backgroundColor));
    return (Math.max(foreground,background)+0.05)/(Math.min(foreground,background)+0.05);
   });
   expect(ratio).toBeGreaterThanOrEqual(4.5);
   await noOverflow(page);
   await page.screenshot({path:testInfo.outputPath('premium2-editorial-fixture-'+width+'.png'),fullPage:true});
  }
  expect(transformed).toBeGreaterThanOrEqual(2);
  const card=page.locator('.post').filter({hasText:body});
  const menu=card.getByRole('button',{name:'Действия с публикацией'});
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(card.getByRole('group',{name:'Действия публикации'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card.getByRole('group',{name:'Действия публикации'})).toHaveCount(0);
  await expect(menu).toBeFocused();
 }finally{await player.context.dispose();}
});

test('главная доступна с клавиатуры, раскрытие карусели управляется стрелками',async({page,isMobile})=>{
 test.skip(!isMobile,'Keyboard path on mobile navigation and focusable discovery');
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 // Wait for the root hydration fallback to be replaced by the real Shell.
 await expect(page.getByRole('heading',{name:'Лента',exact:true})).toBeVisible();
 await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
 await page.keyboard.press('Tab');
 await expect(page.getByRole('link',{name:'К содержимому'})).toBeFocused();
 await page.keyboard.press('Enter');
 const main=page.locator('#main-content');
 await expect(main).toBeFocused();
 const expand=page.getByRole('button',{name:'Развернуть'});
 await expand.focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Свернуть'})).toHaveAttribute('aria-expanded','true');
 await page.locator('.hero').focus();
 await page.keyboard.press('ArrowRight');
 await expect(page.getByText('2 из 3')).toBeVisible();
 const collapse=page.getByRole('button',{name:'Свернуть'});
 await collapse.focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Развернуть'})).toHaveAttribute('aria-expanded','false');
 await page.setViewportSize({width:320,height:800});
 await noOverflow(page);
});
