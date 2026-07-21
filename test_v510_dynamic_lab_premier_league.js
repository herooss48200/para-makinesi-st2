'use strict';
const assert = require('assert');
const ayarlar = require('./ayarlar.js');
const evidence = require('./63_universal_evidence_engine.js');
const labPremier = require('./62_lab_premier_league.js');

function ev(key, historical, recent5 = {}, exit = {}) {
  return evidence.evaluate({ strategyType: 'LAB_DNA', strategyKey: key, historical, recent: recent5, exit, live: {} });
}
function row(id, key, historical, recent5 = {}, exit = null) {
  return {
    labDnaId: id, labDnaLabel: `LAB #${id}`, labKey: key,
    familyDnaId: id, familyDnaLabel: `DNA #${id}`, familyKey: key.replace(/\|BB=.*/, ''),
    label: key, historical, recent5, exit,
    evidence: ev(key, historical, recent5, exit || {}),
    forward: { eligible: false, metrics: { closed: 0, net: 0, profitFactor: 0, expectancy: 0 } }
  };
}

const historical = row(1, 'YON=LONG|BTC=0011|COIN=0010|BB=ORTA_ALT',
  { total: 28, tp: 25, sl: 3, be: 0, winRate: 89.3, net: 11.45, profitFactor: 5.81, expectancy: 0.4089 });
const recent = row(2, 'YON=SHORT|BTC=0010|COIN=0011|BB=ORTA_UST',
  { total: 20, tp: 8, sl: 12, be: 0, winRate: 40, net: -2, profitFactor: 0.7, expectancy: -0.1 },
  { total: 5, tp: 4, sl: 1, be: 0, winRate: 80, net: 0.8, profitFactor: 2, expectancy: 0.16 });
const reverse = row(3, 'YON=SHORT|BTC=0001|COIN=0001|BB=UST',
  { total: 10, tp: 1, sl: 9, be: 0, winRate: 10, net: -4.31, profitFactor: 0.05, expectancy: -0.431 });
const reverseShadow = row(4, 'YON=LONG|BTC=1110|COIN=0000|BB=ORTA_ALT',
  { total: 6, tp: 1, sl: 4, be: 1, winRate: 20, net: -2.2, profitFactor: 0.2, expectancy: -0.3667 });
const near = row(5, 'YON=LONG|BTC=0101|COIN=0101|BB=ORTA',
  { total: 5, tp: 3, sl: 2, be: 0, winRate: 60, net: 0.2, profitFactor: 0.95, expectancy: 0.04 });
const learning = row(6, 'YON=SHORT|BTC=1010|COIN=0101|BB=ORTA',
  { total: 3, tp: 1, sl: 2, be: 0, winRate: 33.3, net: -1, profitFactor: 0.4, expectancy: -0.333 });

const model = labPremier.build({ catalogue: { allLabRows: [historical, recent, reverse, reverseShadow, near, learning] }, persist: false });
assert.equal(model.historicalPositiveCount, 1);
assert.equal(model.recent5ProvisionalCount, 1);
assert.equal(model.reversePremierCount, 1);
assert.equal(model.premierCount, 3);
assert.equal(model.reverseShadowCount, 1);
assert.equal(model.nearProfitCount, 1);
assert.equal(model.labLeagueCount, 3);
assert.equal(model.historicalPremier[0].proofLevel, 'HISTORICAL_ENTRY_PROVEN_FALLBACK');
assert.equal(model.recent5Premier[0].proofLevel, 'RECENT5_ENTRY_PROVEN_FALLBACK');
assert.equal(model.reversePremier[0].proofLevel, 'REVERSE_PREMIER_TEST');
assert.equal(model.reversePremier[0].executionSide, 'LONG');
assert.equal(model.reversePremier[0].reverseTargetKey, 'YON=LONG|BTC=1110|COIN=1110|BB=UST');
assert.equal(model.reverseShadow[0].proofLevel, 'REVERSE_SHADOW_LEARNING');
assert.equal(model.nearProfit[0].proofLevel, 'NEAR_PROFIT_RACE');
assert.equal(model.policy.dynamicPromotionDemotion, true);
assert.equal(model.policy.learningMemoryReset, false);
assert.equal(model.policy.openPositionExitImmutable, true);
assert.equal(model.policy.newPositionGetsLatestExit, true);

assert.equal(labPremier.reverseLabKey('YON=LONG|BTC=0011|COIN=1010|BB=ORTA_ALT'), 'YON=SHORT|BTC=1100|COIN=0101|BB=ORTA_ALT');

const reversePos = {
  sanal: true, sym: 'REVUSDT', yon: 'LONG', girisAnalizi: { senaryo: 'YESIL_MUM_UST_BAND' },
  blackboxAcilis: {
    symbol: 'REVUSDT', yon: 'LONG',
    strategySignature: { key: model.reversePremier[0].reverseTargetKey, yon: 'LONG', btcBits: '1110', coinBits: '1110', bb: 'UST' }
  }
};
const sourceDecision = {
  version: labPremier.VERSION, at: new Date().toISOString(), symbol: 'REVUSDT', side: 'SHORT',
  sourceSignalSide: 'SHORT', executionSide: 'LONG', reverseExecution: true,
  sourceLabDnaId: reverse.labDnaId, sourceLabDnaLabel: reverse.labDnaLabel, sourceLabKey: reverse.labKey,
  reverseTargetKey: model.reversePremier[0].reverseTargetKey,
  historical: reverse.historical, recent5: reverse.recent5, evidence: reverse.evidence,
  labLeague: 'PREMIER', premierTrack: labPremier.TRACK.REVERSE, proofLevel: 'REVERSE_PREMIER_TEST',
  upperLayerIncluded: true, virtualShadowOnly: false, sizeMultiplier: 1, entryProven: true,
  exitValidated: false, safeExitFallback: true, realTradingAuthorized: false, allowed: true, reasons: []
};
const boundReverse = labPremier.bindReverseExecution(reversePos, sourceDecision, { model });
assert.equal(boundReverse.premierTrack, labPremier.TRACK.REVERSE);
assert.equal(boundReverse.side, 'LONG');
assert.equal(boundReverse.sourceLabDnaLabel, 'LAB #3');
assert.equal(boundReverse.labKey, model.reversePremier[0].reverseTargetKey);
assert.ok(boundReverse.labDnaLabel.startsWith('LAB #'));
const reverseExit = labPremier.frozenExit(boundReverse);
assert.equal(reverseExit.algorithmId, 'ACTUAL');
assert.equal(reverseExit.scope, 'LAB_REVERSE_PREMIER_FALLBACK');

const reverseTier = labPremier.championTier(reverse);
assert.equal(reverseTier.reverseExecution, true);
assert.equal(reverseTier.upperLayerIncluded, true);
const weakTier = labPremier.championTier(learning);
assert.equal(weakTier.upperLayerIncluded, false);

const text = labPremier.compactTelegramFromModel({
  league: {
    ...model,
    historicalPremier: [{ ...model.historicalPremier[0], liveMetrics: labPremier.metrics({ closed: 3, tp: 2, sl: 1, net: 0.6, grossProfit: 1, grossLoss: 0.4 }), progress: { icon: '⬆️' }, currentExitLabel: 'Mevcut Kademe Sistemi', pendingExitChange: false, exitChangeCount: 0 }],
    recent5Premier: [], reversePremier: [], premier: []
  },
  aggregate: labPremier.metrics({ opened: 3, active: 0, closed: 3, tp: 2, sl: 1, net: 0.6, grossProfit: 1, grossLoss: 0.4 }),
  accounting: { opened: 3, activeScientific: 0, closedScientific: 3, activeGap: 0, closedGap: 0, equation: '3 = 3 + 0 + 0 + 0', difference: 0, reconciled: true },
  trackMetrics: { historical: labPremier.metrics(), recent5: labPremier.metrics(), reverse: labPremier.metrics() }
});
assert.ok(text.includes('Tarihsel Pozitif 1'));
assert.ok(text.includes('Son-5 Geçici 1'));
assert.ok(text.includes('Ters Premier 1'));
assert.ok(text.includes('⬆️'));
assert.ok(text.includes("Açık pozisyon Exit'i değişmez"));
assert.ok(text.includes('GAP sonuçları dahil edilmez'));

console.log('✅ v5.1.0 Dynamic LAB Premier League passed | historical + recent5 + reverse Premier, reverse shadow, near-profit league and visible Exit/progress');
