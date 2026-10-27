// Manual, read-only, ISOLATED local UI baseline. Do not wire into production or cron.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {localBaselineOrigin} from './premium-baseline-guard.mjs';
import {waitForRenderedPublicHome} from './public-home-ready.mjs';
import {summarizeLayoutShifts} from './premium-cls-diagnostics.mjs';

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
const report={source:'local-isolated',origin,createdAt:new Date().toISOString(),viewports,screens:[],failures:[],metricsNote:'Diagnostic raw CLS and session-window CLS on isolated localhost only; no field Core Web Vitals or INP measured. Associated shift regions are NOT proven causes.'};
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
            // No DOM text, user IDs, URL, author name, selector or form values enter this report.
            const regions=[
              ['.route-loading','route-loading'],['.mobile-header','header'],
              ['.discoveries','discoveries'],['.feed-head','feed'],['.post-list','post-list'],
              ['.filter-panel','filters'],['.search-preferences','preferences'],
              ['.club-card, .club-cover','clubs'],['.profile-cover, .profile-identity','profile'],
              ['.empty','empty'],['.bottom-nav, .sidebar, .right-rail','navigation'],
              ['.page-heading','page-heading'],['#main-content','main'],
              ['.site-footer','footer'],['.main-column','column'],
              ['.app-shell','shell'],['#root','root'],['body, html','document']
            ];
            const region=node=>{
              if(!node||typeof node.closest!=='function')return 'other';
              return regions.find(([selector])=>node.closest(selector))?.[1]??'other';
            };
            const rect=value=>value?{x:value.x,y:value.y,width:value.width,height:value.height}:null;
            window.__wrcShiftEntries=[];
            window.__wrcShiftOverflow=0;
            window.__wrcRouteTransitions=[];
            let lastLoading;
            const observeRoute=()=>{
              const visible=Boolean(document.querySelector('.route-loading'));
              if(visible===lastLoading)return;
              lastLoading=visible;
              if(window.__wrcRouteTransitions.length<20)window.__wrcRouteTransitions.push({atMs:Math.round(performance.now()),loadingVisible:visible});
            };
            try {new MutationObserver(observeRoute).observe(document,{childList:true,subtree:true});}catch{}
            try {new PerformanceObserver(list=>{
              for(const entry of list.getEntries()){
                if(entry.hadRecentInput)continue;
                window.__wrcPerformance.cls+=entry.value;
                if(window.__wrcShiftEntries.length>=120){window.__wrcShiftOverflow++;continue;}
                window.__wrcShiftEntries.push({
                  startTime:entry.startTime,value:entry.value,
                  sources:(entry.sources??[]).slice(0,4).map(source=>({
                    region:region(source.node),
                    previousRect:rect(source.previousRect),
                    currentRect:rect(source.currentRect)
                  }))
                });
              }
            }).observe({type:'layout-shift',buffered:true});}catch{}
          });
          const response=await page.goto(origin+screen.path,{waitUntil:'domcontentloaded',timeout:25000});
          if(!response?.ok())throw new Error('HTTP '+response?.status());
          if(screen.name==='feed')await waitForRenderedPublicHome(page);
          else await page.getByRole('heading',{name:screen.heading,exact:true}).first().waitFor({state:'visible',timeout:30000});
          await page.evaluate(()=>document.fonts.ready);
          // Let the initial route and any lazy media settle before collecting the diagnostic snapshot.
          await page.waitForTimeout(350);
          const facts=await page.evaluate(()=>{
            const root=document.documentElement;
            const brokenImages=[...document.images].filter(img=>img.complete&&!img.naturalWidth).map(img=>img.currentSrc||img.src);
            return {scrollWidth:root.scrollWidth,viewportWidth:innerWidth,brokenImages,
              performance:window.__wrcPerformance??null,
              interactiveCount:document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])').length,
              layoutShiftEntries:window.__wrcShiftEntries??[],
              layoutShiftOverflow:window.__wrcShiftOverflow??0,
              routeTransitions:window.__wrcRouteTransitions??[]};
          });
          if(facts.scrollWidth>facts.viewportWidth)throw new Error('Horizontal overflow '+facts.scrollWidth+' > '+facts.viewportWidth);
          if(pageErrors.length)throw new Error('Uncaught JS errors: '+pageErrors.join(' | '));
          const file=screen.name+'-'+viewport.width+'.png';
          await page.screenshot({path:resolve(output,file),fullPage:true});
          const {layoutShiftEntries,layoutShiftOverflow,routeTransitions,...screenFacts}=facts;
          const shiftAnalysis=summarizeLayoutShifts(layoutShiftEntries);
          shiftAnalysis.droppedEntries+=layoutShiftOverflow;
          report.screens.push({name:screen.name,viewport:viewport.width,status:'ok',screenshot:file,
            ...screenFacts,shiftAnalysis:{...shiftAnalysis,routeTransitions}});
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
