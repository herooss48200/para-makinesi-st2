const assert = require('assert');
const league = require('./46_dna_league_engine.js');

const full = 'YON=SHORT|BTC=1000|COIN=0000|BTC_TF=5M|COIN_TF=-|BB=ORTA_UST';
const reordered = ' bb=orta_ust | coin_tf=- | coin=0000 | yon=short | btc_tf=5m | btc=1000 ';
assert.strictEqual(league.normalizeSignatureKey(reordered), full);

const exactModel = { leagues: { premier: [{ key: full, leagueScore: 70 }], championship: [], development: [], historical: [] } };
assert.strictEqual(league.findPlayer(reordered, exactModel).league, 'PREMIER');
assert.strictEqual(league.findPlayer(reordered, exactModel).matchType, 'EXACT_NORMALIZED');

const legacyModel = { leagues: { premier: [{ key: 'YON=LONG|BTC=0011|COIN=0010' }], championship: [], development: [], historical: [] } };
const legacyCandidate = 'YON=LONG|BTC=0011|COIN=0010|BTC_TF=1h+4h|COIN_TF=1h|BB=ORTA_ALT';
assert.strictEqual(league.findPlayer(legacyCandidate, legacyModel).matchType, 'UNIQUE_BASE_FALLBACK');

const ambiguousModel = { leagues: { premier: [
  { key: 'YON=LONG|BTC=0011|COIN=0010|BB=ORTA_ALT' },
  { key: 'YON=LONG|BTC=0011|COIN=0010|BB=ORTA_UST' }
], championship: [], development: [], historical: [] } };
assert.strictEqual(league.findPlayer(legacyCandidate, ambiguousModel), null);
console.log('✅ League entry reliability tests passed');
