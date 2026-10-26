import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const t=JSON.parse(readFileSync(new URL('../docs/design/premium-v2/tokens.json',import.meta.url),'utf8'));
function linear(value){const x=parseInt(value,16)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}
function luminance(color){assert.match(color,/^#[0-9A-Fa-f]{6}$/);return .2126*linear(color.slice(1,3))+.7152*linear(color.slice(3,5))+.0722*linear(color.slice(5,7));}
function contrast(a,b){const [top,bottom]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (top+.05)/(bottom+.05);}

test('candidate color pairs meet WCAG AA text contrast',()=>{
 const c=t.colors;
 for(const [text,surface] of [['text','canvas'],['text','surface'],['textSecondary','surface'],['textTertiary','surface'],['violet','canvas'],['cyan','canvas'],['primaryButtonText','primaryButton']]){
  assert.ok(contrast(c[text],c[surface])>=4.5,`${text} on ${surface} must have >=4.5:1`);
 }
});
test('design baseline is proposal and reserves touch, reduced motion and narrow viewports',()=>{
 assert.match(t.metadata.status,/NOT shipped/);
 assert.ok(t.targets.minTouchTargetPx>=44);
 assert.deepEqual(t.targets.viewportWidths,[360,390,430,1440]);
 assert.ok(t.motion.reducedMotion);
});
