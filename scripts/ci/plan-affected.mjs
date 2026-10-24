// Safe, reviewable E2E recommendations from the complete PR diff.
// Recommendations are not test results and cannot replace FULL/RELEASE checks.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const catalog=JSON.parse(readFileSync(path.join(root,'scripts/ci/e2e-levels.json'),'utf8'));
const allAreas=[...new Set(catalog.scenarios.map(s=>s.area))].sort();
const args=process.argv.slice(2);
const json=args.includes('--json');
const remaining=args.filter(x=>x!=='--json');
const baseArgs=remaining.filter(x=>x.startsWith('--base='));
const fileIndex=remaining.indexOf('--files');
if(baseArgs.length>1 || (baseArgs.length>0 && fileIndex!==-1) ||
   (baseArgs.length===0 && fileIndex===-1)){
  console.error('Usage: node scripts/ci/plan-affected.mjs [--json] (--base=<commit-sha> | --files <changed-path>...)');
  process.exit(2);
}
let files=[];
if(fileIndex!==-1){
  if(fileIndex!==0 || remaining.length<2){
    console.error('Expected at least one changed file after --files');
    process.exit(2);
  }
  files=remaining.slice(1);
  if(files.some(f=>!f || f.startsWith('--'))){
    console.error('Invalid changed-file path');
    process.exit(2);
  }
}else{
  if(remaining.length!==1 || !/^--base=[a-f0-9]{40}$/.test(baseArgs[0])){
    console.error('A full 40-character base commit SHA is required');
    process.exit(2);
  }
  const sha=baseArgs[0].slice('--base='.length);
  const result=spawnSync('git',['diff','--name-only','-z','--diff-filter=ACDMRTUXB',sha,'HEAD','--'],{
    cwd:root,encoding:'utf8',maxBuffer:4*1024*1024
  });
  if(result.error || result.status!==0){
    console.error('Cannot read complete PR diff; refusing to guess:',result.stderr||result.error?.message);
    process.exit(2);
  }
  files=result.stdout.split('\0').filter(Boolean);
}
files=[...new Set(files.map(f=>f.replaceAll('\\','/').replace(/^\.\//,'')))].sort();
if(!files.length){
  console.error('No changed files: not a valid PR testing plan.');
  process.exit(2);
}

function classify(file){
  if(file==='AGENTS.md' || file==='README.md' || file==='CONTRIBUTING.md' ||
     file.startsWith('docs/') || file.endsWith('.md')){
    return {kind:'docs',areas:[],reason:'documentation'};
  }
  const e2e=file.match(/^tests\/e2e\/([^/]+\.spec\.ts)$/);
  if(e2e){
    const rows=catalog.scenarios.filter(s=>s.file===e2e[1]);
    if(rows.length)return {kind:'targeted',areas:rows.map(s=>s.area),reason:'classified E2E spec'};
  }
  const targeted={
    'web/src/notifications.tsx':['notifications'],
    'web/src/post-gallery.tsx':['media'],
    'web/src/social.tsx':['comments','editor','feed','media','social'],
    'web/src/clubs.tsx':['clubs','moderation'],
    'web/src/lfg-events.tsx':['clubs','lfg'],
    'tests/e2e/home-feed-ux.spec.ts':['feed'],
    'tests/e2e/pagination.spec.ts':['comments','feed'],
    'tests/e2e/comment-thread-usability.spec.ts':['comments'],
    'tests/e2e/notification-quick-read.spec.ts':['notifications'],
    'tests/e2e/mobile-create-navigation.spec.ts':['editor'],
    'tests/e2e/post-image-gallery.spec.ts':['media'],
  };
  if(Object.hasOwn(targeted,file)){
    return {kind:'targeted',areas:targeted[file],reason:'known feature module'};
  }
  if(file==='web/src/auth.tsx' || file.startsWith('server/') ||
     /^tests\/(auth|security|operator|regression-review|platform|worker)\.test\.ts$/.test(file)){
    return {kind:'expanded',areas:allAreas,securitySensitive:true,reason:'server, access control or shared security'};
  }
  if(file==='web/src/styles.css' || file==='web/src/ui.tsx' ||
     file==='web/src/api.ts' || file==='web/src/main.tsx' ||
     file==='tests/e2e/helpers.ts' || file.startsWith('.github/') ||
     file.startsWith('scripts/') || file==='package.json' || file==='package-lock.json'){
    return {kind:'expanded',areas:allAreas,reason:'shared infrastructure or cross-cutting code'};
  }
  return {kind:'expanded',areas:allAreas,reason:'unclassified file; conservative fallback'};
}
const assessments=files.map(file=>({file,...classify(file)}));
const expanded=assessments.some(x=>x.kind==='expanded');
const areas=expanded?allAreas:[...new Set(assessments.flatMap(x=>x.areas))].sort();
const counts=Object.fromEntries(['L2','L3'].map(level=>
  [level,catalog.scenarios.filter(s=>s.level===level&&areas.includes(s.area)).length]));
const recommendations=[];
for(const level of ['L2','L3']){
  for(const area of areas){
    if(catalog.scenarios.some(s=>s.level===level&&s.area===area)){
      recommendations.push('npm run test:'+level.toLowerCase()+' -- '+area);
    }
  }
}
const plan={
  mode:expanded?'expanded':areas.length?'targeted':'documentation-only',
  areas,
  files,
  levelCounts:counts,
  securitySensitive:assessments.some(x=>x.securitySensitive===true),
  recommendations,
  reasons:assessments.map(x=>({file:x.file,classification:x.kind,reason:x.reason})),
  note:'Plan only. Execute selected L2/L3 in isolated test infrastructure; FULL and RELEASE remain mandatory.'
};
if(json)console.log(JSON.stringify(plan));
else{
  console.log('Affected test plan: '+plan.mode+'; areas: '+(areas.join(', ')||'none'));
  for(const row of plan.reasons)console.log(' - '+row.file+' => '+row.classification+' ('+row.reason+')');
  console.log('L2: '+counts.L2+' declarations; L3: '+counts.L3+' declarations');
  if(plan.securitySensitive)console.log('SECURITY: run relevant API/negative access tests in addition to browser checks.');
  for(const command of recommendations)console.log('   '+command);
  console.log(plan.note);
}
