const assert = require('assert');
const evidence = require('./63_universal_evidence_engine.js');
const labPremier = require('./62_lab_premier_league.js');

const historicalWeak = { total: 12, winRate: 41.67, profitFactor: 0.8, net: -0.6, expectancy: -0.05 };
const recent5 = { total: 5, winRate: 40, profitFactor: 1.6, net: 0.8, expectancy: 0.16 };
const exit = { positive: true, ownLabExit: true, samples: 5, profitFactor: 1.5, netUsdt: 0.7, beatRate: 60, algorithmId: 'TIME_30M', algorithmLabel: '30 Dakika Exit', ready: true };
const proof = evidence.evaluate({ strategyType: 'LAB_DNA', strategyKey: 'LAB-550', historical: historicalWeak, recent: recent5, exit, live: {} });
assert.strictEqual(proof.historicalPositive, false);
assert.strictEqual(proof.recentPositive, true, 'Son 5 ekonomik sonuç pozitif olmalı');
assert.strictEqual(proof.recentProvisionalEligible, true, 'Güven puanı sert kapı olmadan Son5 provisional kabul edilmeli');
assert.strictEqual(proof.confidenceGateActive, false);
assert.strictEqual(proof.realTradingAuthorized, false);

const candidate = {
  labDnaId: 550, labDnaLabel: 'LAB #550', labKey: 'YON=LONG|BTC=0101|COIN=0110|BB=ORTA_ALT',
  familyDnaId: 77, familyDnaLabel: 'DNA #77', familyKey: 'YON=LONG|BTC=0101|COIN=0110', label: 'Recent5 positive candidate',
  historicalCandidate: false, warmStartCandidate: true, recent5ProvisionalCandidate: true,
  historical: historicalWeak, recent5, exit, evidence: proof,
  forward: { eligible: false, metrics: { closed: 0, profitFactor: 0, net: 0, expectancy: 0 } }
};
const league = labPremier.build({ catalogue: { labChampions: [], evidenceCandidates: [candidate] }, persist: false });
assert.strictEqual(league.premierCount, 1);
assert.strictEqual(league.recent5ProvisionalCount, 1);
assert.strictEqual(league.premier[0].proofLevel, 'RECENT5_PROVISIONAL_PREMIER');
assert.strictEqual(league.policy.confidenceIsRankingOnly, true);
assert.strictEqual(league.policy.championshipOrderAuthority, false);
assert.strictEqual(league.policy.secondOrderCreated, false);
assert.strictEqual(league.premier[0].realTradingAuthorized, false);

const shadow = { sanal: true, executionExitAssignment: { algorithmId: 'ACTUAL', activeForPosition: false } };
labPremier.applyToPosition(shadow, {
  version: labPremier.VERSION, at: new Date().toISOString(), symbol: 'SHADOWUSDT', side: 'LONG',
  familyDnaId: 1, familyDnaLabel: 'DNA #1', familyKey: 'F', labDnaId: 2, labDnaLabel: 'LAB #2', labKey: 'L',
  fullDnaId: 3, fullDnaLabel: 'FULL #3', fullKey: 'X', labLeague: 'CHAMPIONSHIP', proofLevel: 'LEARNING',
  admissionReason: 'shadow', upperLayerIncluded: false, virtualShadowOnly: true, sizeMultiplier: 0,
  historical: null, recent5: null, evidence: null, forward: null, exit: null,
  realTradingAuthorized: false, allowed: true, reasons: []
});
assert.strictEqual(shadow.leagueShadowOnly, true);
assert.strictEqual(shadow.virtualAccountIncluded, false);
assert.strictEqual(labPremier.snapshot(shadow), null, 'Alt lig Premier kasası gözlemi açmamalı');

const text = labPremier.telegram({ league }, 9);
assert.ok(text.includes('tek gölge sanal pozisyon'));
assert.ok(text.includes('işlem kapısı değil'));
console.log('✅ v4.9.2 recent-5 positive admission + shadow learning/Telegram continuity tests passed');
