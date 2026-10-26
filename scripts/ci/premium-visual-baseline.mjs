// Manual, read-only, ISOLATED local UI baseline. Do not wire into production or cron.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {localBaselineOrigin} from './premium-baseline-guard.mjs';
import {waitForRenderedPublicHome} from './public-home-ready.mjs';

const origin=localBaselineOrigin(process.env.WRC_BASELINE_URL??'http://127.0.0.1:13000/');
const output=resolve(process.env.WRC_BASELINE_OUTPUT??'test-results/premium-baseline');
const screens=[
  {name:'feed',path:'/',heading:'Лента'},
  {name:'players',path:'/discover',heading:'Найти своих'},
  {name:'lfg',path:'/discover/lfg',heading:'Ищу команду'},
  {name:'clubs',path:'/clubs',heading:'Клубы'},
  {name:'login',path:'/login',heading:'С возвращением'},
];
const viewports=[{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:1440,height:900}];
await mkdir(output,{recursive:true});
const report={source:'local-isolated',origin,createdAt:new Date().toISOString(),viewports,screens:[],failures:[],metricsNote:'Lab browser observations, NOT field Core Web Vitals. INP not measured.'};
const browser=await chromium.launch({headless:true});
try {
  for(const viewport of viewports){
    const context=await browser.newContext({viewport,reducedMotion:'reduce',colorScheme:'dark'});
    try {
      for(const screen of screens){
        const page=await context.newPage();
        const pageErrors=[];
        page.on('pageerror',error=>pageErrors.push(error.message));
        try {
          await page.addInitScript(()=>{
            window.__wrcPerformance={lcp:null,cls:0};
            try {new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__wrcPerformance.lcp=entry.startTime;}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
            try {new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__wrcPerformance.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});}catch{}
          });
          const response=await page.goto(origin+screen.path,{waitUntil:'domcontentloaded',timeout:25000});
          if(!response?.ok())throw new Error('HTTP '+response?.status());
          if(screen.name==='feed')await waitForRenderedPublicHome(page);
          else await page.getByRole('heading',{name:screen.heading,exact:true}).first().waitFor({state:'visible',timeout:30000});
          await page.evaluate(()=>document.fonts.ready);
          const facts=await page.evaluate(()=>{
            const root=document.documentElement;
            const brokenImages=[...document.images].filter(img=>img.complete&&!img.naturalWidth).map(img=>img.currentSrc||img.src);
            return {scrollWidth:root.scrollWidth,viewportWidth:innerWidth,brokenImages,performance:window.__wrcPerformance??null,interactiveCount:document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])').length};
          });
          if(facts.scrollWidth>facts.viewportWidth)throw new Error('Horizontal overflow '+facts.scrollWidth+' > '+facts.viewportWidth);
          if(pageErrors.length)throw new Error('Uncaught JS errors: '+pageErrors.join(' | '));
          const file=screen.name+'-'+viewport.width+'.png';
          await page.screenshot({path:resolve(output,file),fullPage:true});
          report.screens.push({name:screen.name,viewport:viewport.width,status:'ok',screenshot:file,...facts});
        }catch(error){
          const failure={name:screen.name,viewport:viewport.width,status:'failed',reason:String(error?.message??error)};
          report.failures.push(failure);
          report.screens.push(failure);
        }finally{await page.close();}
      }
    }finally{await context.close();}
  }
} finally {
  await browser.close();
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log('Premium local visual baseline: '+report.screens.length+' screens, '+report.failures.length+' failures. Report: '+resolve(output,'report.json'));
if(report.failures.length)process.exitCode=1;
