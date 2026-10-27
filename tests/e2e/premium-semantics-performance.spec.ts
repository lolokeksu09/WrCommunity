import {writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {account,browserPerson,noOverflow} from './helpers.js';

test('Premium evidence: profile editor fields expose keyboard focus and accessible labels',async({browser,isMobile})=>{
 test.skip(!isMobile,'Only enabled mobile Chromium E2E is authorized');
 const person=await account({hidden:true});
 const ui=await browserPerson(browser,person);
 try{
  await ui.page.setViewportSize({width:390,height:844});
  await ui.page.goto('/me/edit');
  await expect(ui.page.getByRole('heading',{name:'Редактировать профиль',exact:true})).toBeVisible();
  const name=ui.page.getByRole('textbox',{name:'Имя',exact:true});
  const bio=ui.page.getByRole('textbox',{name:'О себе',exact:true});
  const avatar=ui.page.getByLabel('Аватар',{exact:true});
  const cover=ui.page.getByLabel('Обложка',{exact:true});
  await expect(name).toBeVisible();
  await expect(bio).toBeVisible();
  await expect(avatar).toHaveAttribute('type','file');
  await expect(cover).toHaveAttribute('type','file');
  await name.focus();
  await expect(name).toBeFocused();
  await ui.page.keyboard.press('Tab');
  await expect(bio).toBeFocused();
  await avatar.focus();
  await expect(avatar).toBeFocused();
  await expect(ui.page.getByRole('button',{name:'Сохранить изменения'})).toBeVisible();
  await noOverflow(ui.page);
  await ui.page.goto('/me/privacy');
  await expect(ui.page.getByRole('heading',{name:'Приватность',exact:true})).toBeVisible();
  await expect(ui.page.getByRole('group',{name:'Кто видит твой профиль'})).toBeVisible();
  await expect(ui.page.getByRole('radio',{name:/Скрытый/})).toBeChecked();
  await expect(ui.page.getByRole('checkbox',{name:/Показывать присутствие на сайте/})).toBeVisible();
  await noOverflow(ui.page);
  expect(ui.errors).toEqual([]);
 }finally{
  await ui.context.close();
  await person.context.dispose();
 }
});

type Shift={startTime:number;value:number};
type LabMetrics={lcpMs:number[];shiftEvents:Shift[]};

test('Premium lab: throttled isolated mobile guest feed records navigation LCP and CLS',async({page,isMobile},testInfo)=>{
 test.skip(!isMobile,'Diagnostic uses enabled mobile Chromium only');
 test.setTimeout(120000);
 await page.setViewportSize({width:390,height:844});
 const client=await page.context().newCDPSession(page);
 try{
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions',{
   offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000
  });
  await client.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.addInitScript(()=>{
   const lab:LabMetrics={lcpMs:[],shiftEvents:[]};
   (window as typeof window & {__premiumLab?:LabMetrics}).__premiumLab=lab;
   try{
    new PerformanceObserver(list=>{
     for(const entry of list.getEntries()){
      if(Number.isFinite(entry.startTime))lab.lcpMs.push(Math.round(entry.startTime*100)/100);
     }
    }).observe({type:'largest-contentful-paint',buffered:true});
   }catch{/* Browser may not expose this entry type. */}
   try{
    new PerformanceObserver(list=>{
     for(const item of list.getEntries()){
      const entry=item as PerformanceEntry & {value?:number;hadRecentInput?:boolean};
      if(entry.hadRecentInput||typeof entry.value!=='number'||!Number.isFinite(entry.value))continue;
      lab.shiftEvents.push({startTime:entry.startTime,value:entry.value!});
     }
    }).observe({type:'layout-shift',buffered:true});
   }catch{/* Browser may not expose this entry type. */}
  });
  const response=await page.goto('/',{waitUntil:'domcontentloaded',timeout:45000});
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading',{name:'Лента',exact:true})).toBeVisible({timeout:45000});
  await expect(page.locator('.route-loading')).toHaveCount(0);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(1200);
  await noOverflow(page);
  const observed=await page.evaluate(()=>{
   const lab=(window as typeof window & {__premiumLab?:LabMetrics}).__premiumLab;
   const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
   return {
    lcpMs:lab?.lcpMs??[],
    layoutShifts:lab?.shiftEvents??[],
    navResponseEndMs:nav?.responseEnd??null,
    navDomContentLoadedEndMs:nav?.domContentLoadedEventEnd??null,
    navLoadEventEndMs:nav?.loadEventEnd??null,
    finalScrollWidth:document.documentElement.scrollWidth,
    finalViewportWidth:innerWidth,
   };
  });
  const shifts=observed.layoutShifts;
  let session=0,maxSession=0,start=-1,prev=-1;
  for(const entry of shifts){
   if(prev<0||entry.startTime-prev>1000||entry.startTime-start>5000){session=0;start=entry.startTime;}
   session+=entry.value;maxSession=Math.max(maxSession,session);prev=entry.startTime;
  }
  const report={
   source:'isolated localhost only; not production or field CWV',
   viewportCssPx:{width:390,height:844},
   emulation:{networkLatencyMs:150,downloadBytesPerSecond:200000,uploadBytesPerSecond:90000,cpuSlowdownFactor:4},
   metrics:{...observed,largestObservedLcpMs:observed.lcpMs.at(-1)??null,
    diagnosticMaxSessionCls:Math.round(maxSession*100000)/100000},
   notes:'One uncalibrated lab sample; no benchmark thresholds, p75, INP or proof of real Android zoom.',
  };
  await writeFile(testInfo.outputPath('premium-throttled-guest-390.json'),JSON.stringify(report,null,2)+'\n');
  await page.screenshot({path:testInfo.outputPath('premium-throttled-guest-390.png'),fullPage:false,animations:'disabled'});
  expect(observed.navDomContentLoadedEndMs).not.toBeNull();
  expect(observed.finalScrollWidth).toBeLessThanOrEqual(observed.finalViewportWidth);
 }finally{
  await client.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});
  await client.detach().catch(()=>{});
 }
});
