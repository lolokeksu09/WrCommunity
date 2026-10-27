// Isolated same-host benchmark. Run only on an ephemeral CI runner with no production API.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {basename,extname,join,resolve,sep} from 'node:path';
import {build} from 'vite';
import {chromium,devices,expect} from '@playwright/test';

const sourcePath=resolve('web/src/main.tsx');
const source=await readFile(sourcePath,'utf8');
const startLabel='// Fetch the home route chunk during bootstrap, overlapping root/session and feed loaders.';
const endLabel="const PeopleList=lazyNamed(()=>import('./social'),'PeopleList');";
const begin=source.indexOf(startLabel),end=source.indexOf(endLabel,begin);
assert(begin>=0 && end>begin,'Expected home preload snippet absent; refusing meaningless A/B');
assert.equal(source.indexOf(startLabel,begin+1),-1,'Ambiguous preload snippet');
const snippet=source.slice(begin,end);
assert(snippet.includes("void import('./social').catch("),'Missing expected speculative import');
assert(snippet.includes("window.location.pathname==='/'"),'Preload no longer limited to home route');
const withoutPreload=source.slice(0,begin)+source.slice(end);
assert(!withoutPreload.includes(startLabel) && withoutPreload.includes(endLabel));
const output=resolve('test-results/premium-preload-paired');
await mkdir(output,{recursive:true});

const variants=['baseline','preload'];
const builds={};
for(const variant of variants){
 const outDir=join(output,'build-'+variant);
 let transformed=0;
 await build({
  configFile:resolve('web/vite.config.ts'),
  logLevel:'warn',
  plugins:[{
   name:'premium-audit-remove-preload-only',
   enforce:'pre',
   transform(code,id){
    if(variant!=='baseline'||id.split('?')[0]!==sourcePath)return null;
    assert(code.includes(startLabel),'Source changed before baseline transform');
    transformed++;
    return {code:withoutPreload,map:null};
   }
  }],
  build:{outDir,emptyOutDir:true,manifest:true}
 });
 if(variant==='baseline')assert.equal(transformed,1,'Baseline transform was not applied exactly once');
 const manifest=JSON.parse(await readFile(join(outDir,'.vite/manifest.json'),'utf8'));
 const entry=Object.values(manifest).find(c=>c.isEntry);
 assert(entry?.file,'Vite entry missing');
 const bytes=await readFile(join(outDir,entry.file));
 builds[variant]={dir:outDir,entrySha256:createHash('sha256').update(bytes).digest('hex'),entryBytes:bytes.length};
}
assert.notEqual(builds.baseline.entrySha256,builds.preload.entrySha256,'Both variants accidentally compiled identical entries');

function makeFixture(){
 const fixed='Контрольная запись о поиске напарников и обмене игровыми впечатлениями. ';
 return {items:Array.from({length:20},(_,i)=>{
  const n=i+1;
  return {
   id:'benchmark-post-'+String(n).padStart(3,'0'),author_id:'benchmark-author-01',
   club_id:null,state:'published',audience:'public',
   body:('Независимая тестовая публикация '+n+'. '+fixed.repeat(4)).trim(),
   images:[],tags:['тест'],created_at:'2026-10-20T12:00:00.000Z',
   updated_at:'2026-10-20T12:00:00.000Z',revision_id:'benchmark-revision-'+n,
   author:{id:'benchmark-author-01',handle:'fixture_author',display_name:'Тестовый автор',editorial:false},
   like_count:0,comment_count:0,liked:false,bookmarked:false
  };
 }),nextCursor:null};
}
const fixture=makeFixture();
const fixtureJson=JSON.stringify(fixture);
const fixtureSha256=createHash('sha256').update(fixtureJson).digest('hex');
const sessionJson=JSON.stringify({user:null,csrfToken:'benchmark-only-no-server'});
assert.equal(fixture.items.length,20);
const mime={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml',
 '.html':'text/html; charset=utf-8','.png':'image/png','.webp':'image/webp',
 '.json':'application/json','.ico':'image/x-icon','.woff2':'font/woff2'};
async function staticServer(root){
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url||'/', 'http://127.0.0.1').pathname;
   const target=resolve(root,'.'+(path==='/'?'/index.html':path));
   if(target!==root && !target.startsWith(root+sep)){res.writeHead(403).end();return;}
   let data;
   try{data=await readFile(target);}
   catch(error){
    if(path.includes('.')){res.writeHead(404).end();return;}
    data=await readFile(join(root,'index.html'));
   }
   res.writeHead(200,{'Content-Type':mime[extname(target)]||'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end(data);
  }catch(error){res.writeHead(500).end();}
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
const servers={};
for(const variant of variants)servers[variant]=await staticServer(builds[variant].dir);
const browser=await chromium.launch({headless:true});
const order=['baseline','preload','preload','baseline','preload','baseline','baseline','preload'];
const trials=[];
try{
 for(let i=0;i<order.length;i++){
  const variant=order[i];
  const context=await browser.newContext({...devices['Pixel 7'],viewport:{width:390,height:844},serviceWorkers:'block'});
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  let apiSession=0,apiFeed=0,unexpectedApi=0;
  try{
   await page.route('**/api/v1/**',async(route)=>{
    const path=new URL(route.request().url()).pathname;
    // Same deterministic delay for API mocks in both Vite builds.
    await new Promise(resolve=>setTimeout(resolve,150));
    if(path==='/api/v1/auth/session'){
     apiSession++;
     await route.fulfill({status:200,contentType:'application/json',body:sessionJson});
    }else if(path==='/api/v1/feed'){
     apiFeed++;
     await route.fulfill({status:200,contentType:'application/json',body:fixtureJson});
    }else{unexpectedApi++;await route.abort();}
   });
   await cdp.send('Network.enable');
   await cdp.send('Network.emulateNetworkConditions',{
    offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000
   });
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.addInitScript(()=>{
    const state={lcp:[],mountMs:null,shifts:[],longTasks:[]};
    window.__premiumPaired=state;
    const capture=()=>{
     if(state.mountMs===null && document.querySelector('.post-list > .post .copy'))
      state.mountMs=Math.round(performance.now());
    };
    new MutationObserver(capture).observe(document,{childList:true,subtree:true});
    try{new PerformanceObserver(list=>{
     for(const entry of list.getEntries()){
      const el=entry.element;
      const region=el instanceof Element && el.closest('.post-list')?'post-list':
       el instanceof Element && el.closest('.discoveries')?'discovery':'other';
      state.lcp.push({atMs:Math.round(entry.startTime),region,
       tag:el instanceof Element?el.tagName.toLowerCase():'none'});
     }
    }).observe({type:'largest-contentful-paint',buffered:true});}catch{}
    try{new PerformanceObserver(list=>{
     for(const entry of list.getEntries()){
      if(!entry.hadRecentInput)state.shifts.push({atMs:entry.startTime,value:entry.value});
     }
    }).observe({type:'layout-shift',buffered:true});}catch{}
    try{new PerformanceObserver(list=>{
     for(const entry of list.getEntries())state.longTasks.push(Math.round(entry.duration));
    }).observe({type:'longtask',buffered:true});}catch{}
   });
   const response=await page.goto(servers[variant].url+'/',{waitUntil:'domcontentloaded',timeout:60000});
   assert(response?.ok(),'Static build navigation failed');
   await expect(page.getByRole('heading',{name:'Лента',exact:true})).toBeVisible({timeout:60000});
   await expect(page.locator('.post-list > .post')).toHaveCount(20,{timeout:60000});
   await page.waitForTimeout(900);
   const first=await page.locator('.post-list > .post .copy').first().textContent();
   assert(first?.includes('Независимая тестовая публикация 1.'),'Rendered fixture differs');
   const m=await page.evaluate(()=>{
    const n=performance.getEntriesByType('navigation')[0];
    const paints=performance.getEntriesByType('paint');
    const fcp=paints.find(x=>x.name==='first-contentful-paint');
    const js=performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname.endsWith('.js'));
    const s=window.__premiumPaired;
    let windowCls=0,maximum=0,first=-1,prev=-1;
    for(const x of s.shifts){
     if(prev<0||x.atMs-prev>1000||x.atMs-first>5000){windowCls=0;first=x.atMs;}
     windowCls+=x.value;maximum=Math.max(maximum,windowCls);prev=x.atMs;
    }
    return {
     domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),
     responseEndMs:Math.round(n.responseEnd),
     fcpMs:fcp?Math.round(fcp.startTime):null,
     lcp:s.lcp.at(-1)||null,
     firstPostDomMs:s.mountMs,
     postCount:document.querySelectorAll('.post-list > .post').length,
     horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
     js:{count:js.length,totalTransferBytes:js.reduce((sum,r)=>sum+r.transferSize,0),
      lastEndMs:js.length?Math.round(Math.max(...js.map(r=>r.responseEnd))):null},
     longTasks:{count:s.longTasks.length,totalMs:s.longTasks.reduce((a,b)=>a+b,0)},
     maxSessionCls:Math.round(maximum*100000)/100000
    };
   });
   assert.equal(m.postCount,20);
   assert.equal(m.horizontalOverflow,false);
   assert(m.lcp?.atMs>0,'No LCP candidate was collected');
   assert(m.firstPostDomMs!==null,'First post DOM was not observed');
   assert.equal(unexpectedApi,0,'Unexpected API request during controlled experiment');
   assert.equal(apiSession,1,'Unexpected session request count');
   assert.equal(apiFeed,1,'Unexpected feed request count');
   assert.deepEqual(errors,[],'Browser JS errors');
   trials.push({trial:i+1,variant,...m});
  }finally{
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});
   await cdp.detach().catch(()=>{});
   await context.close();
  }
 }
}finally{
 await browser.close();
 for(const obj of Object.values(servers))await new Promise(ok=>obj.server.close(ok));
}
function median(values){
 const s=[...values].sort((a,b)=>a-b);
 return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;
}
const summary={};
for(const variant of variants){
 const rows=trials.filter(t=>t.variant===variant);
 const pick=key=>median(rows.map(r=>r[key]));
 summary[variant]={runs:rows.length,lcpMedianMs:median(rows.map(r=>r.lcp.atMs)),
  lcpMinMs:Math.min(...rows.map(r=>r.lcp.atMs)),lcpMaxMs:Math.max(...rows.map(r=>r.lcp.atMs)),
  firstPostDomMedianMs:pick('firstPostDomMs'),
  domContentLoadedMedianMs:pick('domContentLoadedMs'),
  fcpMedianMs:median(rows.map(r=>r.fcpMs).filter(x=>x!==null))};
}
const diff=summary.preload.lcpMedianMs-summary.baseline.lcpMedianMs;
const result={
 source:'Same CI runner, paired production Vite builds of one commit, no production backend',
 fixture:{sha256:fixtureSha256,posts:20,firstBodyChars:fixture.items[0].body.length},
 emulation:{viewport:{width:390,height:844},networkLatencyMs:150,
  downstreamBytesPerSecond:200000,upstreamBytesPerSecond:90000,cpuSlowdown:4},
 builds:{baseline:{entrySha256:builds.baseline.entrySha256,entryBytes:builds.baseline.entryBytes},
  preload:{entrySha256:builds.preload.entrySha256,entryBytes:builds.preload.entryBytes}},
 order,summary,preloadMinusBaselineMedianMs:diff,trials,
 limitation:'4 cold contexts per variant on one shared CI host. Browser mocks replace session/feed only. Not production/API speed, field p75, INP, Lighthouse, native 200% zoom, real Android or screen-reader testing.'
};
await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log('PREMIUM_IDENTICAL_AB '+JSON.stringify({fixture:result.fixture,summary,diffMs:diff,
 trials:trials.map(x=>({variant:x.variant,lcp:x.lcp,postDomMs:x.firstPostDomMs,
  js:x.js,domContentLoadedMs:x.domContentLoadedMs}))}));
