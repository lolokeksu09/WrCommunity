import {test, expect} from '@playwright/test';
import {account, api, browserPerson, noOverflow} from './helpers.js';

test('Premium accessibility: authenticated 320px reflow and keyboard privacy without publishing', async ({browser}, testInfo) => {
 test.setTimeout(150000);
 // Disposable verified account from isolated CI PostgreSQL/Mailpit only.
 const person=await account({hidden:true});
 const ui=await browserPerson(browser,person);
 try {
  await ui.page.setViewportSize({width:320,height:700});
  const screens=[
   {path:'/me',key:'profile',heading:'Мой профиль'},
   {path:'/me/edit',key:'editor',heading:'Редактировать профиль'},
   {path:'/me/game',key:'game',heading:'Игровая карточка'},
   {path:'/me/privacy',key:'privacy',heading:'Приватность'},
  ];
  for(const screen of screens){
   await ui.page.goto(screen.path);
   await expect(ui.page.getByRole('heading',{name:screen.heading,exact:true}).first()).toBeVisible();
   await expect(ui.page.locator('.route-loading')).toHaveCount(0);
   await noOverflow(ui.page);
   await ui.page.screenshot({
    path:testInfo.outputPath('premium-a11y-'+screen.key+'-320-viewport.png'),
    fullPage:false,animations:'disabled'
   });
  }
  // Controls are operated by a keyboard, not synthetic DOM click events.
  const hidden=ui.page.getByRole('radio',{name:/Скрытый/});
  const publicOption=ui.page.getByRole('radio',{name:/Публичный/});
  await expect(hidden).toBeChecked();
  await hidden.focus();
  await expect(hidden).toBeFocused();
  await ui.page.keyboard.press('ArrowRight');
  await expect(publicOption).toBeChecked();
  await ui.page.keyboard.press('ArrowLeft');
  await expect(hidden).toBeChecked();
  // Unsaved keyboard selection must not publish a hidden test profile.
  const stored=await api(person.context,'/me/profile');
  expect(stored.visibility).toBe('hidden');
  expect(ui.errors).toEqual([]);
 } finally {
  await ui.context.close();
  await person.context.dispose();
 }
});

test('Premium accessibility: reduced motion leaves discovery usable from the keyboard', async ({page,isMobile}) => {
 test.skip(!isMobile,'The enabled mobile Chromium project owns this accessibility smoke');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Лента',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
 const expand=page.getByRole('button',{name:'Развернуть',exact:true});
 await expand.focus();
 await page.keyboard.press('Enter');
 await expect(page.locator('.hero')).toBeVisible();
 const animationNames=await page.locator('.hero-portal > div, .hero-portal i, .hero-portal b').evaluateAll(elements=>
  elements.map(element=>getComputedStyle(element).animationName));
 expect(animationNames.length).toBeGreaterThan(0);
 expect(animationNames.every(name=>name==='none')).toBe(true);
 await page.locator('.hero').focus();
 await page.keyboard.press('ArrowRight');
 await expect(page.getByText('2 из 3')).toBeVisible();
 const collapse=page.getByRole('button',{name:'Свернуть',exact:true});
 await collapse.focus();
 await page.keyboard.press('Enter');
 await expect(page.locator('.hero')).toHaveCount(0);
 await noOverflow(page);
});
