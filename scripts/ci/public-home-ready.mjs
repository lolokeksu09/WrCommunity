// Read-only public feed readiness contract. Test with fake locators; run with Playwright in release.
import assert from 'node:assert/strict';

export async function waitForRenderedPublicHome(page,{timeoutMs=30000}={}){
  const heading=page.locator('.feed-head h2');
  await heading.waitFor({state:'visible',timeout:timeoutMs});
  assert.match((await heading.innerText()).trim(),/^Лента$/,'Expected rendered Лента heading');
  await page.locator('.post-list > .post, .post-list > .empty').first().waitFor({state:'visible',timeout:timeoutMs});
  await page.locator('.route-loading').waitFor({state:'hidden',timeout:timeoutMs});
  const errors=await page.locator('#main-content .feedback.error, #main-content [role="alert"]').count();
  assert.equal(errors,0,'Rendered homepage contains an error alert');
}
