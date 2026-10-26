// Public read-only acceptance check. Never bypass TLS or submit account forms.
import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {waitForRenderedPublicHome} from './ci/public-home-ready.mjs';
const origin=new URL(process.env.WRC_PUBLIC_ORIGIN??'https://139.100.205.135');
assert.equal(origin.protocol,'https:');
assert.equal(origin.username,'');assert.equal(origin.password,'');
assert.equal(origin.pathname,'/');assert.equal(origin.search,'');assert.equal(origin.hash,'');
const output=resolve(process.env.WRC_LIVE_EVIDENCE??'live-site-evidence');
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const report={origin:origin.origin,checkedAt:new Date().toISOString(),checks:[]};
try {
  for(const width of [390,1440]){
    const context=await browser.newContext({viewport:{width,height:width===390?844:1000},ignoreHTTPSErrors:false});
    const page=await context.newPage();
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    try {
      const response=await page.goto(origin.href,{waitUntil:'domcontentloaded',timeout:45000});
      assert.equal(response.status(),200);
      await page.locator('#main-content').waitFor({state:'visible'});
      await waitForRenderedPublicHome(page);
      assert.deepEqual(pageErrors,[],'Homepage has JavaScript errors');
      assert.match(await page.title(),/WrCommunity/);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      assert.equal(overflow,false,`Horizontal overflow at ${width}px`);
      await page.screenshot({path:resolve(output,`home-${width}.png`),fullPage:true});
      await page.goto(new URL('/login',origin).href,{waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:'С возвращением',exact:true}).waitFor({state:'visible'});
      await page.getByLabel('Электронная почта',{exact:true}).waitFor({state:'visible'});
      await page.getByLabel('Пароль',{exact:true}).waitFor({state:'visible'});
      assert.deepEqual(pageErrors,[],'Login page has JavaScript errors');
      await page.screenshot({path:resolve(output,`login-${width}.png`),fullPage:true});
      report.checks.push({width,homepage:200,feedRendered:true,loginForm:true,overflow:false});
    } finally {await context.close();}
  }
  console.log('Public HTTPS, homepage and login form passed at 390 and 1440 px; no accounts created.');
} catch(error){
  report.error=error instanceof Error?error.message:String(error);
  throw error;
} finally {
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
