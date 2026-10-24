import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { one, execute, transaction, lockUsers } from '../../db/index.js';
import { requireUser, idParam, fail } from '../../lib.js';
import { canReadMedia, mediaDirectory } from './service.js';

export async function registerMedia(app:FastifyInstance):Promise<void>{
 await app.register(multipart,{limits:{fileSize:10*1024*1024,files:1,fields:0,parts:1},throwFileSizeLimit:true});
 app.post('/api/v1/media',async request=>{
  const user=requireUser(request);
  const parts=request.parts();let raw:Buffer|undefined;
  try{for await(const part of parts){if(part.type!=='file'||part.fieldname!=='file')fail(422,'invalid_image','Ожидается одно поле file');raw=await part.toBuffer();if(part.file.truncated)fail(413,'image_too_large','Максимальный размер 10 МиБ');}}
  catch(error:any){if(error.statusCode===413||error.code==='FST_REQ_FILE_TOO_LARGE'||error.code==='FST_FILES_LIMIT'||error.code==='FST_PARTS_LIMIT')fail(413,'image_too_large','Не более одного изображения до 10 МиБ');throw error;}
  if(!raw?.length)fail(422,'invalid_image','Добавьте изображение');
  const jpeg=raw[0]===0xff&&raw[1]===0xd8&&raw[2]===0xff;
  const png=raw.length>=8&&raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=raw.length>=12&&raw.subarray(0,4).toString()==='RIFF'&&raw.subarray(8,12).toString()==='WEBP';
  if(!jpeg&&!png&&!webp)fail(422,'invalid_image','Допустимы JPEG, PNG и WebP');
  let output:Buffer;let width:number;let height:number;
  try{
   const image=sharp(raw,{failOn:'warning',limitInputPixels:40_000_000});const meta=await image.metadata();
   if(!['jpeg','png','webp'].includes(meta.format||'')||(meta.pages||1)!==1)fail(422,'invalid_image','Анимированные изображения не поддерживаются');
   const encoded=await image.rotate().webp({quality:85}).toBuffer({resolveWithObject:true});output=encoded.data;width=encoded.info.width;height=encoded.info.height;
   if(output.length>10*1024*1024)fail(413,'image_too_large','Изображение превышает 10 МиБ после обработки');
  }catch(error:any){if(error.statusCode)throw error;fail(422,'invalid_image','Не удалось безопасно обработать изображение');}
  const id=randomUUID(),key=`${id}.webp`,directory=mediaDirectory();await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(join(directory,key),output,{flag:'wx',mode:0o600});
  try{await transaction(async tx=>{
   await lockUsers(tx,[user.id]);
   if(!await one("SELECT 1 FROM users WHERE id=$1 AND status='active' AND verified_at IS NOT NULL",[user.id],tx))fail(403,'account_unavailable','Аккаунт недоступен');
   await execute('INSERT INTO media_blobs(id,owner_id,storage_key,mime,size_bytes,sha256) VALUES($1,$2,$3,$4,$5,$6)',[id,user.id,key,'image/webp',output.length,createHash('sha256').update(output).digest('hex')],tx);
  });}
  catch(error){await unlink(join(directory,key));throw error;}
  return {id,url:`/api/v1/media/${id}`,mime:'image/webp',size_bytes:output.length,width,height};
 });
 app.get('/api/v1/media/:id',async(request,reply)=>{
  const id=idParam(request);if(!await canReadMedia(request.viewer?.id||null,id))fail(404,'not_found','Изображение не найдено');
  const media=await one<{storage_key:string;mime:string}>('SELECT storage_key,mime FROM media_blobs WHERE id=$1 AND state=\'ready\'',[id]);
  if(!media||!/^[0-9a-f-]{36}\.webp$/.test(media.storage_key))fail(404,'not_found','Изображение не найдено');
  let bytes:Buffer;try{bytes=await readFile(join(mediaDirectory(),media.storage_key));}catch{fail(404,'not_found','Изображение не найдено');}
  return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox").type(media.mime).send(bytes);
 });
 app.delete('/api/v1/media/:id',async request=>{
  const user=requireUser(request);const id=idParam(request);
  const key=await transaction(async tx=>{
   await lockUsers(tx,[user.id]);
   if(!await one("SELECT 1 FROM users WHERE id=$1 AND status='active' AND verified_at IS NOT NULL",[user.id],tx))fail(403,'account_unavailable','Аккаунт недоступен');
   const media=await one<{storage_key:string}>('SELECT storage_key FROM media_blobs WHERE id=$1 AND owner_id=$2 AND state=\'ready\' FOR UPDATE',[id,user.id],tx);
   if(!media)fail(404,'not_found','Изображение не найдено');
   const used=await one(`SELECT 1 WHERE EXISTS(SELECT 1 FROM users WHERE avatar_id=$1 OR cover_id=$1) OR EXISTS(SELECT 1 FROM clubs WHERE avatar_id=$1 OR cover_id=$1) OR EXISTS(SELECT 1 FROM club_memberships WHERE avatar_id=$1) OR EXISTS(SELECT 1 FROM comments WHERE snapshot_avatar_id=$1 AND state='published') OR EXISTS(SELECT 1 FROM posts p JOIN post_revisions r ON r.id=p.current_revision_id WHERE p.state<>'removed' AND r.images ? $2)`,[id,id],tx);
   if(used)fail(409,'media_in_use','Изображение используется');
   await execute('UPDATE media_blobs SET state=\'deleted\' WHERE id=$1',[id],tx);return media.storage_key;
  });await unlink(join(mediaDirectory(),key)).catch(()=>{});return {ok:true};
 });
}
