'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v691-'));
process.env.AGROS_PREMIER_CALIBRATION_FAST_TEST = '1';
const quality = require('./83_st2_premier_quality_score.js');
const calibration = require('./84_st2_premier_score_calibration.js');

const custom = {
  schema: 1, status: 'ACTIVE', generatedAt: '2026-07-31T00:00:00.000Z', source: 'TEST', fingerprint: 'abc',
  weights: { historicalPf: 25, historicalExpectancy: 20, liveForm: 15, entryEvolution: 15, takeoverReplay: 10, sampleConfidence: 15 },
  policy: { minScore: 62, maxDynamic: 100, relativeQuantile: 0.65, minSample: 4, liveWindow: 5 }
};
fs.writeFileSync(quality.CALIBRATION_FILE, JSON.stringify(custom));
const active = quality.activePolicy();
assert.strictEqual(active.source, 'CALIBRATED');
assert.deepStrictEqual(active.weights, custom.weights);
assert.strictEqual(active.liveWindow, 5);
assert.strictEqual(active.maxDynamic, 100);
assert.strictEqual(Object.values(active.weights).reduce((a, b) => a + b, 0), 100);

const strong = quality.evaluate({
  context: { yon: 'LONG', pattern: 'RRRR', rbb: 'ALT', rbbw: 'NORMAL', renko6: 'RRRGRR', atr: 'NORMAL', trend20: 'UP' },
  historicalPoolComplete: true,
  historical: { n: 20, pf: 2.2, expectancy: 0.2, net: 4, wins: 14, losses: 6 },
  live: { n: 5, pf: 1.8, expectancy: 0.12, net: 0.6, wins: 3, losses: 2 },
  entry: { n: 10, pf: 1.6, expectancy: 0.1, net: 1, wins: 6, losses: 4 },
  takeover: { n: 8, pf: 1.5, expectancy: 0.08, net: 0.64, wins: 5, losses: 3, mfeCapture: 70, avgGiveback: 0.08 },
  cohortScores: [45, 50, 55, 60, 65, 70, 75]
});
assert.strictEqual(strong.policySource, 'CALIBRATED');
assert.strictEqual(strong.liveWindow, 5);
assert(quality.weightedComponentText(strong).includes('PF'));
assert(quality.metricText(strong.evidence.live, { prefix: 'Son 5' }).includes('✅'));

const cases = [];
for (let i = 0; i < 90; i++) {
  const good = i % 5 < 2;
  const medium = i % 5 === 2;
  const high = good ? 88 : medium ? 68 : 42;
  const live3 = good ? 82 : medium ? 58 : 35;
  const live5 = good ? 90 : medium ? 60 : 30;
  const components3 = { historicalPf: high, historicalExpectancy: high - 2, liveForm: live3, entryEvolution: high - 4, takeoverReplay: high - 6, sampleConfidence: 75 };
  const components5 = { ...components3, liveForm: live5 };
  cases.push({
    actualNet: good ? 0.45 : medium ? 0.03 : -0.28,
    historical: { n: 12, net: good ? 2 : -1, pf: good ? 2 : 0.7, expectancy: good ? 0.15 : -0.08 },
    components3, components5
  });
}
const cohort = Array.from({ length: 80 }, (_, i) => ({
  components: { historicalPf: 30 + i * 0.7, historicalExpectancy: 32 + i * 0.65, liveForm: 50, entryEvolution: 50, takeoverReplay: 50, sampleConfidence: 60 }
}));
const search = calibration.search({ cases, cohort });
assert(search.optimized, 'optimize model üretilmeli');
assert(search.optimized.validation.pf > 1, 'validation PF pozitif olmalı');
assert(search.optimized.validation.expectancy > 0, 'validation expectancy pozitif olmalı');
assert(search.optimized.all.selectedRatio <= 0.55, 'Premier seçimi aşırı geniş olmamalı');

const source = fs.readFileSync('72_st2_renko_entry.js', 'utf8');
for (const text of ['Premier nedeni:', 'weightedComponentText', "prefix: 'Son 5'", 'Model ${model}']) assert(source.includes(text), `pusu açıklaması eksik: ${text}`);
const adaptiveSource = fs.readFileSync('76_st2_adaptive_dna_entry.js', 'utf8');
assert(adaptiveSource.includes('premierScorePolicySource'), 'kalibrasyon kaynağı rapora bağlanmalı');
assert(adaptiveSource.includes('liveLast5'), 'son 5 canlı kanıtı pusuya bağlanmalı');

console.log('✅ AGROS ST2 v6.9.1 chronological Premier calibration + fail-closed policy + explainable pusu passed');
