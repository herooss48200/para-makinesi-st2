'use strict';
const assert = require('assert');
const fs = require('fs');
const adaptive = require('./76_st2_adaptive_dna_entry.js');

const entry = fs.readFileSync('72_st2_renko_entry.js', 'utf8');
const report = fs.readFileSync('2_rapor.js', 'utf8');
const motor = fs.readFileSync('motor.js', 'utf8');

assert.ok(entry.includes('function exactContextHesapla('), 'live exact-context calculator missing');
for (const field of ['rbb', 'rbbw', 'atrRegime', 'trend20']) {
  assert.ok(entry.includes(`store.pusular[sym].${field}`), `pusu snapshot missing ${field}`);
  assert.ok(entry.includes(`${field}: pusu.${field}`), `entry analysis missing ${field}`);
}
assert.ok(entry.includes("[0.20, 0.45, 0.80]"), 'ATR buckets must match historical trainer');
assert.ok(entry.includes("[0.8, 1.6, 3.0]"), 'BBW buckets must match historical trainer');
assert.ok(entry.includes("slopePct > 0.60 ? 'UP' : slopePct < -0.60 ? 'DOWN' : 'YATAY'"), 'TREND20 threshold mismatch');
assert.ok(report.includes('adaptiveDnaEntry.contextComplete(gate.context)'), 'report must count incomplete context as missing');
assert.ok(motor.includes('const kimlikAnalizi = hazirKimlik.girisAnalizi || girisAnalizi || {}'), 'identity-enriched analysis must be preserved');

const complete = adaptive.contextFrom({yon:'SHORT',patternKodu:'GGGG',rbb:'UST',rbbw:'COK_GENIS',renko6:'GGGGGG',atrRegime:'NORMAL',trend20:'UP'});
assert.strictEqual(adaptive.contextComplete(complete), true, 'complete live context rejected');
const incomplete = adaptive.contextFrom({yon:'SHORT',patternKodu:'GGGG',rbb:'UST',rbbw:'COK_GENIS',renko6:'GGGGGG'});
assert.strictEqual(adaptive.contextComplete(incomplete), false, 'missing ATR/TREND20 accepted as exact context');
assert.ok(adaptive.dnaKey(complete).includes('ATR=NORMAL|TREND20=UP'), 'exact key lost runtime regimes');

console.log('✅ v6.3.6 live pusu exact-context binding + strict completeness + identity analysis preservation passed');
