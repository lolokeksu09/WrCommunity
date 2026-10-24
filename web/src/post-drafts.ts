import type {ImageAsset} from './api';

export type UnfinishedPost={body:string;tags:string;images:ImageAsset[];savedId?:string;savedSnapshot?:string};
const prefix='wrcommunity:post-draft:',accountKey='wrcommunity:post-draft-account';
const memory=new Map<string,UnfinishedPost>();
let activeAccount:string|null=null;
const allowed=(key:string)=>activeAccount!==null&&key.startsWith('post:'+activeAccount+':');

export function resetPostDrafts(accountId:string|null){
 memory.clear();activeAccount=accountId;
 try{
  if(!accountId||sessionStorage.getItem(accountKey)!==accountId){
   for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith(prefix))sessionStorage.removeItem(key);}
  }
  if(accountId)sessionStorage.setItem(accountKey,accountId);else sessionStorage.removeItem(accountKey);
 }catch{/* The in-memory editor remains usable when browser storage is blocked. */}
}
export function readPostDraft(key:string):UnfinishedPost|undefined{
 if(!allowed(key))return;
 const current=memory.get(key);if(current)return current;
 try{
  const raw=sessionStorage.getItem(prefix+key);if(!raw)return;
  const value=JSON.parse(raw) as Partial<UnfinishedPost>|null;
  if(!value||typeof value.body!=='string'||value.body.length>5000||typeof value.tags!=='string'||value.tags.length>512||!Array.isArray(value.images)||value.images.length>4)return;
  if(value.images.some(image=>!image||typeof image.id!=='string'||typeof image.url!=='string'||!image.url.startsWith('/api/v1/media/')))return;
  if(value.savedId!==undefined&&(typeof value.savedId!=='string'||value.savedId.length>64))return;
  if(value.savedSnapshot!==undefined&&(typeof value.savedSnapshot!=='string'||value.savedSnapshot.length>20000))return;
  const draft:UnfinishedPost={body:value.body,tags:value.tags,images:value.images,savedId:value.savedId,savedSnapshot:value.savedSnapshot};memory.set(key,draft);return draft;
 }catch{return;}
}
export function writePostDraft(key:string,draft:UnfinishedPost):boolean{
 if(!allowed(key))return false;
 memory.set(key,draft);
 try{sessionStorage.setItem(prefix+key,JSON.stringify(draft));return true;}catch{return false;}
}
export function removePostDraft(key:string){memory.delete(key);try{sessionStorage.removeItem(prefix+key);}catch{/* Memory cleanup still succeeds. */}}
export const postSnapshot=(body:string,tags:string,images:ImageAsset[])=>JSON.stringify({body,tags,images:images.map(image=>image.id)});
