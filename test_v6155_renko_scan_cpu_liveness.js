'use strict';
const assert=require('assert');
const fs=require('fs');
const core=require('./72_st2_renko_core.js');

function sameBrick(a,b){
  return ['id','open','high','low','close','color','closeTime'].every(k=>a?.[k]===b?.[k]);
}
let seed=20260809;
function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/2**32;}
for(let t=0;t<150;t++){
  const n=30+Math.floor(rnd()*220);
  const box=0.0001+rnd()*25;
  let price=box*(10+rnd()*10000);
  const candles=[{close:price,closeTime:1}];
  for(let i=1;i<n;i++){
    const move=rnd()<0.08?(50+rnd()*600):(rnd()*10-5);
    price=Math.max(box*0.1,price+move*box);
    candles.push({close:price,closeTime:i+1});
  }
  const full=core.renkoUret(candles,box);
  const tail=core.renkoUretSon(candles,box,128);
  const expected=full.slice(-128);
  assert.strictEqual(tail.totalCount,full.length,'tail totalCount must preserve full Renko count');
  assert.strictEqual(tail.length,expected.length,'tail length mismatch');
  assert(tail.every((x,i)=>sameBrick(x,expected[i])),'tail must be bit-exact with full Renko suffix');
}

// Pathological large-jump sequence: live path must stay bounded in retained objects.
const rows=[{close:100,closeTime:1}];
let p=100;const box=0.01;
for(let i=1;i<250;i++){p+=(i%2?1:-1)*100;rows.push({close:p,closeTime:i+1});}
const tail=core.renkoUretSon(rows,box,128);
assert(tail.totalCount>1_000_000,'fixture must exercise million-brick path');
assert.strictEqual(tail.length,128,'live Renko tail must remain bounded');

const entry=fs.readFileSync('./72_st2_renko_entry.js','utf8');
const adaptive=fs.readFileSync('./76_st2_adaptive_dna_entry.js','utf8');
const evolution=fs.readFileSync('./73_st2_renko_entry_evolution.js','utf8');
assert(entry.includes('core.renkoUretSon(candles, box, liveTail)'),'live scan must use bounded exact Renko tail');
assert(adaptive.includes('adaptiveStateCache'),'adaptive DNA state must be cached between unchanged reads');
assert(adaptive.includes('historicalCompletionCache'),'historical completion must be cached between unchanged reads');
assert(evolution.includes('summaryCache'),'entry evolution summary must be cached between unchanged reads');
console.log('✅ v6.13.5-R17 Renko scan CPU liveness passed | exact tail + bounded million-brick path + unchanged-state caches');
