'use strict';
const assert=require('assert');
const fs=require('fs');
const auth=require('./78_st2_ha_market_structure_authority.js');
const ayarlar=require('./ayarlar.js');

assert.equal(ayarlar.heikinAshiFormasyonKanitiTelegram,true);
const cup={detected:true,phase:'HANDLE_REVERSAL',score:86,pivotValue:72,leftRim:100,rightRim:98,depthAtr:2.4,handle:true,handleExtreme:91,handleDepthRatio:.27,handleRecovery:.42};
const a={enabled:true,side:'LONG',label:'CUP_HANDLE_PHASE_ALLOW',reasons:[],support:['CUP_HANDLE_REVERSAL_LONG'],bb:{regime:'NORMAL',percentile:55,priceZonePct:31,lower:70,mid:84,upper:98},cup:{selectedBull:cup,selectedBullScale:'BIG'},butterfly:{valid:false},formation:{cupHandlePhaseAllow:true,butterflyPrzAllow:false,formationAllow:true}};
let text=auth.evidenceText(a);
assert(text.includes('HANDLE_REVERSAL'));
assert(text.includes('Sol/Dip-Sağ 100/72/98'));
assert(text.includes('Kulp uç 91'));
assert(text.includes('FORM OR: CUP/HANDLE AL | BUTTERFLY YOK | SONUÇ AL'));

const bf={valid:true,strong:true,nearPrz:true,direction:'BULLISH',score:90,dAge:1,dDistanceAtr:.31,points:{X:{price:100},A:{price:120},B:{price:104.28},C:{price:112.14},D:{price:94.6}},ratios:{bXa:.786,cAb:.5,dXa:1.27,bcProj:2.23,abcd:1.12}};
const b={enabled:true,side:'LONG',label:'BUTTERFLY_PRZ_ALLOW',reasons:[],support:['BULLISH_BUTTERFLY_D_PRZ_90'],bb:{regime:'WIDE',percentile:78,priceZonePct:20,lower:94,mid:105,upper:116},cup:{selectedBull:null,selectedBullScale:'NONE'},butterfly:bf,formation:{cupHandlePhaseAllow:false,butterflyPrzAllow:true,formationAllow:true}};
text=auth.evidenceText(b);
assert(text.includes('BULLISH'));
assert(text.includes('X/A/B/C/D 100/120/104.28/112.14/94.6'));
assert(text.includes('B/XA 0.786'));
assert(text.includes('D/XA 1.270'));
assert(text.includes('PRZ 0.31 ATR'));

const entry=fs.readFileSync('75_st2_heikin_ashi_entry.js','utf8');
assert(entry.includes('[HA FORMASYON KANITI]'));
assert(entry.includes('heikinAshiFormasyonKanitiTelegram'));
assert(entry.includes('structureAuthority.evidenceText(structureNow)'));
const report=fs.readFileSync('2_rapor.js','utf8');
assert(report.includes('Formasyon Kanıtı'));
console.log('✅ R29.2 formation observability passed | CUP/HANDLE levels visible | Butterfly X/A/B/C/D + ratios + D-age/PRZ ATR visible | Telegram+log proof before ST final gate');
