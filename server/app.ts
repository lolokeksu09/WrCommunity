import Fastify,{LogController,type FastifyInstance} from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {one} from './db/index.js';
import {HttpError,fail} from './lib.js';
import {documentRoute} from './openapi.js';
import './types.js';
import {registerAuth,resolveSession} from './modules/auth/routes.js';
import {registerProfiles} from './modules/profiles/routes.js';
import {registerSocial} from './modules/social/routes.js';
import {registerMedia} from './modules/media/routes.js';
import {registerClubs} from './modules/clubs/routes.js';
import {registerClubContent} from './modules/club-content/routes.js';
import {registerDiscovery} from './modules/discovery/routes.js';
import {registerLfg} from './modules/lfg/routes.js';
import {registerEvents} from './modules/events/routes.js';
import {registerNotifications} from './modules/notifications/routes.js';
import {registerModeration} from './modules/moderation/routes.js';
const fallbackCookieSecret=randomBytes(32).toString('hex');
function safeEqual(a:string,b:string):boolean{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export async function buildApp(options:{logger?:boolean}={}):Promise<FastifyInstance>{
 const production=process.env.NODE_ENV==='production';
 const origin=process.env.APP_ORIGIN??'http://localhost:3000';
 if(production){if(!process.env.DATABASE_URL||!process.env.COOKIE_SECRET||process.env.COOKIE_SECRET.length<32||!/^[a-f\d]{64}$/i.test(process.env.LFG_CONTACT_KEY??'')||!process.env.APP_ORIGIN||!process.env.SMTP_HOST||!process.env.SMTP_FROM)throw new Error('Required production configuration missing');}
 const expectedMigrations=(await readdir(new URL('./db/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql'));
 const app=Fastify({logger:options.logger===false?false:{level:'info',redact:['req.headers.cookie','req.headers.authorization','req.headers.x-csrf-token','res.headers.set-cookie']},logController:new LogController({disableRequestLogging:true}),bodyLimit:1024*1024,trustProxy:process.env.TRUST_PROXY_CIDR?.split(',').map(x=>x.trim()).filter(Boolean)??false,requestTimeout:30000});
 await app.register(cookie,{secret:process.env.COOKIE_SECRET??fallbackCookieSecret});
 await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'blob:','data:'],connectSrc:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'self'"],formAction:["'self'"],upgradeInsecureRequests:production?[]:null}},crossOriginResourcePolicy:{policy:'same-origin'}});
 await app.register(rateLimit,{global:process.env.NODE_ENV!=='test',max:180,allowList:process.env.NODE_ENV==='test'?['127.0.0.1']:[],timeWindow:'1 minute',keyGenerator:req=>req.ip});
 await app.register(swagger,{transform:({schema,url,route})=>({schema:documentRoute(route.method,url,schema),url}),openapi:{info:{title:'WrCommunity API',version:'1.0.0'},servers:[{url:'/'}],components:{securitySchemes:{session:{type:'apiKey',in:'cookie',name:'wr_session'},csrf:{type:'apiKey',in:'header',name:'X-CSRF-Token'}}}}});
 app.addHook('onRoute',route=>{if(!route.url.startsWith('/api/v1'))return;route.schema??={};route.schema.tags??=[route.url.split('/')[3]??'api'];route.schema.summary??=`${String(route.method)} ${route.url}`;});
 await app.register(swaggerUI,{routePrefix:'/api/docs',staticCSP:true});
 app.decorateRequest('viewer',null);app.decorateRequest('sessionId',null);app.decorateRequest('csrfToken','');
 app.addHook('onRequest',async(request,reply)=>{
  reply.header('Cache-Control','private, no-store');
  if(!request.routeOptions.url?.startsWith('/api/v1/'))return;
  await resolveSession(request);
  if(!request.csrfToken){const unsigned=request.cookies.wr_csrf?request.unsignCookie(request.cookies.wr_csrf):null;request.csrfToken=unsigned?.valid&&unsigned.value?unsigned.value:randomBytes(32).toString('hex');if(!unsigned?.valid)reply.setCookie('wr_csrf',request.csrfToken,{signed:true,path:'/',httpOnly:true,sameSite:'strict',secure:production&&origin.startsWith('https:'),maxAge:60*60*24});}
  if(!['GET','HEAD','OPTIONS'].includes(request.method)){
   const supplied=request.headers['x-csrf-token'];
   if(request.headers.origin!==origin||typeof supplied!=='string'||!safeEqual(supplied,request.csrfToken))fail(403,'csrf','Обновите страницу и повторите действие.');
   const fetchSite=request.headers['sec-fetch-site'];if(fetchSite==='cross-site')fail(403,'csrf','Недопустимый источник запроса.');
  }
 });
 app.setErrorHandler((error,request,reply)=>{
  const e=error as {statusCode?:number;code?:string;message?:string;validation?:unknown};
  let status=e.statusCode??500;let code=e.code??'internal_error';let message='Не удалось выполнить запрос. Попробуйте ещё раз.';
  if(error instanceof HttpError){message=error.message;code=error.code;status=error.statusCode;}
  else if(e.code==='23505'){status=409;code='conflict';message='Эти данные уже используются.';}
  else if(e.code==='23503'||e.code==='23514'||e.code==='22P02'){status=422;code='validation';message='Проверьте введённые данные.';}
  else if(e.validation){status=422;code='validation';message='Проверьте формат запроса.';}
  else if(status===413){code='too_large';message='Файл или запрос превышает допустимый размер.';}
  else if(status===429){code='rate_limited';message='Слишком много запросов. Повторите позже.';}
  if(status>=500)request.log.error({requestId:request.id,code},'Request failed');
  return reply.code(status).send({error:{code,message,requestId:request.id}});
 });
 app.get('/health/live',async()=>({ok:true}));
 app.get('/health/ready',async(_request,reply)=>{try{const result=await one<{ready:boolean}>('SELECT count(*)=$2::integer AS ready FROM schema_migrations WHERE name=ANY($1::text[])',[expectedMigrations,expectedMigrations.length]);if(!result?.ready)return reply.code(503).send({ok:false});return {ok:true};}catch{return reply.code(503).send({ok:false});}});
 for(const register of [registerAuth,registerProfiles,registerSocial,registerMedia,registerClubs,registerClubContent,registerDiscovery,registerLfg,registerEvents,registerNotifications,registerModeration])await register(app);
 app.get('/api/v1/openapi.json',async()=>app.swagger());
 const webRoot=resolve(process.env.WEB_ROOT??'dist/web');
 if(existsSync(webRoot)){
  await app.register(fastifyStatic,{root:webRoot,wildcard:true,setHeaders:(response,path)=>{if(path.includes('/assets/'))response.header('Cache-Control','public, max-age=31536000, immutable');else response.header('Cache-Control','no-store');}});
  app.setNotFoundHandler((request,reply)=>{if(request.url.startsWith('/api/')||request.url.startsWith('/health/')||request.url.startsWith('/assets/'))return reply.code(404).send({error:{code:'not_found',message:'Страница не найдена.',requestId:request.id}});if(request.method!=='GET')return reply.code(404).send({error:{code:'not_found',message:'Страница не найдена.',requestId:request.id}});return reply.sendFile('index.html');});
 }
 return app;
}
