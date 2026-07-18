const assert = require('assert');
const league = require('./46_dna_league_engine.js');

function p(key, actual, pair, recent5 = { total: 5, expectancy: 0, profitFactor: 1, net: 0 }) {
  return {
    key,
    total: actual.total,
    expectancy: actual.expectancy,
    profitFactor: actual.profitFactor,
    net: actual.net,
    confidence: 80,
    death: 'YOK',
    pairMetrics: pair,
    recent5,
    leagueScore: 50,
    momentum: { status: 'YENI' }
  };
}

const players = [
  p('PREMIER', { total: 20, expectancy: 0.12, profitFactor: 1.5, net: 2.4 }, { total: 7, expectancy: 0.4, profitFactor: 4, net: 2.8 }),
  p('PREMIER_RECENT_WEAK', { total: 20, expectancy: 0.12, profitFactor: 1.5, net: 2.4 }, { total: 8, expectancy: -0.2, profitFactor: 0.5, net: -1.6 }, { total: 5, expectancy: -0.02, profitFactor: 0.8, net: -0.10 }),
  p('CHAMP_INSUFFICIENT_REALIZED', { total: 8, expectancy: 0.10, profitFactor: 1.4, net: 0.8 }, { total: 20, expectancy: 0.3, profitFactor: 3, net: 6 }),
  p('NO_PREMIER_PAIR_ONLY', { total: 20, expectancy: -0.20, profitFactor: 0.5, net: -4 }, { total: 20, expectancy: 0.30, profitFactor: 3, net: 6 }),
  p('DEVELOPMENT', { total: 3, expectancy: 0.20, profitFactor: 2, net: 0.6 }, { total: 30, expectancy: 0.5, profitFactor: 5, net: 15 }),
  p('HISTORICAL', { total: 25, expectancy: -0.20, profitFactor: 0.5, net: -5 }, { total: 25, expectancy: -0.2, profitFactor: 0.5, net: -5 })
];

const result = league.proposedLeagues(players, {
  premierMinSample: 10,
  championshipMinSample: 5,
  championshipSize: 50,
  premierMinConfidence: 50
});

assert.deepStrictEqual(result.premier.map(x => x.key), ['PREMIER', 'PREMIER_RECENT_WEAK']);
assert.deepStrictEqual(result.championship.map(x => x.key), ['CHAMP_INSUFFICIENT_REALIZED']);
assert.deepStrictEqual(result.development.map(x => x.key), ['DEVELOPMENT']);
assert.deepStrictEqual(result.historical.map(x => x.key), ['NO_PREMIER_PAIR_ONLY', 'HISTORICAL']);
console.log('✅ Premier League 2.0 realized-DNA gate test passed');
