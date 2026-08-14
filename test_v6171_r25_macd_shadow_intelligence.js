'use strict';
const assert=require('assert');
const fs=require('fs');
const ayarlar=require('./ayarlar.js');
const macd=require('./97_st2_macd_shadow_intelligence.js');

function rows(hist){ return hist.map((h,i)=>({macd:h+0.01,signal:0.01,histogram:h,close:100+i})); }
function candles(values,tfMs=60000){ return values.map((close,i)=>({open:close,high:close,low:close,close,closeTime:(i+1)*tfMs})); }

assert.strictEqual(ayarlar.macdShadowAktif,true);
assert.strictEqual(ayarlar.macdShadowEmirYetkisi,false);
assert.strictEqual(ayarlar.macdShadowStopYetkisi,false);
assert.strictEqual(ayarlar.macdShadowDecayArdisikCubuk,2);
assert.strictEqual(ayarlar.macdShadowKarKorumaEsikYuzde,1.50);

let c=macd.classify('LONG',rows([0.10,0.20,0.30,0.25,0.20]));
assert.strictEqual(c.state,'DECAY'); assert.strictEqual(c.decay,true);
c=macd.classify('SHORT',rows([-0.10,-0.20,-0.30,-0.25,-0.20]));
assert.strictEqual(c.state,'DECAY'); assert.strictEqual(c.decay,true);
c=macd.classify('LONG',rows([-0.60,-0.50,-0.40,-0.30,-0.20]));
assert.strictEqual(c.state,'EARLY_RECOVERY');

const premierCohort=macd.deriveEntryCohort({state:'STRONG'},{state:'OPPOSED'});
assert.strictEqual(premierCohort.name,'MACD_EARLY_REVERSAL_PREMIER_SHADOW');
assert.strictEqual(premierCohort.premierCandidate,true);
assert.strictEqual(premierCohort.blocksEntry,false);
assert.strictEqual(macd.deriveEntryCohort({state:'STRONG'},{state:'EARLY_RECOVERY'}).name,'MACD_EARLY_REVERSAL_PREMIER_SHADOW');
assert.strictEqual(macd.deriveEntryCohort({state:'STRONG'},{state:'STRONG'}).name,'MACD_FULL_ALIGNMENT_SHADOW');
assert.strictEqual(macd.profitShadowDecision(1.85,'DECAY').protectionCandidate,false,'DECAY tek başına koruma adayı olmamalı');
assert.strictEqual(macd.profitShadowDecision(1.85,'DECAY').decayObservation,true);
assert.strictEqual(macd.profitShadowDecision(1.85,'OPPOSED').protectionCandidate,true);
assert.strictEqual(macd.profitShadowDecision(1.85,'REVERSAL_WARNING').protectionCandidate,true);

assert.strictEqual(macd.suggestedProtectedProfit(1.49),null);
assert.strictEqual(macd.suggestedProtectedProfit(1.50),1.00);
assert.strictEqual(macd.suggestedProtectedProfit(1.99),1.00);
assert.strictEqual(macd.suggestedProtectedProfit(2.00),1.50);
assert.strictEqual(macd.suggestedProtectedProfit(2.50),2.00);

const one=[]; let p=100;
for(let i=0;i<100;i++){ p += i<70?0.10:(i<85?0.03:-0.02); one.push(p); }
const fifteen=[]; p=100;
for(let i=0;i<100;i++){ p += i<75?0.25:(i<90?0.05:-0.08); fifteen.push(p); }
const state={sniperMumlar:{TESTUSDT:candles(one,60000)},yerelPusuHafizasi:{TESTUSDT:candles(fifteen,900000)}};
const snap=macd.entrySnapshot('TESTUSDT','LONG',Date.now()+999999999,state);
assert.strictEqual(snap.shadowOnly,true); assert.strictEqual(snap.blocksEntry,false); assert.strictEqual(snap.changesStop,false);
assert.strictEqual(snap.oneMinute.ready,true); assert.strictEqual(snap.fifteenMinute.ready,true);

const entrySrc=fs.readFileSync('./72_st2_renko_entry.js','utf8');
const posSrc=fs.readFileSync('./4_pozisyon.js','utf8');
const legacySrc=fs.readFileSync('./89_st2_renko_entry_confirmation_shadow_lab.js','utf8');
assert(entrySrc.includes('macdShadowAtEntry'),'real/primary entry snapshot missing');
assert(posSrc.includes('macdShadow.updatePosition'),'open-position MACD shadow tracking missing');
assert(posSrc.includes('macdShadow.telegramText(pos)'),'close report MACD shadow summary missing');
assert(legacySrc.includes('macdShadowAtEntry: macdShadow.entrySnapshot'),'0.25/0.50/0.75T delayed shadow MACD snapshot missing');
assert(legacySrc.includes('macdShadowAtEntry: clone(candidate.lifecycle?.macdShadowAtEntry)'),'delayed shadow close result must retain MACD entry snapshot');

// Gercek updater da SHADOW kalmali: profit-decay sinyali uretse bile stopa dokunamaz.
const decayOne=[]; p=100;
for(let i=0;i<100;i++){ p += i<50?0.02:(i<98?0.20:0.12); decayOne.push(p); }
const decayState={sniperMumlar:{TESTUSDT:candles(decayOne,60000)},yerelPusuHafizasi:{TESTUSDT:candles(fifteen,900000)}};
const pos={sym:'TESTUSDT',yon:'LONG',girisFiyati:100,sl:97.5,maxKarYuzde:1.85};
const ledgerBefore=ayarlar.macdShadowLedgerAktif; ayarlar.macdShadowLedgerAktif=false;
const tick=macd.updatePosition(pos,101.20,Date.now()+999999999,decayState);
ayarlar.macdShadowLedgerAktif=ledgerBefore;
assert.strictEqual(tick.event.oneMinute.state,'DECAY');
assert.strictEqual(tick.event.type,'MACD_SHADOW_DECAY_OBSERVATION');
assert.strictEqual(tick.event.suggestedProtectedProfitPct,null);
assert.strictEqual(pos.sl,97.5,'MACD shadow gercek/sanal stopu degistirmemeli');
assert.strictEqual(tick.event.changesStop,false);

assert(!fs.readFileSync('./97_st2_macd_shadow_intelligence.js','utf8').includes('futuresCandles'),'MACD shadow must not open a new market-data endpoint');

console.log('✅ R25.1 MACD replay shadow passed | 1m STRONG + 15m OPPOSED/EARLY_RECOVERY cohort | DECAY observe-only | OPPOSED/REVERSAL protection candidate | no entry/stop authority');
