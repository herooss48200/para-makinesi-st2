'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v692-'));
delete process.env.AGROS_PREMIER_CALIBRATION_FAST_TEST;
const calibration = require('./84_st2_premier_score_calibration.js');

const cases = [];
for (let i = 0; i < 208; i++) {
  const phase = i % 10;
  const good = phase < 4;
  const medium = phase >= 4 && phase < 6;
  const base = good ? 82 : medium ? 66 : 42;
  const components3 = {
    historicalPf: base,
    historicalExpectancy: base - 3,
    liveForm: good ? 78 : medium ? 55 : 32,
    entryEvolution: base - 5,
    takeoverReplay: base - 7,
    sampleConfidence: 70 + (i % 20)
  };
  const components5 = { ...components3, liveForm: good ? 86 : medium ? 58 : 28 };
  cases.push({
    actualNet: good ? 0.42 : medium ? 0.04 : -0.31,
    historical: {
      n: 3 + (i % 25),
      net: good ? 2 : -1,
      pf: good ? 1.8 : 0.8,
      expectancy: good ? 0.12 : -0.05
    },
    components3,
    components5
  });
}
const cohort = Array.from({ length: 324 }, (_, i) => ({
  components: {
    historicalPf: 25 + (i % 100) * 0.65,
    historicalExpectancy: 30 + (i % 90) * 0.65,
    liveForm: 45 + (i % 30),
    entryEvolution: 40 + (i % 50),
    takeoverReplay: 38 + (i % 55),
    sampleConfidence: 50 + (i % 45)
  }
}));

let progressCalls = 0;
const started = Date.now();
const result = calibration.search({ cases, cohort }, { onProgress: () => { progressCalls++; } });
const elapsedMs = Date.now() - started;

assert.strictEqual(result.diagnostics.engine, 'PRECOMPUTED_SCORE_MATRIX');
assert.strictEqual(result.diagnostics.weights, 1400);
assert.strictEqual(result.diagnostics.policies, 280);
assert.strictEqual(result.diagnostics.modelCandidates, 392000);
assert(result.diagnostics.uniqueEvaluations < result.diagnostics.modelCandidates / 5, 'eşik önbelleği model tekrarlarını azaltmalı');
assert(progressCalls >= 10, 'kalibrasyon ilerlemesi görünür olmalı');
assert(elapsedMs < 20000, `208 kapanış benzeri arama 20 saniyeyi aşmamalı: ${elapsedMs}ms`);
assert(result.optimized, 'optimize model üretilmeli');
assert(result.top.length <= 10, 'yalnız en iyi 10 aday bellekte tutulmalı');

const exactAll = calibration.evaluateRows(cases, cohort, result.optimized.model);
assert.strictEqual(result.optimized.all.n, exactAll.n);
assert.strictEqual(result.optimized.all.net, exactAll.net);
assert.strictEqual(result.optimized.all.pf, exactAll.pf);
assert.strictEqual(result.optimized.all.expectancy, exactAll.expectancy);

const source = fs.readFileSync('84_st2_premier_score_calibration.js', 'utf8');
for (const text of ['PRECOMPUTED_SCORE_MATRIX', 'keepTopCandidate', 'onProgress', 'Tekil değerlendirme']) {
  assert(source.includes(text), `hızlı kalibrasyon kanıtı eksik: ${text}`);
}
const versionSource = fs.readFileSync('versiyon.js', 'utf8');
assert(versionSource.includes('CALIBRATION-READY'), 'kalibrasyon uygulanmadan CALIBRATED etiketi kullanılmamalı');

console.log(`✅ AGROS ST2 v6.9.2 fast Premier calibration passed | 392000 model | ${elapsedMs} ms`);
