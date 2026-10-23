import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {one,execute,transaction,pool} from '../db/index.js';
import {fail,HttpError} from '../lib.js';
export async function grantAdmin(email:string,confirmed:boolean):Promise<{id:string}>{
 if(!confirmed)fail(422,'confirmation_required','Назначение требует флага --confirm.');
 const parsed=z.email().safeParse(email.trim().toLowerCase());if(!parsed.success)fail(422,'invalid_email','Укажите email зарегистрированного аккаунта.');
 return transaction(async tx=>{
  const user=await one<{id:string}>("SELECT id FROM users WHERE email=$1 AND status='active' AND verified_at IS NOT NULL FOR UPDATE",[parsed.data],tx);
  if(!user)fail(404,'verified_account_required','Нужен действующий аккаунт с подтверждённой почтой.');
  await execute("UPDATE users SET platform_role='admin',version=version+1,updated_at=now() WHERE id=$1",[user.id],tx);
  await execute("INSERT INTO audit_actions(actor_id,action,target_id,reason,metadata) VALUES($1,'platform_admin_grant',$1,'Подтверждённое назначение оператором через CLI','{\"source\":\"operator_cli\"}')",[user.id],tx);
  return {id:user.id};
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{await grantAdmin(process.argv[2]??'',process.argv.includes('--confirm'));process.stdout.write('Администратор назначен; действие сохранено в аудите.\n');}
 catch(error){process.stderr.write((error instanceof HttpError?error.message:'Назначение не выполнено. Проверьте подключение к базе.')+'\n');process.exitCode=1;}
 finally{await pool.end();}
}
