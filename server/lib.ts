import type {FastifyRequest} from 'fastify';
import type {PoolClient} from 'pg';
import {z,type ZodType} from 'zod';
z.config(z.locales.ru());
import {execute,one} from './db/index.js';
import type {Viewer} from './types.js';
export class HttpError extends Error {constructor(public statusCode:number,public code:string,message:string){super(message);}}
export function fail(status:number,code:string,message:string):never{throw new HttpError(status,code,message);}
export function requireUser(request:FastifyRequest,verified=true):Viewer {
 const user=request.viewer;
 if(!user)fail(401,'unauthenticated','Войдите в аккаунт.');
 if(user.status!=='active')fail(403,'suspended','Действия аккаунта ограничены.');
 if(verified&&!user.verified)fail(403,'email_unverified','Подтвердите адрес электронной почты.');
 return user;
}
export async function assertCurrentActor(tx:PoolClient,userId:string,verified=true):Promise<void>{
 const actor=await one<{status:string;verified_at:Date|null}>('SELECT status,verified_at FROM users WHERE id=$1',[userId],tx);
 if(!actor||actor.status!=='active'||(verified&&!actor.verified_at))fail(403,'account_unavailable','Подтвердите почту и проверьте доступ к аккаунту.');
}
export function parse<T>(schema:ZodType<T>,value:unknown):T{const parsed=schema.safeParse(value);if(!parsed.success)fail(422,'validation',parsed.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '));return parsed.data;}
export function idParam(request:FastifyRequest,name='id'):string{return parse(z.string().uuid(),(request.params as Record<string,unknown>)[name]);}
export async function notify(tx:PoolClient,recipient:string,eventType:string,objectType:string,objectId:string,actorId?:string):Promise<void>{
 if(actorId&&/follow|like|reaction/.test(eventType)){const actor=await one<{visibility:string}>('SELECT visibility FROM users WHERE id=$1',[actorId],tx);if(actor?.visibility!=='public')return;}
 await execute("INSERT INTO outbox(type,payload) VALUES('notification',$1::jsonb)",[JSON.stringify({recipient,eventType,objectType,objectId,actorId:actorId??null})],tx);
}
