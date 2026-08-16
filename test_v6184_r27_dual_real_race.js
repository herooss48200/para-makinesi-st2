'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-r27-dual-'));
process.env.AGROS_DATA_DIR = tmp;
process.env.AGROS_REAL_ORDER_LOCK_FILE = path.join(tmp, 'r27-test.pidlock');

const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const motor = require('./motor.js');
const ha = require('./75_st2_heikin_ashi_entry.js');
const exec = require('./85_st2_real_order_execution.js');

assert.equal(ayarlar.entryStrategyMode, 'ST2_DUAL_REAL');
assert.equal(ayarlar.gercekEmirMaxAktifPozisyon, 20);
assert.equal(ayarlar.renkoGercekMaxAktifPozisyon, 10);
assert.equal(ayarlar.heikinAshiGercekMaxAktifPozisyon, 10);
assert.equal(ayarlar.heikinAshiMaxPusuBeklemeMum, 3);
assert.equal(ayarlar.heikinAshiBandYakinlikYuzdesi, 0.5);

// HA pusu: üst banda yaklaşan/geçen YEŞİL HA -> SHORT.
const shortSeries = [];
for (let i=0;i<19;i++) shortSeries.push({open:100,close:100,high:100.1,low:99.9,color:'DOJI',closeTime:i+1});
shortSeries.push({open:100,close:100.5,high:101,low:99.9,color:'GREEN',closeTime:20});
const shortSetup = ha.sourceSetup(shortSeries);
assert(shortSetup && shortSetup.side === 'SHORT');

// LONG aynası: alt banda yaklaşan/geçen KIRMIZI HA.
const longSeries = [];
for (let i=0;i<19;i++) longSeries.push({open:100,close:100,high:100.1,low:99.9,color:'DOJI',closeTime:i+1});
longSeries.push({open:100,close:99.5,high:100.1,low:99,color:'RED',closeTime:20});
const longSetup = ha.sourceSetup(longSeries);
assert(longSetup && longSetup.side === 'LONG');

// Teyit gövdesi: iğne değil open/close gövde sınırı.
const redConfirm = {open:101,close:99,high:102,low:97,closeTime:30,color:'RED'};
assert.equal(ha.confirmationBodyBoundary(redConfirm,'SHORT'), 99);
assert.equal(ha.livePriceCrossed('SHORT',98.99,99), true);
assert.equal(ha.livePriceCrossed('SHORT',99.01,99), false);
const greenConfirm = {open:99,close:101,high:103,low:98,closeTime:30,color:'GREEN'};
assert.equal(ha.confirmationBodyBoundary(greenConfirm,'LONG'), 101);
assert.equal(ha.livePriceCrossed('LONG',101.01,101), true);
assert.equal(ha.livePriceCrossed('LONG',100.99,101), false);

// Üç kapanmış mum içinde teyit bulunabilir; dördüncü kapanış pusu ömrünü aşar.
const conf = ha.confirmationFor({sourceCloseTime:20,yon:'SHORT'}, [
  {closeTime:20,color:'GREEN'}, {closeTime:21,color:'GREEN'}, {closeTime:22,color:'RED'}, {closeTime:23,color:'GREEN'}
]);
assert.equal(conf.max,3); assert.equal(conf.afterCount,3); assert.equal(conf.confirmation.closeTime,22);

// Lane slotları birbirinden bağımsız 10 + 10, toplam execution limiti 20.
h.state.aktifPozisyonlar = [
  ...Array.from({length:10},(_,i)=>({sym:`R${i}`,yon:'LONG',sanal:false,entryStrategy:'ST2_RENKO',strategyLane:'RENKO'})),
  ...Array.from({length:10},(_,i)=>({sym:`H${i}`,yon:'LONG',sanal:false,entryStrategy:'ST2_HEIKIN_ASHI',strategyLane:'HEIKIN_ASHI'}))
];
assert.equal(motor.aktifGercekPozisyonSayisiLane('RENKO'),10);
assert.equal(motor.aktifGercekPozisyonSayisiLane('HEIKIN_ASHI'),10);
assert.equal(motor.strategyLaneLimit('RENKO'),10);
assert.equal(motor.strategyLaneLimit('HEIKIN_ASHI'),10);

// Sayaç/PnL kalıcı execution state'ten lane bazlı hesaplanır.
const baseline = exec.ensureStrategyRaceBaseline();
const t = new Date(Number(baseline.startedAtMs)+1000).toISOString();
exec.writeState({
  version:'TEST', updatedAt:t, globalBlock:null, closed:[], records:{
    R1:{fingerprint:'R1',status:'CLOSED',openedAt:t,closedAt:t,positionSnapshot:{entryStrategy:'ST2_RENKO',strategyLane:'RENKO'},netPnl:1.25,totalCommission:.05,realizedPnl:1.30},
    H1:{fingerprint:'H1',status:'CLOSED',openedAt:t,closedAt:t,positionSnapshot:{entryStrategy:'ST2_HEIKIN_ASHI',strategyLane:'HEIKIN_ASHI'},netPnl:-.40,totalCommission:.04,realizedPnl:-.36}
  }
});
const race = exec.strategyRaceSummary();
assert.equal(race.lanes.RENKO.opened,1); assert.equal(race.lanes.RENKO.closed,1); assert.equal(race.lanes.RENKO.wins,1); assert.equal(race.lanes.RENKO.netPnl,1.25);
assert.equal(race.lanes.HEIKIN_ASHI.opened,1); assert.equal(race.lanes.HEIKIN_ASHI.closed,1); assert.equal(race.lanes.HEIKIN_ASHI.losses,1); assert.equal(race.lanes.HEIKIN_ASHI.netPnl,-.40);

const posSrc = fs.readFileSync(path.join(__dirname,'4_pozisyon.js'),'utf8');
assert(posSrc.includes("strategyLane(pos) === 'RENKO'"), 'HA kapanışları Renko N5/Entry learninge karışmamalı');
const execSrc = fs.readFileSync(path.join(__dirname,'85_st2_real_order_execution.js'),'utf8');
assert(execSrc.includes('BINANCE_SEMBOL_POZISYONU_ZATEN_ACIK'), 'aynı sembolde ikinci gerçek pozisyon fail-closed kalmalı');

console.log('✅ R27 dual real race passed | RENKO 10 + HA 10 | independent HA pusu/3-candle confirmation/body break | persistent lane counters | same-symbol collision fail-closed');
fs.rmSync(tmp,{recursive:true,force:true});
