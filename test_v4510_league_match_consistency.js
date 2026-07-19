const assert = require('assert');
const fs = require('fs');
const path = require('path');

const league = require('./46_dna_league_engine');
const readiness = require('./50_real_order_readiness_bridge');

const missingKey = 'YON=SHORT|BTC=0001|COIN=0111|BTC_TF=4H|COIN_TF=15M+1H+4H|BB=ORTA_UST';
const fakeLeagueModel = {
  generatedAt: new Date().toISOString(),
  leagues: { premier: [], championship: [], development: [], historical: [] },
  worstTen: []
};

const diag = league.leagueLookupDiagnostics(missingKey, fakeLeagueModel);
assert.strictEqual(diag.matchType, 'NONE');
assert.strictEqual(diag.exactMatchCount, 0);
assert.strictEqual(diag.baseMatchCount, 0);

const pos = {
  sym: 'TESTUSDT',
  yon: 'SHORT',
  sanal: true,
  blackboxAcilis: { strategySignature: { key: missingKey } }
};
const attached = league.attachToPosition(pos, fakeLeagueModel);
assert.strictEqual(attached.league, 'UNRANKED');
assert.strictEqual(attached.matchType, 'NONE');

const oldState = {
  leagues: {
    premier: [], championship: [], development: [{ key: missingKey, label: 'old' }], historical: []
  }
};
const events = league.transferEvents(oldState, { premier: [], championship: [], development: [], historical: [] }, 999);
assert.strictEqual(events.length, 1);
assert.strictEqual(events[0].from, 'DEVELOPMENT');
assert.strictEqual(events[0].to, 'UNRANKED');
assert.strictEqual(events[0].type, 'PROFILE_SET_EXIT');

const bridgeSource = fs.readFileSync(path.join(__dirname, '50_real_order_readiness_bridge.js'), 'utf8');
assert(bridgeSource.includes("currentLeague === 'UNRANKED' ? 'NONE' : 'EXACT_NORMALIZED'"));

console.log('✅ v4.5.10 league match consistency tests passed');
