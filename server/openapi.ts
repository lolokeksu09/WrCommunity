import type {FastifySchema} from 'fastify';
// Documentation schemas complement the domain-owned Zod validators; they do not replace policy checks.
type Schema=Record<string,unknown>;
const str=(maxLength?:number):Schema=>({type:'string',...(maxLength?{maxLength}:{})});
const uuid:Schema={type:'string',format:'uuid'};
const date:Schema={type:'string',format:'date-time'};
const boolean:Schema={type:'boolean'};
const values=(...items:string[]):Schema=>({type:'string',enum:items});
const array=(items:Schema,maxItems?:number):Schema=>({type:'array',items,...(maxItems?{maxItems}:{})});
const obj=(properties:Record<string,Schema>,required:string[]=[]):Schema=>({type:'object',properties,required});
const text=str(5000),images=array(uuid,4),tags=array(str(32),10),roles=array(str(40),8);
const identity=obj({nickname:str(32),avatar_id:{...uuid,nullable:true},roles,consent:{type:'boolean',enum:[true]},consent_version:{type:'integer',enum:[1]},history_acknowledged:{type:'boolean',enum:[true]}},['nickname','consent','consent_version','history_acknowledged']);
const club=obj({name:str(60),description:str(1000),join_mode:values('open','approval'),feed_visibility:values('public','members_only'),rules:str(10000),avatar_id:uuid,cover_id:uuid,event_roles:array(values('owner','admin','moderator','member'),4)},['name','description','join_mode','feed_visibility']);
const post=obj({body:text,images,tags,state:values('draft','published')});
const event=obj({title:str(160),description:text,audience:values('public','members_only'),starts_at:date,ends_at:date,registration_closes_at:date,capacity:{type:'integer',minimum:1}},['title','description','audience','starts_at','ends_at','registration_closes_at','capacity']);
const reason=obj({reason:{type:'string',minLength:5,maxLength:2000}},['reason']);
const bodies:Record<string,Schema>={
 'POST /auth/register':obj({email:{type:'string',format:'email'},password:{type:'string',minLength:12,maxLength:128},handle:{type:'string',pattern:'^[a-z0-9_]{3,32}$'},display_name:str(80)},['email','password','handle','display_name']),
 'POST /auth/login':obj({email:{type:'string',format:'email'},password:str(128)},['email','password']),
 'POST /auth/verify-email':obj({token:str()},['token']),
 'POST /auth/reset-request':obj({email:{type:'string',format:'email'}},['email']),
 'POST /auth/reset-confirm':obj({token:str(),password:{type:'string',minLength:12,maxLength:128}},['token','password']),
 'PATCH /me/profile':obj({version:{type:'integer',minimum:1},display_name:str(80),biography:str(2000),avatar_id:{...uuid,nullable:true},cover_id:{...uuid,nullable:true},visibility:values('hidden','public'),visibility_acknowledged:boolean,online_opt_in:boolean,game:{type:'object',additionalProperties:obj({value:{oneOf:[str(),array(str())]},public:boolean},['value'])}},['version']),
 'PATCH /me/settings':obj({current_password:str(128),email:{type:'string',format:'email'},password:{type:'string',minLength:12,maxLength:128}},['current_password']),
 'DELETE /me/account':obj({password:str(128),confirmation:{type:'string',enum:['DELETE']}},['password','confirmation']),
 'POST /posts':post,'PATCH /posts/:id':post,
 'POST /posts/:id/comments':obj({body:text,parent_id:uuid},['body']),
 'PATCH /comments/:id':obj({body:text},['body']),
 'POST /lfg':obj({server:str(80),roles:array(str(40),5),description:str(2000),expires_at:date,pending_policy:values('keep','reject')},['server','roles','description','expires_at','pending_policy']),
 'PATCH /lfg/:id':obj({description:str(2000),expires_at:date,pending_policy:values('keep','reject')}),
 'POST /lfg/:id/applications':obj({message:str(500),disclosure_consent:boolean},['message']),
 'POST /lfg/applications/:id/decision':obj({decision:values('accepted','rejected')},['decision']),
 'PUT /lfg/applications/:id/contacts':obj({game_contact:str(120),consent:{type:'boolean',enum:[true]}},['game_contact','consent']),
 'POST /clubs':club,'PATCH /clubs/:id':{...club,required:[],properties:{...(club.properties as Record<string,Schema>),state:values('active','archived'),visibility_change_acknowledged:boolean}},
 'DELETE /clubs/:id':obj({password:str(128),confirmation:{type:'string',enum:['DELETE']}},['password','confirmation']),
 'POST /clubs/:id/join':identity,'POST /clubs/:id/requests':identity,'PATCH /clubs/:id/identity':identity,
 'POST /clubs/:id/leave':obj({history_acknowledged:{type:'boolean',enum:[true]}},['history_acknowledged']),
 'POST /clubs/:id/consent/revoke':obj({history_acknowledged:{type:'boolean',enum:[true]}},['history_acknowledged']),
 'POST /clubs/requests/:id/decision':obj({decision:values('approve','reject'),reason:str(2000)},['decision']),
 'PATCH /clubs/:id/members/:membershipId/role':obj({role:values('admin','moderator','member')},['role']),
 'POST /clubs/:id/members/:membershipId/kick':reason,
 'POST /clubs/:id/transfers':obj({to_user_id:uuid},['to_user_id']),
 'POST /clubs/:id/posts':obj({body:text,images,tags},['body']),'PATCH /clubs/posts/:id':obj({body:text,images,tags},['body']),
 'POST /clubs/posts/:id/revisions/:rid/decision':obj({decision:values('approve','reject'),reason:str(2000)},['decision']),
 'POST /clubs/:id/pin':obj({post_id:{...uuid,nullable:true}},['post_id']),
 'DELETE /clubs/comments/:id':reason,
 'PATCH /clubs/:id/reports/:reportId':obj({state:values('reviewing','resolved','dismissed'),reason:str(2000)},['state','reason']),
 'POST /clubs/:id/events':event,'PATCH /events/:id':{...event,required:[]},
 'PATCH /me/notification-preferences':obj(Object.fromEntries(['comments','reactions','mentions','follows','clubs','events','lfg'].map(x=>[x,boolean]))),
 'POST /reports':obj({target_type:values('profile','post','comment','club','lfg','event'),target_id:uuid,reason:str(2000)},['target_type','target_id','reason']),
 'PATCH /moderation/reports/:id':obj({state:values('reviewing','resolved','dismissed'),reason:str(2000)},['state','reason']),
 'POST /moderation/content/:type/:id/remove':obj({report_id:uuid,reason:str(2000)},['report_id','reason']),
 'POST /moderation/content/club/:id/restore':reason,
 'POST /moderation/sanctions':obj({user_id:uuid,kind:values('warning','suspension'),reason:str(2000),expires_at:date,report_id:uuid},['user_id','kind','reason']),
 'POST /moderation/sanctions/:id/revoke':reason,
 'POST /media':obj({file:{type:'string',format:'binary',description:'JPEG, PNG или WebP до 10 МиБ; сигнатура и пиксели проверяются сервером.'}},['file'])
};
export function documentRoute(method:string|string[],url:string,schema:FastifySchema):FastifySchema{
 if(!url.startsWith('/api/v1/'))return schema;
 const path=url.slice('/api/v1'.length),verb=Array.isArray(method)?method[0]!:method;
 const body=bodies[`${verb} ${path}`];const names=[...path.matchAll(/:([A-Za-z]+)/g)].map(m=>m[1]!);
 const params=names.length?obj(Object.fromEntries(names.map(name=>[name,name==='type'?values('post','comment','club','lfg','event'):uuid])),names):undefined;
 const privateRead=/^\/(me|blocks|bookmarks|mentions|moderation)(\/|$)/.test(path)||path.includes('/contacts')||path.includes('/applications');
 const mutation=!['GET','HEAD'].includes(verb);
 const anonymousAuth=/^\/auth\/(register|login|verify-email|reset-request|reset-confirm)$/.test(path);
 const security=mutation?(anonymousAuth?[{csrf:[]}]:[{session:[],csrf:[]}]):privateRead?[{session:[]}]:[];
 return {...schema,...(params?{params}:{}),...(body?{body}:{}),security,description:(schema as {description?:string}).description??'Права доступа, видимость, согласия и блокировки проверяются сервером при каждом запросе. Для недоступных приватных объектов возвращается 404.',...(path==='/media'&&verb==='POST'?{consumes:['multipart/form-data']}:{} )} as FastifySchema;
}
