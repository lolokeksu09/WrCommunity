import {randomUUID} from 'node:crypto';
import {buildApp} from '../server/app.js';
import {execute,pool} from '../server/db/index.js';
import type {Viewer} from '../server/types.js';
import type {HTTPMethods} from 'fastify';
export const app=await buildApp({logger:false});
export interface TestUser {id:string;cookie:string;csrf:string;viewer:Viewer;email:string;password:string}
export async function createUser(options:Partial<Pick<Viewer,'visibility'|'platform_role'>> & {verified?:boolean}={}):Promise<TestUser>{
 const key=randomUUID().replaceAll('-','');const email=`test-${key}@example.com`;const password='Test-password-39!';
 const session=await app.inject({method:'GET',url:'/api/v1/auth/session'});
 const initial=session.json() as {csrfToken:string};const cookies=session.cookies.map(c=>`${c.name}=${c.value}`).join('; ');
 const register=await app.inject({method:'POST',url:'/api/v1/auth/register',headers:{cookie:cookies,'x-csrf-token':initial.csrfToken,origin:process.env.APP_ORIGIN??'http://localhost:3000'},payload:{email,password,handle:`u_${key.slice(0,20)}`,display_name:'Тестовый игрок'}});
 if(register.statusCode>=400)throw new Error(`register failed ${register.statusCode} ${register.body}`);
 await execute('UPDATE users SET verified_at=$2,visibility=$3,platform_role=$4 WHERE email=$1',[email,options.verified===false?null:new Date(),options.visibility??'public',options.platform_role??'member']);
 const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{cookie:cookies,'x-csrf-token':initial.csrfToken,origin:process.env.APP_ORIGIN??'http://localhost:3000'},payload:{email,password}});
 if(login.statusCode>=400)throw new Error(`login failed ${login.statusCode} ${login.body}`);
 const cookie=login.cookies.map(c=>`${c.name}=${c.value}`).join('; ');
 const current=await app.inject({method:'GET',url:'/api/v1/auth/session',headers:{cookie}});
 const data=current.json() as {user:Viewer;csrfToken:string};
 return {id:data.user.id,cookie,csrf:data.csrfToken,viewer:data.user,email,password};
}
export async function request(method:string,url:string,user?:TestUser,payload?:unknown){return app.inject({method:method as HTTPMethods,url:url.startsWith('/api/')?url:`/api/v1${url}`,headers:{...(user?{cookie:user.cookie,'x-csrf-token':user.csrf}:{}),origin:process.env.APP_ORIGIN??'http://localhost:3000'},...(payload===undefined?{}:{payload:payload as string|object})});}
export async function resetDatabase():Promise<void>{if(process.env.NODE_ENV!=='test')throw new Error('Test database reset requires NODE_ENV=test');await execute('TRUNCATE users CASCADE');}
export async function closeTests(){await app.close();await pool.end();}
