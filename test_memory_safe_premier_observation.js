'use strict';
const assert = require('assert');
const observation = require('./48_premier_observation_engine.js');

function bucket() { return { opened: 10, closed: 8, tp: 5, sl: 3, be: 0, net: 1.25, grossProfit: 3, grossLoss: 1.75, commission: 0.2 }; }
const hugeByDna = {};
for (let i = 0; i < 50000; i++) hugeByDna['DNA-' + i] = { ...bucket(), key: 'DNA-' + i };
const state = {
  version: observation.VERSION, kind: 'LEAGUE_TEST', experimentId: 'TEST', startedAt: new Date().toISOString(),
  opened: 10, closed: 8, blocked: 0, premier: bucket(), championship: bucket(), shadow: bucket(),
  byDna: hugeByDna, byExit: {}, lastTrades: [], updatedAt: new Date().toISOString()
};
const before = process.memoryUsage().heapUsed;
const summary = observation.__testBuildSummaryModel
  ? observation.__testBuildSummaryModel(state, [], 'LEAGUE_TEST')
  : null;
assert(summary, 'summary test hook missing');
assert.strictEqual(summary.closed, 8);
assert.strictEqual(summary.byDna, undefined);
assert.strictEqual(summary.topDna, undefined);
const message = observation.telegramFromModel(summary);
assert(message.includes('DYNAMIC LEAGUE + EXIT TEST KASASI'));
const deltaMb = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
assert(deltaMb < 20, `summary heap delta too high: ${deltaMb.toFixed(1)} MB`);
console.log(`✅ Memory-safe Premier Observation | 50,000 DNA | Heap delta ${deltaMb.toFixed(1)} MB`);
