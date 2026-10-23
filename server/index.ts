import {buildApp} from './app.js';
import {pool} from './db/index.js';
const app=await buildApp();
await app.listen({host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??3000)});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void app.close().then(()=>pool.end()).then(()=>process.exit(0));});
