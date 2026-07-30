'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v682-lifecycle-'));
process.env.AGROS_DATA_DIR = tmp;
const league = require('./62_lab_premier_league.js');
const ayarlar = require('./ayarlar.js');
assert.strictEqual(league.VERSION, 'v6.8.2-LAB-LIFECYCLE-PERSISTENT-TRANSITIONS');
assert.strictEqual(ayarlar.labCanliLigMinKapanis, 5);

const labKey = 'YON=LONG|BTC=1000|COIN=1001|BB=UST';
function trade(id, net, outcome, key = labKey, track = league.TRACK.SHADOW) {
  return { tradeId: id, labKey: key, premierTrack: track, reverseExecution: false, net, commission: 0.1, outcome, closedAt: new Date(Date.now() + Number(String(id).replace(/\D/g, '') || 0)).toISOString() };
}
function add(state, row) {
  state.lastTrades = [row, ...(state.lastTrades || [])].slice(0, 150);
  return league.updateLiveLeagueState(state, row);
}

// Shadow -> Premier gerçek geçişi yalnız N5 tamamlandığında bir kez yazılır.
let state = league.readState();
const positive = [trade('P1', 1.2, 'TP'), trade('P2', 0.8, 'TP'), trade('P3', -0.3, 'SL'), trade('P4', 0.55, 'TP'), trade('P5', 0.25, 'TP')];
let transition = null;
for (const row of positive) transition = add(state, row).transition || transition;
league.writeState(state);
assert(transition, 'N5 pozitif ekonomi gerçek terfi üretmeli');
assert.strictEqual(transition.type, 'SHADOW_TO_PREMIER');
let review = league.liveLeagueReview(labKey);
assert.strictEqual(review.complete, true);
assert.strictEqual(review.currentLeague, 'PREMIER');
assert.strictEqual(review.promoted, true);
assert(review.metrics.net > 0 && review.metrics.profitFactor > 1 && review.metrics.expectancy > 0);
assert.strictEqual(league.readState().leagueTransitions.filter(x => x.labKey === labKey).length, 1, 'aynı terfi tekrar yazılmamalı');

// 150 başka LAB kapanışı hedef LAB'ın kalıcı son-5 penceresini silemez.
state = league.readState();
for (let i = 0; i < 150; i++) {
  const otherKey = `YON=SHORT|BTC=${String(i % 16).padStart(4, '0')}|COIN=${String((i + 3) % 16).padStart(4, '0')}|BB=ALT_${i}`;
  add(state, trade(`O${i}`, 0.1, 'TP', otherKey));
}
league.writeState(state);
review = league.liveLeagueReview(labKey);
assert.strictEqual(review.metrics.closed, 5, 'diğer LAB işlemleri hedef LAB son-5 verisini silemez');
assert.strictEqual(review.currentLeague, 'PREMIER');

// Premier -> Shadow gerçek düşüşü, hedef LAB'ın kendi yeni N5 kayıplarıyla oluşur.
state = league.readState(); transition = null;
for (let i = 1; i <= 5; i++) transition = add(state, trade(`N${i}`, -1, 'SL', labKey, league.TRACK.LIVE)).transition || transition;
league.writeState(state);
assert(transition, 'N5 negatif ekonomi gerçek düşüş üretmeli');
assert.strictEqual(transition.type, 'PREMIER_TO_SHADOW');
review = league.liveLeagueReview(labKey);
assert.strictEqual(review.currentLeague, 'SHADOW');
assert.strictEqual(review.demoted, true);
assert.strictEqual(review.metrics.closed, 5);
assert.strictEqual(review.metrics.net, -5);
const persisted = league.readState();
const targetTransitions = persisted.leagueTransitions.filter(x => x.labKey === labKey);
assert.deepStrictEqual(targetTransitions.map(x => x.type), ['PREMIER_TO_SHADOW', 'SHADOW_TO_PREMIER']);
assert.strictEqual(persisted.liveLeagueByLab[labKey].promotionCount, 1);
assert.strictEqual(persisted.liveLeagueByLab[labKey].demotionCount, 1);

// Pozitif netli açık BE, TP sayılmaz.
state = league.readState();
const beKey = 'YON=SHORT|BTC=0011|COIN=1100|BB=ORTA';
for (let i = 1; i <= 5; i++) add(state, trade(`B${i}`, i === 1 ? 0.01 : 0.2, i === 1 ? 'BE' : 'TP', beKey));
league.writeState(state);
const beReview = league.liveLeagueReview(beKey);
assert.strictEqual(beReview.metrics.be, 1);
assert.strictEqual(beReview.metrics.tp, 4);
assert.strictEqual(beReview.metrics.closed, beReview.metrics.tp + beReview.metrics.sl + beReview.metrics.be);

const positiveTier = league.tierWithLiveReview(
  { league: 'DEVELOPMENT', premierTrack: league.TRACK.LAB, upperLayerIncluded: false },
  { labKey, exit: null },
  { complete: true, promoted: true, demoted: false, thresholds: { minClosed: 5 }, metrics: beReview.metrics }
);
assert.strictEqual(positiveTier.premierTrack, league.TRACK.LIVE);
const negativeTier = league.tierWithLiveReview(
  { league: 'PREMIER', premierTrack: league.TRACK.HISTORICAL, upperLayerIncluded: true },
  { labKey, exit: null },
  { complete: true, promoted: false, demoted: true, thresholds: { minClosed: 5 }, metrics: review.metrics }
);
assert.strictEqual(negativeTier.premierTrack, league.TRACK.SHADOW);

const motor = fs.readFileSync('./motor.js', 'utf8');
assert(motor.includes('const finalPremier = !exactLiveDemoted && !labLiveDemoted'), 'düşüş veto önceliği korunmalı');
const operation = fs.readFileSync('./69_operation_intelligence_dashboard.js', 'utf8');
assert(operation.includes('Bu oturum terfi'), 'gerçek oturum terfisi ayrı raporlanmalı');
assert(operation.includes('Canlı koşul Premier'), 'mevcut sınıflandırma gerçek geçişten ayrılmalı');
assert(operation.includes('GERÇEK LİG HAREKETLERİ'), 'geçiş defteri Telegram görünürlüğü eksik');
console.log('✅ v6.8.2 persistent LAB lifecycle + true transitions + per-LAB N5 passed');
