import {writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

type Candidate={timeMs:number;size:number;tag:string;region:string;kind:string};
type Observation={lcp:Candidate[];shifts:{timeMs:number;value:number}[]};
const regionLabels=[
 ['.feed-head','feed-heading'],['.discoveries','discovery'],['.post-list','post-list'],
 ['.route-loading','loader'],['.mobile-header','mobile-header'],
 ['.right-rail','right-rail'],['.sidebar','sidebar'],['.page-content','content'],
 ['.app-shell','shell'],
] as const;

test('Premium lab: repeat three throttled mobile LCP navigations with element attribution',async({browser,isMobile},testInfo)=>{
 test.skip(!isMobile,'Only the enabled mobile Chromium project');
 test.setTimeout(180000);
 const trials=[];
 for(let index=0;index<3;index++){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();
  const client=await context.newCDPSession(page);
  try{
   await client.send('Network.enable');
   await client.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000});
   await client.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.addInitScript(()=>{
    const record:Observation={lcp:[],shifts:[]};
    (window as typeof window & {__premiumAttribution?:Observation}).__premiumAttribution=record;
    const regions=[
     ['.feed-head','feed-heading'],['.discoveries','discovery'],['.post-list','post-list'],
     ['.route-loading','loader'],['.mobile-header','mobile-header'],
     ['.right-rail','right-rail'],['.sidebar','sidebar'],['.page-content','content'],
     ['.app-shell','shell'],
    ];
    try{new PerformanceObserver(list=>{
     for(const item of list.getEntries()){
      const entry=item as PerformanceEntry & {element?:Element|null;size?:number};
      const element=entry.element;
      let region='other';
      if(element instanceof Element){
       for(const [selector,label] of regions){if(element.closest(selector)){region=label;break;}}
      }
      const tag=element instanceof Element?element.tagName.toLowerCase():'none';
      const kind=element instanceof HTMLImageElement?'image':element instanceof Element?'text-or-block':'unknown';
      record.lcp.push({timeMs:Math.round(entry.startTime),size:Math.round(entry.size??0),
       tag:['img','p','h1','h2','h3','div','span','section','article','a'].includes(tag)?tag:'other',
       region,kind});
     }
    }).observe({type:'largest-contentful-paint',buffered:true});}catch{}
    try{new PerformanceObserver(list=>{
     for(const item of list.getEntries()){
      const entry=item as PerformanceEntry & {value?:number;hadRecentInput?:boolean};
      if(!entry.hadRecentInput && typeof entry.value==='number')
       record.shifts.push({timeMs:Math.round(entry.startTime),value:entry.value});
     }
    }).observe({type:'layout-shift',buffered:true});}catch{}
   });
   const response=await page.goto('/',{waitUntil:'domcontentloaded',timeout:50000});
   expect(response?.ok()).toBe(true);
   await expect(page.getByRole('heading',{name:'Лента',exact:true})).toBeVisible({timeout:50000});
   await expect(page.locator('.route-loading')).toHaveCount(0);
   await page.waitForTimeout(1500);
   const metrics=await page.evaluate(()=>{
    const record=(window as typeof window & {__premiumAttribution?:Observation}).__premiumAttribution;
    const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
    return {navigation:{responseStartMs:Math.round(nav?.responseStart??0),
     responseEndMs:Math.round(nav?.responseEnd??0),
     domContentLoadedMs:Math.round(nav?.domContentLoadedEventEnd??0),
     loadEndMs:Math.round(nav?.loadEventEnd??0)},
     candidates:record?.lcp??[],shifts:record?.shifts??[],
     horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
   });
   expect(metrics.horizontalOverflow).toBe(false);
   expect(metrics.navigation.domContentLoadedMs).toBeGreaterThan(0);
   const latest=metrics.candidates.at(-1)??null;
   const trialsShifts=metrics.shifts;
   let session=0,highest=0,first=-1,previous=-1;
   for(const item of trialsShifts){
    if(previous<0||item.timeMs-previous>1000||item.timeMs-first>5000){session=0;first=item.timeMs;}
    session+=item.value;highest=Math.max(highest,session);previous=item.timeMs;
   }
   trials.push({number:index+1,...metrics.navigation,lcp:latest,
    lcpEntries:metrics.candidates.length,maxSessionCls:Math.round(highest*100000)/100000,
    layoutShiftCount:trialsShifts.length});
  }finally{
   await client.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});
   await client.detach().catch(()=>{});
   await context.close();
  }
 }
 const values=trials.map(t=>t.lcp?.timeMs).filter((x):x is number=>typeof x==='number').sort((a,b)=>a-b);
 const summary={samples:values.length,minMs:values.at(0)??null,medianMs:values.length?values[Math.floor(values.length/2)]:null,maxMs:values.at(-1)??null};
 const report={source:'isolated disposable localhost runner; no production traffic',
  viewport:{width:390,height:844},emulation:{latencyMs:150,downloadBytesPerSecond:200000,
   uploadBytesPerSecond:90000,cpuSlowdownFactor:4},
  summary,trials,
  notes:'Three sequential cold browser contexts on one runner. Not independent devices, not field CWV, not p75, no INP. Element region is correlation, not causal attribution. No DOM text/URLs recorded.'};
 await writeFile(testInfo.outputPath('premium-lcp-attribution-390.json'),JSON.stringify(report,null,2)+'\n');
 console.log('PREMIUM_LCP_ATTRIBUTION '+JSON.stringify({summary,trials:trials.map(t=>({number:t.number,lcp:t.lcp,domContentLoadedMs:t.domContentLoadedMs}))}));
 expect(trials).toHaveLength(3);
});
