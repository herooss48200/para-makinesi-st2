'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const ayarlar=require('./ayarlar.js');
const auth=require('./78_st2_ha_market_structure_authority.js');
const form=require('./77_st2_ha_formation_intelligence.js');

assert.equal(ayarlar.heikinAshiStructureAuthorityAktif,true);
assert.equal(ayarlar.heikinAshiFormationOrGateAktif,true);
assert.equal(ayarlar.heikinAshiBbWidePercentile,72);
assert.equal(ayarlar.heikinAshiBbExtremePercentile,90);
assert.equal(ayarlar.heikinAshiCupBuyukBakisMum,80);
assert.equal(ayarlar.heikinAshiCupKucukBakisMum,28);
assert.equal(ayarlar.heikinAshiButterflyMinScore,72);

function mk(values, wick=.35){
  return values.map((c,i)=>{
    const prev=i?values[i-1]:c;
    const o=prev+(c-prev)*0.20;
    const high=Math.max(o,c)+wick, low=Math.min(o,c)-wick;
    return {openTime:i*900000,closeTime:(i+1)*900000-1,open:o,high,low,close:c,color:c>o?'GREEN':c<o?'RED':'DOJI',source:{open:o,high,low,close:c}};
  });
}
function leg(a,b,n){ const out=[]; for(let i=1;i<=n;i++) out.push(a+(b-a)*i/n); return out; }

// 1) PENG: cup right rim/zirvede LONG yok.
let vals=[...leg(100,72,28),...leg(72,98,28)];
while(vals.length<80) vals.unshift(100+Math.sin(vals.length)*.2);
let s=mk(vals.slice(-80));
let cup=auth.cupPhase(s,'BULL',80);
assert(cup.detected,JSON.stringify(cup));
assert(['RIGHT_RIM','BREAKOUT_EXTENDED'].includes(cup.phase),cup.phase);
let d=auth.evaluate(s,'LONG');
assert.equal(d.veto,true);
assert.equal(d.formation.formationAllow,false);
assert(d.reasons.some(x=>x.includes('LONG_AT_CUP_RIGHT_RIM')||x.includes('LONG_AFTER_CUP_EXTENDED_BREAKOUT')));

// 2) RIVER/TRUMP: handle pullback aşağı sürerken LONG yok.
vals=[...leg(100,72,24),...leg(72,98,24),...leg(98,91,8)];
while(vals.length<80) vals.unshift(100+Math.sin(vals.length)*.15);
s=mk(vals.slice(-80));
cup=auth.cupPhase(s,'BULL',80);
assert(cup.detected);
assert(['HANDLE_PULLBACK','HANDLE_BOTTOM'].includes(cup.phase),cup.phase);
d=auth.evaluate(s,'LONG');
assert.equal(d.veto,true);
assert.equal(d.formation.cupHandlePhaseAllow,false);

// 3) Kulp gerçek dönüşe geçtiyse Fincan/Kulp AL yolu tek başına yeterlidir.
vals=[...leg(100,72,24),...leg(72,98,24),...leg(98,91,6),92.0,93.0,94.0];
while(vals.length<80) vals.unshift(100+Math.sin(vals.length)*.15);
s=mk(vals.slice(-80));
cup=auth.cupPhase(s,'BULL',80);
assert(cup.detected);
assert.equal(cup.phase,'HANDLE_REVERSAL',cup.phase);
d=auth.evaluate(s,'LONG');
assert.equal(d.formation.cupHandlePhaseAllow,true,JSON.stringify(d));
assert.equal(d.formation.formationAllow,true,JSON.stringify(d));
assert.equal(d.veto,false,JSON.stringify(d.reasons));

// 4) FIL: geniş düşüşte sıradan bounce, doğru cup/butterfly AL fazı yoksa LONG değil.
vals=[];
for(let i=0;i<52;i++) vals.push(100+Math.sin(i/3)*.25);
vals.push(...leg(100,76,16));
vals.push(...leg(76,80,8));
s=mk(vals.slice(-80),.25);
d=auth.evaluate(s,'LONG');
assert(['WIDE','EXTREME_WIDE'].includes(d.bb.regime),JSON.stringify(d.bb));
assert.equal(d.formation.formationAllow,false,JSON.stringify(d.formation));
assert.equal(d.veto,true,JSON.stringify(d));
assert(d.reasons.includes('FORMATION_ENTRY_PHASE_NOT_READY'));

// 5) Butterfly oran motoru korunur.
const bullish=[
  {type:'LOW',price:100,index:0},{type:'HIGH',price:120,index:1},
  {type:'LOW',price:104.28,index:2},{type:'HIGH',price:112.14,index:3},
  {type:'LOW',price:94.6,index:4}
];
const bf=form.validateButterflyPoints(bullish);
assert.equal(bf.valid,true); assert.equal(bf.direction,'BULLISH'); assert(bf.score>=85);

// 6) Kesin OR sözleşmesi saf fonksiyonda: cup veya butterfly tek başına AL olabilir.
const macro={higherLow:true,lowerHigh:true,scoreBottom:80,scoreTop:80};
const bb={};
const bullHandle={detected:true,phase:'HANDLE_REVERSAL'};
const none={detected:false,phase:'NONE'};
let fd=auth.formationDecision({side:'LONG',macro,bb,bullCupLarge:bullHandle,bullCupSmall:none,bearCupLarge:none,bearCupSmall:none,butterfly:{strong:false},slope:1});
assert.equal(fd.cupHandlePhaseAllow,true); assert.equal(fd.butterflyPrzAllow,false); assert.equal(fd.formationAllow,true);
fd=auth.formationDecision({side:'LONG',macro,bb,bullCupLarge:none,bullCupSmall:none,bearCupLarge:none,bearCupSmall:none,butterfly:{strong:true,direction:'BULLISH',score:90},slope:0});
assert.equal(fd.cupHandlePhaseAllow,false); assert.equal(fd.butterflyPrzAllow,true); assert.equal(fd.formationAllow,true);
fd=auth.formationDecision({side:'LONG',macro,bb,bullCupLarge:none,bullCupSmall:none,bearCupLarge:none,bearCupSmall:none,butterfly:{strong:false},slope:0});
assert.equal(fd.formationAllow,false);

// 7) Entegrasyon: structure gate gerçek emirden önce.
const ha=fs.readFileSync(path.join(__dirname,'75_st2_heikin_ashi_entry.js'),'utf8');
assert(ha.includes("require('./78_st2_ha_market_structure_authority.js')"));
assert(ha.includes('structureAuthority.evaluate(series, pusu.yon'));
assert(ha.includes('[HA YAPI/FORMASYON VETO]'));
const gateIndex=ha.indexOf('structureAuthority.evaluate(series, pusu.yon');
const openIndex=ha.indexOf('motor.pozisyonAc(sym, pusu.yon');
assert(gateIndex>=0&&openIndex>gateIndex,'authority must run before real open');

console.log('✅ R29.1 market structure authority passed | FORMATION AL = CUP/HANDLE doğru faz OR Butterfly doğru D/PRZ | BB ortam kontrolü | rim/pullback/chase veto');
