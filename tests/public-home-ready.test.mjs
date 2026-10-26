import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForRenderedPublicHome} from '../scripts/ci/public-home-ready.mjs';

function fakePage({heading='Лента', blocked=null, missingContent=false, alertCount=0}={}){
  const waits=[];
  return {waits, locator(selector){
    return {
      first(){return this;},
      async waitFor({state}){
        waits.push({selector,state});
        if(selector.includes('.post-list')&&missingContent)throw new Error('No feed item or empty state');
        if(selector==='.route-loading'&&blocked==='loader')throw new Error('Loading did not end');
      },
      async innerText(){return heading;},
      async count(){return alertCount;}
    };
  }};
}

test('home smoke must await actual feed and stopped loader, not shell text', async()=>{
  const page=fakePage();
  await waitForRenderedPublicHome(page);
  assert.deepEqual(page.waits.map(x=>x.state),['visible','visible','hidden']);
  assert.ok(page.waits[1].selector.includes('.post-list'));
});
test('home smoke refuses a stuck loader',async()=>{
  await assert.rejects(waitForRenderedPublicHome(fakePage({blocked:'loader'})),/Loading did not end/);
});
test('home smoke refuses a missing feed or empty state',async()=>{
  await assert.rejects(waitForRenderedPublicHome(fakePage({missingContent:true})),/No feed item/);
});
test('home smoke refuses a heading from wrong route',async()=>{
  await assert.rejects(waitForRenderedPublicHome(fakePage({heading:'Поиск'})),/Expected.*Лента/);
});
test('home smoke refuses visible error alerts',async()=>{
  await assert.rejects(waitForRenderedPublicHome(fakePage({alertCount:1})),/error alert/);
});
