import { randomUUID } from 'node:crypto';
import { expect, request as requests, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import pg from 'pg';

export const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
export const password = 'WrCommunity-e2e-93!';
export type Person = { id:string; email:string; handle:string; name:string; context:APIRequestContext };

export async function api<T=any>(context:APIRequestContext,path:string,method='GET',data?:unknown):Promise<T> {
  const session = await context.get('/api/v1/auth/session');
  expect(session.ok(),await session.text()).toBeTruthy();
  const {csrfToken} = await session.json();
  const response = await context.fetch('/api/v1'+path,{method,data,headers:{Origin:origin,'X-CSRF-Token':csrfToken}});
  expect(response.ok(),`${method} ${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

// Reading delivery output is a test fixture, never a production verification bypass.
// Prefer actual delivered SMTP mail; a DB outbox is supported when no worker is running.
export async function verificationToken(email:string,purpose:'verify'|'reset'='verify'):Promise<string> {
  const mailpit = process.env.E2E_MAILPIT_URL;
  if (mailpit) {
    const client = await requests.newContext({baseURL:mailpit});
    let token='';
    await expect.poll(async()=>{
      const search = await client.get('/api/v1/search',{params:{query:'to:'+email}});
      if(!search.ok())return false;
      const result=await search.json();
      for(const item of result.messages??[]) {
        const message=await (await client.get('/api/v1/message/'+item.ID)).json();
        const messageText=String(message.Text??'');
        if(!messageText.includes('/auth/'+purpose+'?'))continue;
        const match=messageText.match(/token=([A-Za-z0-9_-]{43})/);
        if(match){token=match[1];return true;}
      }
      return false;
    },{timeout:20000,intervals:[100,250,500,1000]}).toBeTruthy();
    await client.dispose();
    return token;
  }
  if(!process.env.DATABASE_URL)throw new Error('E2E_MAILPIT_URL or isolated test DATABASE_URL is required to read verification delivery');
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  try {
    const {rows}=await pool.query("SELECT payload->>'text' AS text FROM outbox WHERE type='email' AND payload->>'to'=$1 ORDER BY created_at DESC LIMIT 1",[email]);
    const token=rows[0]?.text?.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
    if(!token)throw new Error('Verification email was not available in the test outbox; set E2E_MAILPIT_URL when worker consumes email');
    return token;
  } finally { await pool.end(); }
}
export async function account(options:{hidden?:boolean;moderator?:boolean}={}):Promise<Person>{
  const context=await requests.newContext({baseURL:origin});
  const key=randomUUID().replaceAll('-','').slice(0,18),email=`e2e-${key}@example.com`,handle='e2e_'+key,name='Игрок '+key;
  const {user}=await api(context,'/auth/register','POST',{email,handle,display_name:name,password});
  const token=await verificationToken(email);
  await api(context,'/auth/verify-email','POST',{token});
  if(!options.hidden){const profile=await api(context,'/me/profile');await api(context,'/me/profile','PATCH',{version:profile.version,visibility:'public',visibility_acknowledged:true});}
  if(options.moderator){
    if(!process.env.DATABASE_URL)throw new Error('Moderator E2E needs isolated test DATABASE_URL');
    const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
    try{await pool.query("UPDATE users SET platform_role='moderator' WHERE id=$1",[user.id]);}finally{await pool.end();}
  }
  return {id:user.id,email,handle,name,context};
}
export async function browserPerson(browser:Browser,person:Person){
  const context=await browser.newContext({storageState:await person.context.storageState()});
  const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  return {context,page,errors};
}
export async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();}
export async function future(minutes:number){return new Date(Date.now()+minutes*60000).toISOString().slice(0,16);}
