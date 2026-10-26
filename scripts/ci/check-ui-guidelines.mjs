import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';

const root=join(process.cwd(),'web','src');
const files=[];
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory()) await walk(path);
    else if(/\.(tsx|ts|css)$/.test(entry.name)) files.push(path);
  }
}
await walk(root);
const failures=[];
for(const path of files){
  const source=await readFile(path,'utf8');
  if(/transition\s*:\s*all\b/.test(source)) failures.push(path+': transition: all is not allowed');
  if(/outline\s*:\s*none\b/.test(source)) failures.push(path+': outline: none is not allowed without a replacement');
  for(const match of source.matchAll(/<img\b[^>]*>/g)){
    const tag=match[0];
    if(!/\bwidth\s*=/.test(tag)||!/\bheight\s*=/.test(tag)){
      const line=source.slice(0,match.index).split('\n').length;
      failures.push(path+':'+line+': image must reserve width and height');
    }
  }
}
if(failures.length){
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('UI guideline checks passed for '+files.length+' source files.');
