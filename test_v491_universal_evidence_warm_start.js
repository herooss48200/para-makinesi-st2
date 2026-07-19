const assert = require('assert');
const evidence = require('./63_universal_evidence_engine.js');
const labPremier = require('./62_lab_premier_league.js');

const historical = { total: 6, winRate: 83.33, profitFactor: 2.4, net: 1.8, expectancy: 0.3 };
const exit = { positive: true, ownLabExit: true, samples: 7, profitFactor: 2.1, netUsdt: 1.2, beatRate: 68, algorithmId: 'TIME_30M', algorithmLabel: '30 Dakika Exit', ready: true };
const proof = evidence.evaluate({ strategyType: 'LAB_DNA', strategyKey: 'LAB-A', historical, exit, live: { closed: 0 } });
assert.strictEqual(proof.isolatedEvidence, true);
assert.strictEqual(proof.warmStartEligible, true, '5-9 tarihsel kapanışlı pozitif DNA Warm Start almalı');
assert.strictEqual(proof.realTradingAuthorized, false);

const weak = evidence.evaluate({ strategyType: 'OTHER_STRATEGY', strategyKey: 'OTHER-A', historical: { ...historical, net: -1 }, exit, live: {} });
assert.strictEqual(weak.warmStartEligible, false, 'Negatif tarihsel kanıt Warm Start alamaz');

const candidate = {
  labDnaId: 9001, labDnaLabel: 'LAB #9001', labKey: 'YON=LONG|BTC=0001|COIN=0010|BB=ORTA_ALT',
  familyDnaId: 1, familyDnaLabel: 'DNA #1', familyKey: 'YON=LONG|BTC=0001|COIN=0010', label: 'Warm candidate',
  historicalCandidate: false, warmStartCandidate: true, historical, exit,
  evidence: evidence.evaluate({ strategyType: 'LAB_DNA', strategyKey: 'YON=LONG|BTC=0001|COIN=0010|BB=ORTA_ALT', historical, exit, live: {} }),
  forward: { eligible: false, metrics: { closed: 0, profitFactor: 0, net: 0, expectancy: 0 } }
};
const league = labPremier.build({ catalogue: { labChampions: [], evidenceCandidates: [candidate] }, persist: false });
assert.strictEqual(league.premierCount, 1);
assert.strictEqual(league.warmStartCount, 1);
assert.strictEqual(league.premier[0].proofLevel, 'WARM_START_VERIFIED');
assert.strictEqual(league.premier[0].realTradingAuthorized, false);
assert.strictEqual(league.policy.universalEvidenceEngine, true);
assert.strictEqual(league.policy.secondOrderCreated, false);
console.log('✅ v4.9.1 universal evidence + real Warm Start tests passed');
