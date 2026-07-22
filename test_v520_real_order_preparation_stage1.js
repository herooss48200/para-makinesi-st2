'use strict';

const assert = require('assert');
const {
  summarize,
  simulateStopRows,
  buildBeAnalysis,
  buildPremierAnalysis
} = require('./67_real_order_preparation_intelligence');

function replay(actualNetUsdt, maePct, mfePct, result = 'SL', valueUsdt = 50, commissionUsdt = 0.05) {
  return {
    input: {
      actualNetUsdt,
      maePct,
      mfePct,
      result,
      valueUsdt,
      commissionUsdt,
      side: 'LONG',
      signatureKey: 'YON=LONG|BTC=0011|COIN=0010|BB=ORTA_ALT'
    },
    results: []
  };
}

const metrics = summarize([1, -0.5, 0]);
assert.strictEqual(metrics.samples, 3);
assert.strictEqual(metrics.netUsdt, 0.5);
assert.strictEqual(metrics.wins, 1);
assert.strictEqual(metrics.losses, 1);

const stop = simulateStopRows([
  replay(-0.8, -1.7, 0.1),
  replay(0.4, -0.5, 1.0, 'TP')
], 1.2);
assert.strictEqual(stop.status, 'HISTORICAL_MAE_SIMULATION');
assert.strictEqual(stop.newlyStopped, 1);
assert(stop.metrics.netUsdt > -0.8, 'Tighter stop should reduce the oversized loss in fixture');

const wide = simulateStopRows([replay(-0.8, -1.7, 0.1)], 1.8);
assert.strictEqual(wide.status, 'FORWARD_OBSERVATION_REQUIRED');
assert.strictEqual(wide.metrics, null);

const be = buildBeAnalysis([
  replay(-0.05, -0.2, 0.2, 'BE'),
  replay(-0.05, -0.2, 0.05, 'BE')
]);
assert.strictEqual(be.beTrades, 2);
assert.strictEqual(be.recommendation.action, 'SHADOW_TEST');
assert.strictEqual(be.recommendation.bePlusPct, 0.12);

const premier = buildPremierAnalysis([
  { proofLevel: 'RECENT5_PROVISIONAL_PREMIER', outcome: 'SL', net: -1 },
  { proofLevel: 'RECENT5_PROVISIONAL_PREMIER', outcome: 'TP', net: 0.2 },
  ...Array.from({ length: 8 }, () => ({ proofLevel: 'RECENT5_PROVISIONAL_PREMIER', outcome: 'BE', net: 0 }))
]);
assert.strictEqual(premier.recent5Decision, 'KEEP_AS_SEPARATE_SHADOW_POOL');

console.log('✅ v5.2.0 real-order preparation Stage 1 tests passed');
