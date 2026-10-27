import {writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

type Candidate={atMs:number;tag:string;region:string;size:number};
type Observed={lcp:Candidate[];firstPostDomMs:number|null;headingDomMs:number|null;longTasks:{atMs:number;durationMs:number}[]};
const cssPixelViewport={width:390,height:844};

test('Premium lab: compare mobile LCP timing phases with actual and empty synthetic feed',async({browser,isMobile},testInfo)=>{
 test.skip(!isMobile,'Diagnostic is confined to the enabled mobile Chromium project');
 test.setTimeout(210000);
 const runs=[];
 // Alternating contexts limit drift; controls deliberately replace ONLY feed data in browser memory.
 const variants=['actual','empty-control','actual','empty-control'] as const;
 for(let i=0;i<variants.length;i++){
  const variant=variants[i];
  const context=await browser.newContext({viewport:cssPixelViewport,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();
  const client=await context.newCDPSession(page);
  try{
   if(variant==='empty-control'){
    await page.route('**/api/v1/feed*',async route=>{
     const upstream=await route.fetch();
     if(!upstream.ok()){await route.fulfill({response:upstream});return;}
     await route.fulfill({response:upstream,json:{items:[]}});
    });
   }
   await client.send('Network.enable');
   await client.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000});
   await client.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.addInitScript(()=>{
    const state:Observed={lcp:[],firstPostDomMs:null,headingDomMs:null,longTasks:[]};
    (window as typeof window & {__premiumPhases?:Observed}).__premiumPhases=state;
    const scan=()=>{
     const at=performance.now();
     if(state.headingDomMs===null && document.querySelector('.feed-head'))state.headingDomMs=Math.round(at);
     if(state.firstPostDomMs===null && document.querySelector('.post-list > .post .copy'))state.firstPostDomMs=Math.round(at);
    };
    new MutationObserver(scan).observe(document,{childList:true,subtree:true});
    document.addEventListener('DOMContentLoaded',scan,{once:true});
    try{new PerformanceObserver(list=>{
     for(const item of list.getEntries()){
      const e=item as PerformanceEntry & {element?:Element|null;size?:number};
      const node=e.element;
      const tag=node?.tagName.toLowerCase()??'none';
      const kind=node instanceof Element
       ?node.closest('.post-list')?'post-list':node.closest('.discoveries')?'discovery':node.closest('.feed-head')?'feed-heading':node.closest('.empty')?'empty':node.closest('.route-loading')?'loader':'other'
       :'unknown';
      state.lcp.push({atMs:Math.round(e.startTime),tag:['p','img','h1','h2','h3','div','span','section','article','a'].includes(tag)?tag:'other',
       region:kind,size:Math.round(e.size??0)});
     }
    }).observe({type:'largest-contentful-paint',buffered:true});}catch{}
    try{new PerformanceObserver(list=>{
     for(const entry of list.getEntries()){
      state.longTasks.push({atMs:Math.round(entry.startTime),durationMs:Math.round(entry.duration)});
     }
    }).observe({type:'longtask',buffered:true});}catch{}
   });
   const response=await page.goto('/',{waitUntil:'domcontentloaded',timeout:50000});
   expect(response?.ok()).toBe(true);
   await expect(page.getByRole('heading',{name:'Лента',exact:true})).toBeVisible({timeout:50000});
   await expect(page.locator('.route-loading')).toHaveCount(0);
   await page.waitForTimeout(1500);
   const reading=await page.evaluate(()=>{
    const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
    const state=(window as typeof window & {__premiumPhases?:Observed}).__premiumPhases;
    const paints=performance.getEntriesByType('paint') as PerformanceEntry[];
    const byType=(name:string)=>Math.round(paints.find(e=>e.name===name)?.startTime??0);
    const resources=performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const groups:Record<string,{count:number;firstStartMs:number;lastEndMs:number;maxDurationMs:number;transferBytes:number}>={};
    for(const resource of resources){
     // Parse URLs in memory only; never export URL/path/selector/query/identity.
     let path='';try{path=new URL(resource.name).pathname;}catch{}
     const kind=path.startsWith('/api/v1/auth/session')?'session-api':
      path.startsWith('/api/v1/feed')?'feed-api':
      path.startsWith('/api/v1/')?'other-api':
      path.endsWith('.js')?'javascript':
      path.endsWith('.css')?'stylesheet':
      /\.(?:png|webp|svg|jpe?g)$/.test(path)?'image':'other';
     const row=groups[kind]??{count:0,firstStartMs:Number.POSITIVE_INFINITY,lastEndMs:0,maxDurationMs:0,transferBytes:0};
     row.count++;
     row.firstStartMs=Math.min(row.firstStartMs,resource.startTime);
     row.lastEndMs=Math.max(row.lastEndMs,resource.responseEnd);
     row.maxDurationMs=Math.max(row.maxDurationMs,resource.duration);
     row.transferBytes+=resource.transferSize;
     groups[kind]=row;
    }
    const resourceGroups=Object.fromEntries(Object.entries(groups).map(([key,g])=>[key,{
     count:g.count,firstStartMs:Math.round(g.firstStartMs),lastEndMs:Math.round(g.lastEndMs),
     maxDurationMs:Math.round(g.maxDurationMs),transferBytes:g.transferBytes}]));
    const textLengths=[...document.querySelectorAll('.post-list > .post .copy')].map(el=>el.textContent?.length??0);
    const tasks=state?.longTasks??[];
    return {
     nav:{responseStartMs:Math.round(nav?.responseStart??0),responseEndMs:Math.round(nav?.responseEnd??0),
      domContentLoadedMs:Math.round(nav?.domContentLoadedEventEnd??0),loadEndMs:Math.round(nav?.loadEventEnd??0)},
     paints:{firstPaintMs:byType('first-paint'),firstContentfulPaintMs:byType('first-contentful-paint')},
     headings:{feedHeadingDomMs:state?.headingDomMs??null,firstPostDomMs:state?.firstPostDomMs??null},
     postCounts:{cards:document.querySelectorAll('.post-list > .post').length,firstCopyChars:textLengths[0]??0,
      maxCopyChars:textLengths.length?Math.max(...textLengths):0},
     resourceGroups,lastLcp:state?.lcp.at(-1)??null,
     lcpCandidateCount:state?.lcp.length??0,
     longTasks:{count:tasks.length,totalMs:tasks.reduce((s,t)=>s+t.durationMs,0),maxMs:tasks.length?Math.max(...tasks.map(t=>t.durationMs)):0},
     horizontalOverflow:document.documentElement.scrollWidth>innerWidth
    };
   });
   expect(reading.horizontalOverflow).toBe(false);
   expect(reading.nav.domContentLoadedMs).toBeGreaterThan(0);
   if(variant==='empty-control')expect(reading.postCounts.cards).toBe(0);
   runs.push({trial:i+1,variant,...reading});
  }finally{
   await client.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});
   await client.detach().catch(()=>{});
   await context.close();
  }
 }
 const med= (xs:number[])=>{const a=[...xs].sort((x,y)=>x-y);return a.length?(a.length%2?a[(a.length-1)/2]:Math.round((a[a.length/2-1]+a[a.length/2])/2)):null;};
 const summary=Object.fromEntries(variants.filter((v,i)=>variants.indexOf(v)===i).map(variant=>{
  const rows=runs.filter(r=>r.variant===variant);
  return [variant,{samples:rows.length,medianLcpMs:med(rows.map(r=>r.lastLcp?.atMs).filter((v):v is number=>typeof v==='number')),
   medianDomContentLoadedMs:med(rows.map(r=>r.nav.domContentLoadedMs)),medianPostCount:med(rows.map(r=>r.postCounts.cards)),
   lcpRegions:rows.map(r=>r.lastLcp?.region??'unavailable')}];
 }));
 const report={source:'CI localhost + disposable Postgres; actual feed may contain concurrent test fixtures',
  environment:{viewportCssPx:cssPixelViewport,networkLatencyMs:150,downloadBytesPerSecond:200000,
   uploadBytesPerSecond:90000,cpuThrottle:4},
  caveat:'Controls replace the HTTP feed JSON with an empty collection via browser interception; not production content, not randomized A/B or field CWV.',
  summary,runs};
 await writeFile(testInfo.outputPath('premium-lcp-phases-390.json'),JSON.stringify(report,null,2)+'\n');
 console.log('PREMIUM_LCP_PHASES '+JSON.stringify({summary,
  trials:runs.map(r=>({variant:r.variant,trial:r.trial,lcp:r.lastLcp,
   nav:r.nav,paints:r.paints,headings:r.headings,postCounts:r.postCounts,
   js:r.resourceGroups.javascript,feedApi:r.resourceGroups['feed-api'],longTasks:r.longTasks}))}));
 expect(runs).toHaveLength(4);
});
