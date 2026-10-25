import {z} from 'zod';
import {fail} from './lib.js';
const cursorSchema=z.object({at:z.string().datetime({offset:true}),id:z.string().uuid(),score:z.number().int().min(0).max(9).optional()}).strict();
export type ListingCursor=z.infer<typeof cursorSchema>;
export function decodeListingCursor(value:string|undefined,ranked=false):ListingCursor|null{
 if(value===undefined)return null;
 try{
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('invalid encoding');
  const cursor=cursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));
  if((cursor.score!==undefined)!==ranked)throw new Error('wrong listing');
  return cursor;
 }catch{fail(422,'invalid_cursor','Некорректный курсор. Обновите поиск.');}
}
// cursor_at is SQL-formatted text, preserving PostgreSQL microseconds.
export function encodeListingCursor(row:{cursor_at:string;id:string;score?:number},ranked=false):string{
 return Buffer.from(JSON.stringify({at:row.cursor_at,id:row.id,...(ranked?{score:row.score}:{})})).toString('base64url');
}

const scopedCursorSchema=z.object({version:z.literal(1),scope:z.string().max(200),at:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
export function decodeScopedCursor(value:string|undefined,scope:string):{at:string;id:string}|null{
 if(value===undefined)return null;
 try{
  if(value.length>600||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('encoding');
  const cursor=scopedCursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));
  if(cursor.scope!==scope)throw new Error('scope');
  return cursor;
 }catch{fail(422,'invalid_cursor','Список изменился или курсор недействителен. Откройте список заново.');}
}
export function encodeScopedCursor(row:{cursor_at:string;id:string},scope:string):string{
 return Buffer.from(JSON.stringify({version:1,scope,at:row.cursor_at,id:row.id})).toString('base64url');
}
