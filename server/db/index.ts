import pg, {type PoolClient} from 'pg';
export const pool = new pg.Pool({connectionString:process.env.DATABASE_URL ?? 'postgres://wrcommunity:wrcommunity@127.0.0.1:5432/wrcommunity',max:20});
export async function query<T = Record<string,unknown>>(text:string,values:unknown[]=[],tx?:PoolClient):Promise<T[]> {
 return (await (tx ?? pool).query(text,values)).rows as T[];
}
export async function one<T = Record<string,unknown>>(text:string,values:unknown[]=[],tx?:PoolClient):Promise<T|undefined>{return (await query<T>(text,values,tx))[0];}
export async function execute(text:string,values:unknown[]=[],tx?:PoolClient):Promise<void>{await (tx??pool).query(text,values);}
export async function transaction<T>(fn:(tx:PoolClient)=>Promise<T>):Promise<T>{
 const tx=await pool.connect();try{await tx.query('BEGIN');const result=await fn(tx);await tx.query('COMMIT');return result;}catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
export async function lockUsers(tx:PoolClient,ids:string[]):Promise<void>{await tx.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[...new Set(ids)].sort()]);}
export async function lockPair(tx:PoolClient,a:string,b:string):Promise<void>{await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[[a,b].sort().join(':')]);}
