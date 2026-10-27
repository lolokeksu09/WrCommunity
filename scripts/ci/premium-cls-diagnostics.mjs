// Local-only CLS diagnostics: accepts sanitized geometry, never DOM text or dynamic identifiers.
// W3C Layout Instability: session gap <=1s; maximum session duration <=5s.
const REGIONS=new Set(['route-loading','header','discoveries','feed','post-list','filters','preferences','clubs','profile','empty','navigation','page-heading','main','footer','shell','column','root','document','other']);
const round=(number)=>Math.round(number*100000)/100000;
function safeRect(rect){
 if(!rect||typeof rect!=='object')return null;
 const safe={};
 for(const key of ['x','y','width','height']){
  const value=rect[key];
  if(typeof value!=='number'||!Number.isFinite(value))return null;
  safe[key]=Math.round(value*100)/100;
 }
 return safe;
}
function safeSource(value){
 if(!value||typeof value!=='object')return null;
 const region=typeof value.region==='string'&&REGIONS.has(value.region)?value.region:'other';
 return {region,previousRect:safeRect(value.previousRect),currentRect:safeRect(value.currentRect)};
}
export function summarizeLayoutShifts(input,{maxEntries=120}={}){
 if(!Array.isArray(input))throw new TypeError('Expected layout-shift event array');
 const limit=Number.isInteger(maxEntries)&&maxEntries>=1&&maxEntries<=500?maxEntries:120;
 // Filter input interaction shifts and invalid values before applying the finite payload limit.
 const valid=input.filter(entry=>entry&&typeof entry==='object'&&entry.hadRecentInput!==true&&
  typeof entry.startTime==='number'&&Number.isFinite(entry.startTime)&&entry.startTime>=0&&
  typeof entry.value==='number'&&Number.isFinite(entry.value)&&entry.value>0).sort((a,b)=>a.startTime-b.startTime);
 const entries=valid.slice(0,limit).map(entry=>({
  startTime:Math.round(entry.startTime*100)/100,
  value:round(entry.value),
  sources:Array.isArray(entry.sources)?entry.sources.slice(0,4).map(safeSource).filter(Boolean):[]
 }));
 const droppedEntries=Math.max(0,valid.length-limit);
 let rawCls=0,maxSessionCls=0,sessionCls=0,sessionStart=null,previousTime=null;
 const regions=new Map();
 for(const event of entries){
  rawCls+=event.value;
  if(previousTime===null||event.startTime-previousTime>1000||event.startTime-sessionStart>5000){
   sessionCls=0;sessionStart=event.startTime;
  }
  sessionCls+=event.value;
  maxSessionCls=Math.max(maxSessionCls,sessionCls);
  previousTime=event.startTime;
  // Multiple nodes may shift within one event: count distinct matching regions, not independent CLS contributions.
  for(const region of new Set(event.sources.map(x=>x.region))){
   const stat=regions.get(region)??{region,eventCount:0,associatedShiftValue:0};
   stat.eventCount+=1;stat.associatedShiftValue=round(stat.associatedShiftValue+event.value);
   regions.set(region,stat);
  }
 }
 return {rawCls:round(rawCls),maxSessionCls:round(maxSessionCls),eventCount:entries.length,
  droppedEntries,regions:[...regions.values()].sort((a,b)=>b.associatedShiftValue-a.associatedShiftValue||a.region.localeCompare(b.region)),
  events:entries};
}
