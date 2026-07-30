
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v673-'));
process.env.AGROS_DATA_DIR = tmp;

const league = require('./62_lab_premier_league.js');
const ayarlar = require('./ayarlar.js');
assert.strictEqual(league.VERSION, 'v6.7.3-LAB-LIVE-PROMOTION-DEMOTION');
assert.strictEqual(ayarlar.labCanliLigMinKapanis, 5);

const labKey = 'YON=LONG|BTC=1000|COIN=1001|BB=UST';
function trade(i, net, outcome) {
  return { tradeId: `T${i}`, labKey, premierTrack: league.TRACK.SHADOW, reverseExecution: false, net, commission: 0.1, outcome };
}

// N5 pozitif ekonomi: tarihsel negatif olsa bile canlı LAB terfisi üretilir.
let state = league.readState();
state.lastTrades = [
  trade(5, 1.20, 'TP'), trade(4, 0.80, 'TP'), trade(3, -0.30, 'SL'), trade(2, 0.55, 'TP'), trade(1, 0.25, 'TP')
];
league.writeState(state);
let review = league.liveLeagueReview(labKey);
assert.strictEqual(review.complete, true);
assert.strictEqual(review.promoted, true);
assert.strictEqual(review.demoted, false);
assert(review.metrics.net > 0 && review.metrics.profitFactor > 1 && review.metrics.expectancy > 0);

// N5 negatif ekonomi: sürekli kaybeden LAB sonraki işlemde Shadow'a düşer.
state = league.readState();
state.lastTrades = [
  trade(10, -0.70, 'SL'), trade(9, -0.45, 'SL'), trade(8, 0.10, 'TP'), trade(7, -0.25, 'SL'), trade(6, -0.35, 'SL')
];
league.writeState(state);
review = league.liveLeagueReview(labKey);
assert.strictEqual(review.complete, true);
assert.strictEqual(review.promoted, false);
assert.strictEqual(review.demoted, true);
assert.strictEqual(review.reason, 'LAB_LIVE_N5_DEMOTED_TO_SHADOW');

// Henüz N5 oluşmadıysa ne terfi ne düşüş vardır.
state = league.readState();
state.lastTrades = [trade(3, 1, 'TP'), trade(2, -0.2, 'SL'), trade(1, 0.4, 'TP')];
league.writeState(state);
review = league.liveLeagueReview(labKey);
assert.strictEqual(review.complete, false);
assert.strictEqual(review.promoted, false);
assert.strictEqual(review.demoted, false);


const positiveTier = league.tierWithLiveReview(
  { league: 'DEVELOPMENT', premierTrack: league.TRACK.LAB, upperLayerIncluded: false },
  { labKey, exit: null },
  { ...review, complete: true, promoted: true, demoted: false, thresholds: { minClosed: 5 } }
);
assert.strictEqual(positiveTier.upperLayerIncluded, true);
assert.strictEqual(positiveTier.premierTrack, league.TRACK.LIVE);
assert.strictEqual(positiveTier.proofLevel, 'LAB_LIVE_N5_PROMOTED_PREMIER');

const negativeTier = league.tierWithLiveReview(
  { league: 'PREMIER', premierTrack: league.TRACK.HISTORICAL, upperLayerIncluded: true },
  { labKey, exit: null },
  { ...review, complete: true, promoted: false, demoted: true, thresholds: { minClosed: 5 } }
);
assert.strictEqual(negativeTier.upperLayerIncluded, false);
assert.strictEqual(negativeTier.premierTrack, league.TRACK.SHADOW);
assert.strictEqual(negativeTier.proofLevel, 'LAB_LIVE_N5_DEMOTED_TO_SHADOW');

// Muhasebe entegrasyonu: yalnız terfi sonrasındaki yeni kapanış Premier kasasına girer.
const promotedDecision = {
  labDnaId: 34, labDnaLabel: 'LAB #34', labKey, familyDnaLabel: 'DNA #318',
  labLeague: 'PREMIER', premierTrack: league.TRACK.LIVE, proofLevel: 'LAB_LIVE_N5_PROMOTED_PREMIER',
  upperLayerIncluded: true, observationEligible: true, virtualShadowOnly: false,
  exitValidated: false, exit: null, sourceSignalSide: 'LONG'
};
const promotedPos = { sanal: true, sanalOrderId: 'PROMOTED-1', sym: 'UBUSDT', yon: 'LONG', girisFiyati: 1, miktar: 100 };
league.applyToPosition(promotedPos, promotedDecision);
league.snapshot(promotedPos);
league.close(promotedPos, { net: 1.5, commission: 0.1, outcome: 'TP' });
const afterPromotion = league.readState();
assert.strictEqual(afterPromotion.aggregate.closed, 1, 'yalnız terfi sonrası kapanış Premier kasasına yazılmalı');
assert.strictEqual(Number(afterPromotion.aggregate.net.toFixed(4)), 1.5, 'eski Shadow sonuçları Premier kasasına taşınmamalı');

// Yeni Premier/Shadow bucket'ları ayrıdır; eski Shadow sonuçları geriye dönük Premier kasasına taşınmaz.
assert.notStrictEqual(league.TRACK.LIVE, league.TRACK.SHADOW);
const source = fs.readFileSync('./62_lab_premier_league.js', 'utf8');
assert(source.includes("[TRACK.HISTORICAL, TRACK.RENKO, TRACK.LIVE]"), 'canlı terfi ana Premier muhasebesine dahil değil');
assert(source.includes("`${decision.premierTrack}|${decision.labKey || 'LAB-YOK'}`"), 'track bazlı ayrı bucket anahtarı eksik');

const motor = fs.readFileSync('./motor.js', 'utf8');
assert(motor.includes('LAB_LIVE_N5_PROMOTED_PREMIER'), 'canlı terfi final giriş kapısına bağlı değil');
assert(motor.includes('LAB_LIVE_N5_DEMOTED_TO_SHADOW'), 'canlı düşüş final giriş kapısına bağlı değil');
assert(motor.includes('exactLiveDemoted'), 'exact N3 düşüşü önceliği korunmalı');
assert(motor.includes('const finalPremier = !exactLiveDemoted && !labLiveDemoted'), 'düşüş veto önceliği eksik');

const operation = fs.readFileSync('./69_operation_intelligence_dashboard.js', 'utf8');
assert(operation.includes('Canlı yükselen'), 'canlı terfi raporu eksik');
assert(operation.includes('Canlı düşen'), 'canlı düşüş raporu eksik');

console.log('✅ v6.7.3 live LAB promotion + demotion + isolated accounting passed');
