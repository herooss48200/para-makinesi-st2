const assert = require('assert');
const league = require('./46_dna_league_engine.js');

const key = 'YON=SHORT|BTC=0011|COIN=0011|BTC_TF=1h+4h|COIN_TF=1h+4h|BB=ORTA_UST';
const model = {
  generatedAt: '2026-07-17T00:00:00.000Z',
  leagues: {
    premier: [{ key }],
    championship: [],
    development: [],
    historical: []
  }
};
const diag = league.leagueLookupDiagnostics(key.toLowerCase(), model, { sampleLimit: 2 });
assert.equal(diag.modelLoaded, true);
assert.equal(diag.matchType, 'EXACT_NORMALIZED');
assert.equal(diag.exactMatchCount, 1);
assert.equal(diag.leagueSizes.PREMIER, 1);
const text = league.formatLeagueLookupDiagnostics(diag, { symbol: 'CELRUSDT', side: 'SHORT', league: 'PREMIER' });
assert(text.includes('[LEAGUE DEBUG]'));
assert(text.includes('EXACT_NORMALIZED'));
console.log('✅ League diagnostic tests passed');
