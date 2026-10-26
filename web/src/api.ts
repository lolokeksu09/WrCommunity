export type Viewer={id:string;email:string;verified:boolean;handle:string;display_name:string;visibility:'public'|'hidden';platform_role:'member'|'moderator'|'admin';status:string};
export type Session={user:Viewer|null;csrfToken:string};
export type Collection<T>={items:T[];nextCursor?:string|null};
export type Author={id?:string|null;handle?:string;display_name?:string;nickname?:string;avatar_url?:string|null;profile_url?:string|null;editorial?:boolean};
export type ImageAsset={id:string;url:string;width?:number;height?:number};
export type Post={id:string;author_id:string;club_id:string|null;state:string;audience:string;body:string;images:ImageAsset[];tags:string[];created_at:string;updated_at:string;revision_id:string;author:Author;like_count:number;comment_count:number;liked:boolean;bookmarked:boolean};
export type Comment={id:string;post_id:string;parent_id:string|null;body:string;created_at:string;updated_at:string;can_edit?:boolean;can_block?:boolean;can_moderate?:boolean;author:Author};
export type GameField={value:string|string[];public:boolean};
export type Profile={id:string;handle:string;display_name:string;visibility:'public'|'hidden';biography:string;avatar_id:string|null;cover_id:string|null;game:Record<string,GameField>;online_opt_in?:boolean;online?:boolean;editorial?:boolean;created_at:string;version:number;visibility_warnings?:string[]};
export class ApiError extends Error {status:number;code:string;requestId?:string;fields:Record<string,string>;constructor(status:number,code:string,message:string,requestId?:string,fields:Record<string,string>={}){super(message);this.status=status;this.code=code;this.requestId=requestId;this.fields=Object.fromEntries(Object.entries(fields).filter(([,value])=>typeof value==='string'));}}
let csrfToken='';
export async function session():Promise<Session>{const result=await api<Session>('/auth/session');csrfToken=result.csrfToken;return result;}
export async function api<T=Record<string,unknown>>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
 if(method!=='GET'&&method!=='HEAD'&&!csrfToken)await session();
 const multipart=body instanceof FormData;
 const response=await fetch('/api/v1'+path,{method,credentials:'same-origin',headers:{Accept:'application/json',...(body!==undefined&&!multipart?{'Content-Type':'application/json'}:{}),...(method!=='GET'&&method!=='HEAD'?{'X-CSRF-Token':csrfToken}:{})},...(body!==undefined?{body:multipart?body:JSON.stringify(body)}:{}),signal}).catch(error=>{if(error instanceof DOMException&&error.name==='AbortError')throw error;throw new ApiError(0,'NETWORK_ERROR','Нет соединения с сервером. Проверь интернет и повтори попытку.');});
 if(!response.ok){const data=await response.json().catch(()=>null);throw new ApiError(response.status,data?.error?.code??'NETWORK_ERROR',data?.error?.message??'Не удалось выполнить запрос. Попробуйте ещё раз.',data?.error?.requestId,data?.error?.fields??{});}
 if(response.status===204)return {ok:true} as T;
 return response.json() as Promise<T>;
}
export const collection=<T>(path:string,signal?:AbortSignal)=>api<Collection<T>>(path,'GET',undefined,signal);
export const query=(params:Record<string,string|number|undefined|null>)=>{const result=new URLSearchParams();Object.entries(params).forEach(([key,value])=>{if(value!==undefined&&value!==null&&value!=='')result.set(key,String(value));});return result.size?'?'+result.toString():'';};
export const mediaUrl=(id:string|null|undefined)=>id?'/api/v1/media/'+id:undefined;
export const message=(error:unknown)=>error instanceof Error?error.message:'Не удалось выполнить действие. Попробуйте ещё раз.';
