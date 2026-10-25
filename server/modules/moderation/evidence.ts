import {one} from '../../db/index.js';
import {canReadPost} from '../policy/service.js';
import {announcementRow,canReadAnnouncement} from '../lfg/service.js';
import {eventRow,canReadEvent} from '../events/service.js';

type Evidence={id:string;title?:string;body?:string;biography?:string;display_name?:string;handle?:string;href:string};
// A report grants context for a decision, never extra object visibility.
export async function reportEvidence(type:string,id:string,viewerId:string):Promise<Evidence|null>{
 if(type==='post'&&await canReadPost(viewerId,id)){
  const row=await one<{id:string;body:string}>('SELECT p.id,r.body FROM posts p JOIN post_revisions r ON r.id=p.current_revision_id WHERE p.id=$1',[id]);
  return row?{...row,href:'/posts/'+id}:null;
 }
 if(type==='comment'){
  const row=await one<{id:string;post_id:string;body:string}>('SELECT id,post_id,body FROM comments WHERE id=$1',[id]);
  return row&&await canReadPost(viewerId,row.post_id)?{id:row.id,body:row.body,href:'/posts/'+row.post_id}:null;
 }
 if(type==='profile'){
  // Preserve the existing report-bound moderation of public, blocked profiles.
  const row=await one<{id:string;handle:string;display_name:string;biography:string}>("SELECT id,handle,display_name,biography FROM users WHERE id=$1 AND visibility='public' AND status<>'deleted'",[id]);
  return row?{...row,href:'/users/'+id}:null;
 }
 if(type==='club'){
  const row=await one<{id:string;title:string;body:string}>("SELECT id,name AS title,description AS body FROM clubs WHERE id=$1 AND state<>'deleted'",[id]);
  return row?{...row,href:'/clubs/'+id}:null;
 }
 if(type==='lfg'){
  const row=await announcementRow(id);
  return row&&await canReadAnnouncement(row,viewerId)?{id:row.id,title:'Поиск команды · '+row.server,body:row.description,href:'/lfg/'+id}:null;
 }
 if(type==='event'){
  const row=await eventRow(id);
  return row&&await canReadEvent(row,viewerId)?{id:row.id,title:row.title,body:row.description,href:'/events/'+id}:null;
 }
 return null;
}
