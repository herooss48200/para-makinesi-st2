'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v637-'));
process.env.AGROS_DATA_DIR = tmp;

const canonical = require('./80_st2_canonical_historical_pool.js');
assert.strictEqual(canonical.COINS.length, 29, 'canonical historical pool must be 29 coins');
assert.strictEqual(canonical.SYMBOLS.length, 29, 'canonical symbol count mismatch');
assert.ok(!canonical.COINS.includes('PEPE'), 'non-canonical PEPE must not block readiness');

function writeTraining(missingSymbol = null) {
  const symbols = {};
  for (const sym of canonical.SYMBOLS) symbols[sym] = { signals: sym === missingSymbol ? 0 : 1 };
  fs.writeFileSync(path.join(tmp, 'st2-historical-training.json'), JSON.stringify({ symbols, profiles: {} }));
}

writeTraining();
const historicalEvents = [];
for (let i = 0; i < 6; i++) {
  historicalEvents.push({
    type: 'HISTORICAL_SIGNAL',
    yon: 'LONG',
    patternCode: 'RRRR',
    context: {
      features: ['BB=ALT', 'BBW=NORMAL', 'ATR=NORMAL', 'TREND20=UP', 'SESSION=ASYA', 'RENKO6=GRRRRR'],
      session: 'ASYA',
      renko6: 'GRRRRR'
    },
    candidates: {
      '0.50': { triggered: true, resolved: true, pnlPct: 0.20 },
      '1.00': { triggered: true, resolved: true, pnlPct: 0.10 }
    }
  });
}
fs.writeFileSync(path.join(tmp, 'st2-historical-training-ledger.jsonl'), historicalEvents.map(JSON.stringify).join('\n') + '\n');

const adaptive = require('./76_st2_adaptive_dna_entry.js');
const completion = adaptive.historicalCompletion();
assert.deepStrictEqual(
  { ready: completion.ready, total: completion.total, complete: completion.complete },
  { ready: 29, total: 29, complete: true },
  '29/29 canonical readiness must open the historical gate'
);
assert.strictEqual(completion.source, 'GLOBAL_CANONICAL_COIN_POOL');

const good = {
  yon: 'LONG',
  girisAnalizi: {
    entryStrategy: 'ST2_RENKO',
    patternKodu: 'RRRR',
    renkoSonTuglaDizisi: 'GRRRRR',
    renkoBb: { zone: 'ALT', widthRegime: 'NORMAL' },
    atrRegime: 'NORMAL',
    trend20: 'UP',
    session: 'ASYA'
  }
};
let gate = adaptive.gateDecision(good, 0.75);
assert.strictEqual(gate.allow, true, 'positive exact historical DNA must become Premier at 29/29');
assert.strictEqual(gate.executionMode, 'PREMIER');
assert.strictEqual(gate.reason, 'HISTORICAL_EXACT_DNA_PREMIER');
assert.strictEqual(gate.brick, 0.50);

writeTraining(canonical.SYMBOLS[0]);
gate = adaptive.gateDecision(good, 0.75);
assert.strictEqual(gate.allow, false, '28/29 must remain fail-closed');
assert.strictEqual(gate.executionMode, 'SHADOW');
assert.strictEqual(gate.reason, 'HISTORICAL_CANONICAL_POOL_INCOMPLETE');
assert.deepStrictEqual(
  { ready: gate.completion.ready, total: gate.completion.total, complete: gate.completion.complete },
  { ready: 28, total: 29, complete: false }
);

const core = require('./72_st2_renko_core.js');
const baseMatch = {
  yon: 'LONG', patternId: 'L01', patternCode: 'RRRR', referenceBrick: { id: 8 },
  bricks: [
    { id: 10, color: 'RED', close: 100, closeTime: 1000 },
    { id: 11, color: 'RED', close: 99, closeTime: 2000 },
    { id: 12, color: 'RED', close: 98, closeTime: 3000 },
    { id: 13, color: 'RED', close: 97, closeTime: 4000 }
  ]
};
const recalculated = {
  ...baseMatch,
  bricks: baseMatch.bricks.map((b, i) => ({ ...b, id: b.id + 100, close: b.close * 1.314159, closeTime: i === 3 ? 4000 : b.closeTime + 77 })),
  referenceBrick: { id: 108 }
};
assert.strictEqual(
  core.patternSignature(baseMatch),
  core.patternSignature(recalculated),
  'same closed source event must survive ATR/price Renko recalculation without a new notification identity'
);
assert.notStrictEqual(
  core.patternSignature(baseMatch),
  core.patternSignature({ ...recalculated, bricks: recalculated.bricks.map((b, i) => ({ ...b, closeTime: i === 3 ? 5000 : b.closeTime })) }),
  'a genuinely new closed source event must get a new identity'
);

const dedupe = require('./81_st2_pusu_notification_dedupe.js');
const now = Date.now();
const map = { old: now - (169 * 60 * 60 * 1000), invalid: 'x' };
for (let i = 0; i < 1100; i++) map[`k${i}`] = now - i;
const localStore = { pusuTelegramBildirimleri: map };
const removed = dedupe.temizle(localStore, { now, ttlHours: 168, maxEntries: 1000 });
assert.ok(removed >= 102, 'TTL and size cleanup must remove stale/excess identities');
assert.ok(Object.keys(localStore.pusuTelegramBildirimleri).length <= 1000, 'notification identity map must stay bounded');
assert.ok(!Object.prototype.hasOwnProperty.call(localStore.pusuTelegramBildirimleri, 'old'));
assert.ok(!Object.prototype.hasOwnProperty.call(localStore.pusuTelegramBildirimleri, 'invalid'));

const entrySource = fs.readFileSync('./72_st2_renko_entry.js', 'utf8');
const reportSource = fs.readFileSync('./2_rapor.js', 'utf8');
const reconciliationSource = fs.readFileSync('./78_st2_global_historical_reconciliation.js', 'utf8');
const adaptiveSource = fs.readFileSync('./76_st2_adaptive_dna_entry.js', 'utf8');
assert.ok(!adaptiveSource.includes('HISTORICAL_30_COIN_TRAINING_INCOMPLETE'), 'legacy 30-coin lock reason must be removed');
assert.ok(entrySource.includes('if (mevcut) return mevcut;'), 'active pusu must not be overwritten/reset every scan');
assert.ok(entrySource.includes('patternSignature: signature'), 'startup dedupe must retain the stable logical signature');
assert.ok(reconciliationSource.includes("require('./80_st2_canonical_historical_pool.js')"), 'global reconciliation must use the shared canonical pool');
assert.ok(reportSource.includes('Pusu karar nedenleri'), 'live report must expose the gate reason distribution');
assert.ok(reportSource.includes('adaptiveDnaIntelligence.shortId'), 'active Shadow proof must show a real DNA hash');

console.log('✅ v6.3.7 canonical 29/29 Premier recovery + stable pusu identity + bounded dedupe + active-pusu preservation passed');
