// Run the smallest existing Playwright scenario group by declared depth and product area.
// Never use this selector in place of FULL CI; FULL always runs npm run test:e2e.
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const data=JSON.parse(readFileSync(path.join(root,'scripts/ci/e2e-levels.json'),'utf8'));
const [level,...options]=process.argv.slice(2);
const validLevels=['L2','L3'];
if(!validLevels.includes(level)) {
  console.error('Usage: npm run test:l2|test:l3 -- [area] [--project=mobile-chromium|desktop-chromium] [--list|--dry-run]');
  process.exit(2);
}
const area=options.find(s=>!s.startsWith('--'));
const flags=options.filter(s=>s.startsWith('--'));
if(options.filter(s=>!s.startsWith('--')).length>1||
   flags.some(s=>!['--list','--dry-run','--project=mobile-chromium','--project=desktop-chromium'].includes(s))||
   flags.filter(s=>s.startsWith('--project=')).length>1) {
  console.error('Invalid selector options');
  process.exit(2);
}
const areas=new Set(data.scenarios.map(s=>s.area));
if(area&&!areas.has(area)) {
  console.error('Unknown area: '+area+'. Available: '+[...areas].sort().join(', '));
  process.exit(2);
}
const cases=data.scenarios.filter(s=>s.level===level&&(!area||s.area===area));
if(!cases.length) {
  console.error('No classified '+level+' tests for area '+(area||'(all)')+'.');
  process.exit(2);
}
const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const expression=cases.map(s=>escapeRegex(s.name)).join('|');
const playwright=path.join(root,'node_modules/.bin',process.platform==='win32'?'playwright.cmd':'playwright');
const args=['test','--config','scripts/playwright.config.ts','--grep',expression,...flags.filter(s=>s.startsWith('--project='))];
if(flags.includes('--list'))args.push('--list');
console.log(level+(area?'/'+area:'')+': '+cases.length+' classified declarations'+(flags.includes('--dry-run')?' (dry-run)':''));
if(flags.includes('--dry-run')){
  for(const s of cases)console.log(' - '+s.file+' :: '+s.name);
  process.exit(0);
}
if(!existsSync(playwright)){
  console.error('Playwright not installed. Run npm ci, then retry in the isolated E2E environment.');
  process.exit(2);
}
const result=spawnSync(playwright,args,{cwd:root,stdio:'inherit',env:process.env});
if(result.error)throw result.error;
process.exit(result.status??1);
