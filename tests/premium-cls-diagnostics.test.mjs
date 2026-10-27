import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLayoutShifts} from '../scripts/ci/premium-cls-diagnostics.mjs';

test('CLS session window restarts after a gap and differs from raw cumulative sum',()=>{
 const result=summarizeLayoutShifts([
  {startTime:1000,value:0.12,sources:[{region:'feed',previousRect:{x:0,y:30,width:340,height:45},currentRect:{x:0,y:70,width:340,height:45}}]},
  {startTime:1800,value:0.14,sources:[{region:'feed'}]},
  {startTime:8000,value:0.30,sources:[{region:'filters'}]},
 ]);
 assert.equal(result.rawCls,0.56);
 assert.equal(result.maxSessionCls,0.30);
 assert.equal(result.eventCount,3);
 assert.deepEqual(result.regions.map(x=>x.region),['filters','feed']);
 assert.equal(result.regions.find(x=>x.region==='feed').eventCount,2);
});

test('CLS session window is at most five seconds even with shorter inter-shift gaps',()=>{
 const result=summarizeLayoutShifts([
  {startTime:0,value:0.1},
  {startTime:900,value:0.1},
  {startTime:1800,value:0.1},
  {startTime:2700,value:0.1},
  {startTime:3600,value:0.1},
  {startTime:4500,value:0.1},
  {startTime:5400,value:0.1},
 ]);
 assert.equal(result.maxSessionCls,0.6);
});

test('rejects interaction shifts and never stores unsafe dynamic selectors or DOM text',()=>{
 const result=summarizeLayoutShifts([
  {startTime:1,value:0.15,hadRecentInput:true,sources:[{region:'feed'}]},
  {startTime:2,value:0.25,sources:[{region:'private-player-name',textContent:'Sensitive personal details',previousRect:{x:0,y:0,width:20,height:20},outerHTML:'secret'}]},
 ]);
 assert.equal(result.rawCls,0.25);
 assert.equal(result.eventCount,1);
 assert.equal(result.events[0].sources[0].region,'other');
 const serialized=JSON.stringify(result);
 assert.ok(!serialized.includes('Sensitive'));
 assert.ok(!serialized.includes('private-player-name'));
 assert.ok(!serialized.includes('secret'));
 assert.ok(!serialized.includes('outerHTML'));
});

test('caps entry/source payloads and ignores invalid or negative values',()=>{
 const large=Array.from({length:140},(_,i)=>({startTime:i*1500,value:0.01,sources:Array.from({length:10},()=>({region:'navigation'}))}));
 const result=summarizeLayoutShifts([{startTime:0,value:-1},{startTime:1,value:NaN},...large],{maxEntries:120});
 assert.equal(result.eventCount,120);
 assert.equal(result.droppedEntries,20);
 assert.equal(result.events.every(x=>x.sources.length<=4),true);
 assert.equal(result.maxSessionCls,0.01);
});

test('reports no shift cleanly',()=>{
 const result=summarizeLayoutShifts([]);
 assert.equal(result.maxSessionCls,0);
 assert.equal(result.rawCls,0);
 assert.deepEqual(result.regions,[]);
});
