const assert = require('assert');
const r = require('./72_st2_renko_core.js');
const candles=[]; let close=100;
for(let i=0;i<30;i++){const prev=close;close+=i<15?-0.2:0.25;candles.push({open:prev,high:Math.max(prev,close)+0.1,low:Math.min(prev,close)-0.1,close,closeTime:i+1});}
assert(r.atr(candles,14)>0);
const bricks=r.renkoUret(candles,0.5);
assert(bricks.some(b=>b.color==='RED')&&bricks.some(b=>b.color==='GREEN'));
assert.strictEqual(r.tetikFiyati({yon:'LONG',referansSeviye:100},0.05),100.05);
assert.strictEqual(r.tetikFiyati({yon:'SHORT',referansSeviye:100},0.05),99.95);
const p=r.pusuOlustur('TEST','LONG',{id:1,color:'RED',open:100,high:100,low:99,close:99},{senaryo:'KIRMIZI_MUM_ALT_BAND'});
r.aktifPusudaTuglaIsle(p,{id:2,color:'GREEN',open:99,high:100,low:99,close:100},'DOWN');
assert.strictEqual(p.donusTuglasiKapandi,true); assert.strictEqual(p.tuglaSayaci,1);
r.aktifPusudaTuglaIsle(p,{id:3,color:'GREEN',open:100,high:101,low:100,close:101},'UP');
assert.strictEqual(p.superTrendOnayi,true); assert.strictEqual(p.tuglaSayaci,2);
console.log('✅ ST2 Renko entry contract tests passed');
