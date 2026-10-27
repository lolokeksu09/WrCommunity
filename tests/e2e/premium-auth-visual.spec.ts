import {writeFile} from 'node:fs/promises';
import {test, expect} from '@playwright/test';
import sharp from 'sharp';
import {account, api, browserPerson, noOverflow} from './helpers.js';

test('Premium audit: authenticated hidden profile, editor, privacy and responsive visual evidence', async ({browser},testInfo) => {
 test.setTimeout(180000);
 // All data belongs to a disposable isolated E2E account, never production.
 const person=await account({hidden:true});
 const ui=await browserPerson(browser,person);
 const report:{width:number;route:string;overflow:boolean;heading:string;scrollY:number;skipLinkFocused:boolean;skipLinkTop:number|null;headerTop:number|null}[]=[];
 try {
  const initial=await api(person.context,'/me/profile');
  await api(person.context,'/me/profile','PATCH',{
   version:initial.version,
   game:{server:{value:'EU',public:false},roles:{value:['mid'],public:false}},
  });
  await ui.page.setViewportSize({width:390,height:844});
  await ui.page.goto('/me/edit');
  await expect(ui.page.getByRole('heading',{name:'Редактировать профиль'})).toBeVisible();
  const photo=await sharp({create:{width:112,height:112,channels:3,background:'#465c7e'}}).png().toBuffer();
  await ui.page.locator('input[type="file"][name="avatar"]').setInputFiles({name:'disposable-test-avatar.png',mimeType:'image/png',buffer:photo});
  await expect(ui.page.getByRole('img',{name:'Аватар',exact:true})).toBeVisible();
  await ui.page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
  await expect(ui.page).toHaveURL(/\/me$/);
  const stored=await api(person.context,'/me/profile');
  expect(stored.visibility).toBe('hidden');
  expect(stored.game.server.public).toBe(false);
  expect(stored.game.roles.public).toBe(false);

  const viewports=[{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:1440,height:900}];
  const screens=[
   {path:'/me',key:'profile',heading:'Мой профиль'},
   {path:'/me/edit',key:'editor',heading:'Редактировать профиль'},
   {path:'/me/game',key:'game',heading:'Игровая карточка'},
   {path:'/me/privacy',key:'privacy',heading:'Приватность'},
  ];
  for(const viewport of viewports){
   await ui.page.setViewportSize(viewport);
   for(const screen of screens){
    await ui.page.goto(screen.path);
    await expect(ui.page.getByRole('heading',{name:screen.heading,exact:true}).first()).toBeVisible();
    await expect(ui.page.locator('.route-loading')).toHaveCount(0);
    const layout=await ui.page.evaluate(()=>{
     const skip=document.querySelector('.skip-link');
     const header=document.querySelector('.mobile-header');
     return {overflow:document.documentElement.scrollWidth>window.innerWidth,head:document.querySelector('h1,h2')?.textContent??'',scrollY:window.scrollY,skipLinkFocused:document.activeElement===skip,skipLinkTop:skip?.getBoundingClientRect().top??null,headerTop:header?.getBoundingClientRect().top??null};
    });
    report.push({width:viewport.width,route:screen.key,...layout,heading:layout.head});
    if(viewport.width===390||viewport.width===1440){
     // A true first-viewport capture separates page UI from full-page sticky screenshot artifacts.
     await ui.page.screenshot({path:testInfo.outputPath('premium-auth-'+screen.key+'-'+viewport.width+'-viewport.png'),fullPage:false,animations:'disabled'});
    }
    await ui.page.screenshot({path:testInfo.outputPath('premium-auth-'+screen.key+'-'+viewport.width+'.png'),fullPage:true,animations:'disabled'});
    await noOverflow(ui.page);
    if(screen.key==='profile'){
     await expect(ui.page.getByText('Скрытый профиль',{exact:true})).toBeVisible();
     await expect(ui.page.getByRole('region',{name:'Первые шаги'})).toContainText('Готово: 2 из 2');
    }
   }
  }

  // At 320 CSS pixels test the WCAG 1.4.10 reference reflow width.
  // This is NOT a native 200% browser zoom or screen-reader certification.
  await ui.page.setViewportSize({width:320,height:700});
  await ui.page.goto('/me/edit');
  await expect(ui.page.getByRole('heading',{name:'Редактировать профиль'})).toBeVisible();
  const reflow=await ui.page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  await ui.page.screenshot({path:testInfo.outputPath('premium-auth-editor-reflow-320-viewport.png'),fullPage:false});
  await ui.page.screenshot({path:testInfo.outputPath('premium-auth-editor-reflow-320.png'),fullPage:true});
  await writeFile(testInfo.outputPath('premium-auth-report.json'),JSON.stringify({source:'isolated mobile Chromium resized viewport, synthetic verified hidden account',screens:report,reflow,jsErrors:ui.errors},null,2));
  expect(ui.errors).toEqual([]);
 } finally {
  await ui.context.close();
  await person.context.dispose();
 }
});
