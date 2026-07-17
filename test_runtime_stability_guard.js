const assert = require('assert');
const intelligence = require('./41_agros_intelligence_dashboard.js');
const league = require('./46_dna_league_engine.js');

const key = 'YON=LONG|BTC=0001|COIN=0010';
const trade = { key, direction: 'LONG', result: 'TP', net: 0.4, timestamp: Date.now(), time: new Date().toISOString(), symbol: 'TESTUSDT' };
const rankingRow = { key, label: 'TEST', total: 5, expectancy: 0.08, profitFactor: 1.5, net: 0.4, score: 70 };
const evolutionRow = {
  key,
  windows: { 20: { total: 5, expectancy: 0.08, profitFactor: 1.5, net: 0.4 } },
  momentum: { score: 20, status: 'GUCLENIYOR' },
  stability: { score: 70 },
  death: 'YOK'
};

const players = league.buildPlayers({
  trades: [trade],
  ranking: { all: [rankingRow] },
  confidence: { all: [{ key, metaScore: 75, confidenceV2: 80, recommendation: 'ELITE' }] },
  evolution: { allDnas: [evolutionRow] },
  regime: { activeDirection: 'LONG' }
});
assert.strictEqual(players.length, 1);
assert.strictEqual(players[0].key, key);

const model = intelligence.build({
  consensus: { totalDna: 1, readyDna: 1, strongCount: 1, riskCount: 0, conflictCount: 0, strongest: [] },
  validation: {}, direction: {}, evolution: {}
});
assert.doesNotThrow(() => intelligence.telegramText(model));
console.log('✅ Intelligence + league runtime stability test passed (tradeGroups scope regression guarded)');
