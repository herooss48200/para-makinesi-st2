'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const form = require('./77_st2_ha_formation_intelligence.js');

assert.equal(ayarlar.heikinAshiFormasyonAktif,true);
assert.equal(ayarlar.heikinAshiFormasyonVetoAktif,true);
assert.equal(ayarlar.heikinAshiFormasyonBakisMum,64);
assert.equal(ayarlar.heikinAshiFormasyonVetoSkor,70);

function row(c,i){
  const o=c+(i%2?0.3:-0.3), high=Math.max(o,c)+0.8, low=Math.min(o,c)-0.8;
  return {openTime:i*2,closeTime:i*2+1,open:o,high,low,close:c,color:c>=o?'GREEN':'RED',source:{open:o,high,low,close:c}};
}
function bottomSeries(){
  const out=[];
  for(let i=0;i<64;i++) {
    let c;
    if(i<20)c=120-i*1.2;
    else if(i<30)c=96-(i-20)*2.5;
    else if(i<48)c=71+Math.sin(i)*1.1;
    else c=72+(i-48)*0.35+Math.sin(i)*0.4;
    out.push(row(c,i));
  }
  return out;
}
const bottom=bottomSeries();
const macro=form.macroContext(bottom);
assert(macro.scoreBottom>=70,`bottom score low: ${macro.scoreBottom}`);
const shortGate=form.formationGate(bottom,'SHORT');
assert.equal(shortGate.veto,true);
assert(shortGate.reasons.some(x=>x.includes('BOTTOM_AFTER_STRONG_DROP')||x.includes('CUP_BOTTOM')));
const longGate=form.formationGate(bottom,'LONG');
assert.equal(longGate.veto,false);
assert(longGate.support.some(x=>x.includes('CUP')||x.includes('BOTTOM')));

// Scott Carney ideal Butterfly çekirdeğine yakın örnek: B~0.786 XA, D~1.27 XA,
// C AB düzeltme aralığında, BC projection ve AB=CD yakınsaması mevcut.
const bullish=[
  {type:'LOW',price:100,index:0},{type:'HIGH',price:120,index:1},
  {type:'LOW',price:104.28,index:2},{type:'HIGH',price:112.14,index:3},
  {type:'LOW',price:94.6,index:4}
];
const b=form.validateButterflyPoints(bullish);
assert.equal(b.valid,true); assert.equal(b.direction,'BULLISH'); assert(b.score>=85);
assert(Math.abs(b.ratios.bXa-.786)<.01); assert(Math.abs(b.ratios.dXa-1.27)<.01);
const bearish=[
  {type:'HIGH',price:120,index:0},{type:'LOW',price:100,index:1},
  {type:'HIGH',price:115.72,index:2},{type:'LOW',price:107.86,index:3},
  {type:'HIGH',price:125.4,index:4}
];
const br=form.validateButterflyPoints(bearish);
assert.equal(br.valid,true); assert.equal(br.direction,'BEARISH'); assert(br.score>=85);

// Pivot tarayıcı da yakın D/PRZ içindeki bullish butterfly'ı gerçekten bulmalı.
function butterflySeries(){
  const seq=[]; let idx=0;
  function add(c){ const o=c*(1+(idx%2?0.0003:-0.0003)), high=Math.max(o,c)+0.15, low=Math.min(o,c)-0.15; seq.push({openTime:idx*2,closeTime:idx*2+1,open:o,high,low,close:c,color:c>=o?'GREEN':'RED',source:{open:o,high,low,close:c}}); idx++; }
  for(let i=0;i<30;i++) add(104+Math.sin(i/2)*0.5);
  function leg(a,z,steps){ for(let i=1;i<=steps;i++) add(a+(z-a)*i/steps); }
  add(100); leg(100,120,6); leg(120,104.28,6); leg(104.28,112.14,6); leg(112.14,94.6,6); leg(94.6,96.2,4);
  return seq;
}
const detected=form.detectButterfly(butterflySeries());
assert.equal(detected.valid,true); assert.equal(detected.nearPrz,true); assert.equal(detected.direction,'BULLISH');

// Entegrasyon: gövde kırılımından sonra formasyon gate çağrılmalı; gerçek pozisyonlu sembol yeni HA pususu almamalı.
const haSrc=fs.readFileSync(path.join(__dirname,'75_st2_heikin_ashi_entry.js'),'utf8');
assert(haSrc.includes("require('./78_st2_ha_market_structure_authority.js')"));
assert(haSrc.includes('structureAuthority.evaluate(series, pusu.yon'));
assert(haSrc.includes('[HA YAPI/FORMASYON VETO]'));
assert(haSrc.includes('if (occupiedSymbol(sym)) return null;'));
assert(haSrc.includes('HA AÇILIŞ PUSU ÖZETİ'));
const reportSrc=fs.readFileSync(path.join(__dirname,'2_rapor.js'),'utf8');
assert(reportSrc.includes('HA AKTİF PUSU'));
assert(reportSrc.includes('HA Formasyon Otoritesi'));
assert(reportSrc.includes('Fincan/Kulp doğru AL fazı VEYA Butterfly doğru D/PRZ'));

// R28.1: güçlü devam yapısı, ters yöndeki sıradan HA girişini veto etmelidir.
function trendSeries(dir=1){
  const out=[];
  for(let i=0;i<64;i++){
    const c=(dir>0?80:120)+dir*i*0.45+Math.sin(i/2)*0.3;
    const o=c+(i%2?0.1:-0.1), high=Math.max(o,c)+0.25, low=Math.min(o,c)-0.25;
    out.push({openTime:i*900000,closeTime:(i+1)*900000-1,open:o,high,low,close:c,color:c>=o?'GREEN':'RED',source:{open:o,high,low,close:c}});
  }
  return out;
}
const up=form.formationGate(trendSeries(1),'SHORT');
assert.equal(up.veto,true);
assert(up.reasons.some(x=>x.includes('SHORT_AGAINST_BULLISH_STRUCTURE')));
const down=form.formationGate(trendSeries(-1),'LONG');
assert.equal(down.veto,true);
assert(down.reasons.some(x=>x.includes('LONG_AGAINST_BEARISH_STRUCTURE')));

console.log('✅ R29.1 HA formation detector base passed | cup/handle + Butterfly detectors preserved | occupied-symbol suppression | formation OR authority wired');
