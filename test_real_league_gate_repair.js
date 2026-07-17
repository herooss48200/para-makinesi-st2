const assert = require('assert');
const league = require('./46_dna_league_engine.js');

function p(key, pair, recent5, confidence=80, total=20) {
  return { key, total, confidence, death:'YOK', pairMetrics: pair, recent5, leagueScore:50 };
}
const players = [
  p('PREMIER', {total:20,expectancy:0.12,profitFactor:1.5,net:2.4}, {total:5,expectancy:0.05,profitFactor:1.3,net:0.25}),
  p('CHAMP_RECENT_WEAK', {total:20,expectancy:0.12,profitFactor:1.5,net:2.4}, {total:5,expectancy:-0.02,profitFactor:0.8,net:-0.10}),
  p('CHAMP_RECENT_INCOMPLETE', {total:12,expectancy:0.10,profitFactor:1.4,net:1.2}, {total:3,expectancy:0.04,profitFactor:1.2,net:0.12}),
  p('DEVELOPMENT', {total:3,expectancy:0.2,profitFactor:2,net:0.6}, {total:3,expectancy:0.2,profitFactor:2,net:0.6}, 80, 3),
  p('HISTORICAL', {total:25,expectancy:-0.2,profitFactor:0.5,net:-5}, {total:5,expectancy:-0.2,profitFactor:0.5,net:-1}, 80, 25)
];
const result = league.proposedLeagues(players, {premierMinSample:5,championshipMinSample:5,championshipSize:50,premierMinConfidence:50});
assert.deepStrictEqual(result.premier.map(x=>x.key), ['PREMIER']);
assert.deepStrictEqual(result.championship.map(x=>x.key), ['CHAMP_RECENT_WEAK','CHAMP_RECENT_INCOMPLETE']);
assert.deepStrictEqual(result.development.map(x=>x.key), ['DEVELOPMENT']);
assert.deepStrictEqual(result.historical.map(x=>x.key), ['HISTORICAL']);
console.log('✅ Real Premier/Championship gate test passed');
