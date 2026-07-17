const assert = require('assert');
const league = require('./46_dna_league_engine.js');

assert.strictEqual(league.classificationPolicyMigrationRequired(null), true);
assert.strictEqual(league.classificationPolicyMigrationRequired({ classificationPolicyVersion: 0 }), true);
assert.strictEqual(league.classificationPolicyMigrationRequired({ classificationPolicyVersion: league.CLASSIFICATION_POLICY_VERSION }), false);

const ranking = { all: [{ key:'YON=LONG|BTC=0011|COIN=0010', total:5, expectancy:0.20, profitFactor:2, net:1, score:80, confidenceScore:80 }] };
const trades = [
  { key:'YON=LONG|BTC=0011|COIN=0010|BTC_TF=1H|COIN_TF=1H|BB=ORTA_ALT', net:0.4, result:'TP', direction:'LONG' },
  { key:'YON=LONG|BTC=0011|COIN=0010|BTC_TF=1H|COIN_TF=1H|BB=ORTA_ALT', net:-0.1, result:'SL', direction:'LONG' },
  { key:'YON=LONG|BTC=0011|COIN=0010|BTC_TF=1H|COIN_TF=1H|BB=ORTA_ALT', net:0.3, result:'TP', direction:'LONG' },
  { key:'YON=LONG|BTC=0011|COIN=0010|BTC_TF=1H|COIN_TF=1H|BB=ORTA_ALT', net:-0.1, result:'SL', direction:'LONG' },
  { key:'YON=LONG|BTC=0011|COIN=0010|BTC_TF=1H|COIN_TF=1H|BB=ORTA_ALT', net:0.4, result:'TP', direction:'LONG' }
];
const players = league.buildPlayers({ ranking, trades, confidence:{all:[]}, evolution:{all:[]} });
assert.strictEqual(players.length, 1);
assert.strictEqual(players[0].recent5.total, 5, 'Temel ranking anahtarı tam BB/TF trade anahtarlarıyla eşleşmeli');
assert(players[0].recent5.net > 0, 'Son 5 net pozitif olmalı');
console.log('✅ League state reclassification + Recent-5 key repair test passed.');
