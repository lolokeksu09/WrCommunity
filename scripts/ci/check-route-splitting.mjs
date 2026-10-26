import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';

const root=process.cwd();
const manifestPath=path.join(root,'dist','web','.vite','manifest.json');
let manifest;
try{
  manifest=JSON.parse(await readFile(manifestPath,'utf8'));
}catch(error){
  console.error('Route-splitting check cannot read the Vite manifest at '+manifestPath+': '+(error instanceof Error?error.message:String(error)));
  process.exit(1);
}
const entries=Object.entries(manifest);
const mainPair=entries.find(([key,chunk])=>chunk.isEntry&&/(^|\/)main\.tsx$/.test(key));
if(!mainPair){
  console.error('Route-splitting check could not find the web/src/main.tsx entry in the Vite manifest.');
  process.exit(1);
}
const [mainKey,main]=mainPair;
const requiredModules=[
  'auth-page.tsx',
  'auth.tsx',
  'profile-editor.tsx',
  'club-activity.tsx',
  'lfg-contacts.tsx',
  'clubs.tsx',
  'social.tsx',
  'lfg-events.tsx',
  'notifications.tsx',
];
const dynamicImports=main.dynamicImports??[];
const staticImports=main.imports??[];
const failures=[];
for(const filename of requiredModules){
  const found=entries.find(([key,chunk])=>key.endsWith('/'+filename)||key===filename||(chunk.src??'').endsWith('/'+filename));
  if(!found){
    failures.push(filename+': missing from build manifest');
    continue;
  }
  const [key]=found;
  if(!dynamicImports.includes(key)){
    failures.push(filename+': not a direct dynamic import from '+mainKey);
  }
  if(staticImports.includes(key)){
    failures.push(filename+': still appears as a static import of '+mainKey);
  }
}
if(failures.length){
  console.error('Route-splitting check failed:\n'+failures.join('\n'));
  process.exit(1);
}
const entryFile=path.join(root,'dist','web',main.file);
const entryBytes=await readFile(entryFile);
const gzipBytes=gzipSync(entryBytes,{level:9}).length;
console.log('Initial entry bundle: '+entryBytes.length+' bytes raw; '+gzipBytes+' bytes gzip.');
console.log('Route-splitting check passed: '+requiredModules.length+' feature modules are separate dynamic imports.');
