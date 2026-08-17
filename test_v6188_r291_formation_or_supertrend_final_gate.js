'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const ayarlar=require('./ayarlar.js');
const stGate=require('./79_st2_ha_supertrend_final_gate.js');

assert.equal(ayarlar.heikinAshiFormationOrGateAktif,true);
assert.equal(ayarlar.heikinAshiFinalSuperTrendAktif,true);
assert.equal(ayarlar.heikinAshiFinalSuperTrendPeriyodu,'3m');
assert.equal(ayarlar.heikinAshiFinalSuperTrendPeriod,10);
assert.equal(ayarlar.heikinAshiFinalSuperTrendMultiplier,3);

function oneMinute(start, closes){
  return closes.map((c,i)=>{
    const open=i?closes[i-1]:c;
    return {openTime:start+i*60000,closeTime:start+(i+1)*60000-1,open,high:Math.max(open,c)+0.2,low:Math.min(open,c)-0.2,close:c,volume:1};
  });
}
function simpleSt(candles){
  return {trend:candles.at(-1).close>=candles[0].close?'UP':'DOWN',value:candles.at(-1).close};
}

// 1) 3m ST için yeni network yok: kapanmış 1m mumlar eksiksiz 3m bucket'a yerelde toplanır.
const start=Date.UTC(2026,7,17,0,0,0);
let rows=oneMinute(start,Array.from({length:36},(_,i)=>100+i*0.4));
let agg=stGate.aggregateClosedCandles(rows,'3m',start+36*60000);
assert.equal(agg.length,12);
assert.equal(agg[0].openTime,start);
assert.equal(agg[0].close,rows[2].close);
assert.equal(agg[0].high,Math.max(rows[0].high,rows[1].high,rows[2].high));
assert.equal(agg[0].low,Math.min(rows[0].low,rows[1].low,rows[2].low));
rows=rows.filter((_,i)=>i!==4);
agg=stGate.aggregateClosedCandles(rows,'3m',start+36*60000);
assert.equal(agg.length,11);

// 2) Son kapı yön eşleşmesi kesin; LONG=UP/yeşil, SHORT=DOWN/kırmızı.
assert.equal(stGate.matchesSide('LONG','UP'),true);
assert.equal(stGate.matchesSide('LONG','DOWN'),false);
assert.equal(stGate.matchesSide('SHORT','DOWN'),true);
assert.equal(stGate.matchesSide('SHORT','UP'),false);
let e=stGate.evaluateFromOneMinute(oneMinute(start,Array.from({length:36},(_,i)=>100+i*.4)),'LONG',simpleSt,start+36*60000);
assert.equal(e.ready,true); assert.equal(e.allowed,true); assert.equal(e.trend,'UP'); assert.equal(e.tf,'3m');
e=stGate.evaluateFromOneMinute(oneMinute(start,Array.from({length:36},(_,i)=>120-i*.4)),'LONG',simpleSt,start+36*60000);
assert.equal(e.ready,true); assert.equal(e.allowed,false); assert.equal(e.trend,'DOWN');

// 3) Kod sırası: KAPANMIŞ teyit -> sonraki 15m gövde kırılımı -> formasyon OR/BB -> ST son kapı -> REAL.
const src=fs.readFileSync(path.join(__dirname,'75_st2_heikin_ashi_entry.js'),'utf8');
const confirmation=src.indexOf('[HA TEYİT MUMU KAPANDI]');
const body=src.indexOf('livePriceCrossed(pusu.yon, price, pusu.bodyBoundary)');
const structure=src.indexOf('structureAuthority.evaluate(series, pusu.yon');
const st=src.indexOf('finalStGate.evaluateFromOneMinute');
const real=src.indexOf('motor.pozisyonAc(sym, pusu.yon');
assert(confirmation>=0 && body>confirmation && structure>body && st>structure && real>st,'strict order broken');
assert(src.includes('Teyit KAPANMIŞ'));
assert(src.includes("Beklenen ${pusu.yon==='LONG'?'UP/YEŞİL':'DOWN/KIRMIZI'}"));
assert(src.includes("raceVersion:'R29.2-HA-FORMATION-OBSERVABILITY'"));

// 4) ST tersken pusu silinmez; tek 15m tetik penceresinde doğru kapanmış 3m ST beklenir.
const waitBlock=src.slice(src.indexOf('if (!st.allowed)'),src.indexOf('inc(\'superTrendAllow\')'));
assert(!waitBlock.includes('delete s.pusular[sym]'));
assert(waitBlock.includes('return false'));

console.log('✅ R29.1 formation OR + SuperTrend final gate passed | CLOSED confirmation first | NEXT-15m body break | CUP/HANDLE OR Butterfly | CLOSED 1m→3m ST final gate | opposite ST waits, no new network');
