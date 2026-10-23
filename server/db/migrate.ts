import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {pool} from './index.js';
export async function migrate():Promise<void>{
 const client=await pool.connect();
 try {
  await client.query('SELECT pg_advisory_lock(723001)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const dir=new URL('./migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
   const contents=await readFile(new URL(name,dir),'utf8');const checksum=createHash('sha256').update(contents).digest('hex');
   const existing=await client.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
   if(existing.rows[0]){if(existing.rows[0].checksum!==checksum)throw new Error(`Migration checksum mismatch: ${name}`);continue;}
   await client.query('BEGIN');try{await client.query(contents);await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}
  }
 }finally{await client.query('SELECT pg_advisory_unlock(723001)');client.release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await migrate();await pool.end();}
