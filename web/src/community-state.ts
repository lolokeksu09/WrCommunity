// Only navigation metadata and the user's unfinished text survive SPA navigation.
// Server-owned posts, comments and identities are never cached here.
type PageState={pages:number;scrollY:number};
const pageStates=new Map<string,PageState>();
const drafts=new Map<string,string>();
const targets=new Map<string,string>();
let account:string|null=null;
export function resetCommunityState(id:string|null){account=id;pageStates.clear();drafts.clear();targets.clear();}
function keepBounded<T>(map:Map<string,T>,key:string,value:T){map.delete(key);map.set(key,value);if(map.size>100)map.delete(map.keys().next().value!);}
export const readPageState=(key:string)=>pageStates.get(key);
export function writePageState(key:string,state:PageState){keepBounded(pageStates,key,state);}
const allowed=(key:string)=>account!==null&&key.startsWith(account+':');
export const readCommentDraft=(key:string)=>allowed(key)?drafts.get(key)??'':'';
export function writeCommentDraft(key:string,body:string){if(!allowed(key))return;if(body)keepBounded(drafts,key,body.slice(0,5000));else drafts.delete(key);}
export const readReplyTarget=(key:string)=>allowed(key)?targets.get(key)??null:null;
export function writeReplyTarget(key:string,id:string|null){if(!allowed(key))return;if(id)keepBounded(targets,key,id);else targets.delete(key);}
