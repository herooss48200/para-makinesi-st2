const assert = require('assert');
const fs = require('fs');
const path = require('path');
const identity = require('./59_dna_identity_registry.js');
const rankingEngine = require('./33_dna_profit_ranking_engine.js');
const league = require('./46_dna_league_engine.js');
const cards = require('./55_dna_identity_card_engine.js');
const blackbox = require('./8_blackbox.js');
const observation = require('./48_premier_observation_engine.js');

const protectedFiles = [identity.REGISTRY_FILE, identity.BACKUP_FILE, identity.JOURNAL_FILE, `${identity.REGISTRY_FILE}.lock`, cards.OUT];
const snapshots = new Map(protectedFiles.map(file => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));
function remove(file) { try { fs.unlinkSync(file); } catch (_) {} }
function restore() {
  for (const file of protectedFiles) {
    remove(file);
    const value = snapshots.get(file);
    if (value) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, value);
    }
  }
}

try {
  protectedFiles.forEach(remove);
  const key = 'YON=LONG|BTC=0010|COIN=0001';
  const eligible = { key, total: 5, tp: 4, sl: 1, be: 0, decided: 5, winRate: 80, profitFactor: 1.5, expectancy: 0.2, net: 1, death: 'YOK', leagueScore: 90, recent5: {} };

  assert.strictEqual(league.premierValidation(eligible, { premierMinSample: 5 }).eligible, true, 'N=5 sınırı Premier olabilmeli');
  assert.strictEqual(league.premierValidation({ ...eligible, total: 4 }, { premierMinSample: 5 }).eligible, false);
  assert.strictEqual(league.premierValidation({ ...eligible, profitFactor: 1 }, { premierMinSample: 5 }).eligible, false);
  assert.strictEqual(league.premierValidation({ ...eligible, expectancy: 0 }, { premierMinSample: 5 }).eligible, false);
  assert.strictEqual(league.premierValidation({ ...eligible, net: 0 }, { premierMinSample: 5 }).eligible, false);
  assert.strictEqual(league.premierValidation({ ...eligible, death: 'OLUM_RISKI' }, { premierMinSample: 5 }).eligible, false, 'Güvenlik riski Premier’e girmemeli');

  const proposed = league.proposedLeagues([eligible], { premierMinSample: 5 });
  assert.strictEqual(proposed.premier.length, 1);
  assert.strictEqual(proposed.premier[0].leagueReason.startsWith('Premier:'), true);
  assert.strictEqual(proposed.premier[0].premierValidation.eligible, true);

  const outside = league.audit([eligible], { premier: [], championship: [eligible], development: [], historical: [] });
  assert.strictEqual(outside.lostChampionCount, 1, 'Premier dışında kalan güçlü DNA kaçırılmamalı');
  assert.strictEqual(outside.lostChampions[0].assignedLeague, 'CHAMPIONSHIP');
  assert.ok(outside.lostChampions[0].reason.includes('transfer') || outside.lostChampions[0].reason.includes('Premier'));

  const ranking = rankingEngine.rank({
    [key]: { key, etiket: 'Test DNA', toplam: 5, tp: 4, sl: 1, be: 0, net: 1, karToplam: 2, zararToplam: 1 }
  }, { minSample: 5 });
  const players = league.buildPlayers({ ranking, trades: [], confidence: { all: [] }, evolution: { all: [] } });
  assert.strictEqual(players.length, 1);
  const leagues = league.proposedLeagues(players, { premierMinSample: 5 });
  const model = { leagues, allPlayers: players, audit: league.audit(players, leagues), regime: { activeDirection: 'NEUTRAL' } };
  const detailKey = `${key}|BTC_TF=5M|COIN_TF=15M|BB=ORTA_ALT`;
  const cardModel = cards.build(model, {
    currentRegime: { key: 'RANGE|VOL_HIGH' },
    dna: [{ key: detailKey, allBest: { algorithmId: 'DETAIL_EXIT', algorithmLabel: 'Ayrıntı Exit', samples: 9 } }],
    dnaBase: [{ key, allBest: { algorithmId: 'BASE_ELITE', algorithmLabel: 'Temel DNA Elite', samples: 15 } }]
  });

  const rankId = ranking.all[0].dnaId;
  const leagueId = players[0].dnaId;
  const cardId = cardModel.cards[0].dnaId;
  assert.ok(rankId > 0, 'Strategy Lab DNA ID’siz kayıt üretememeli');
  assert.strictEqual(rankId, leagueId, 'Strategy Lab ve League aynı ID’yi kullanmalı');
  assert.strictEqual(leagueId, cardId, 'League ve Kimlik Kartı aynı ID’yi kullanmalı');
  assert.strictEqual(cardModel.cards[0].eliteExit, 'Temel DNA Elite', 'Tüm-zaman Elite, aynı ID’nin temel DNA agregasından gelmeli');
  const createdSignature = blackbox.strategySignatureOlustur('TESTUSDT', 'LONG', {
    superTrend: { '5m': { trend: 'DOWN' }, '15m': { trend: 'DOWN' }, '1h': { trend: 'UP' }, '4h': { trend: 'DOWN' } }
  }, {
    superTrend: { '5m': { trend: 'DOWN' }, '15m': { trend: 'DOWN' }, '1h': { trend: 'DOWN' }, '4h': { trend: 'UP' } },
    bollinger: { bolge: 'ORTA_ALT' }
  });
  assert.strictEqual(createdSignature.dnaId, rankId, 'Yeni DNA imzası oluşturulduğu anda merkezi ID atanmalı');
  const signatureText = blackbox.strategySignatureMetni({
    symbol: 'TESTUSDT', strategySignature: createdSignature,
    btc: { superTrend: {} }, coin: { superTrend: {} }
  });
  assert.ok(signatureText.includes(`🪪 DNA #${rankId}`), 'Strategy Lab imza raporu merkezi DNA ID’yi göstermeli');
  const legacyObservation = { [key]: { opened: 12, closed: 10, net: 2.4 } };
  const migratedRows = observation.__testBackfillDnaRows(legacyObservation, 'V460_TEST_LEGACY_OBSERVATION');
  assert.strictEqual(migratedRows[0].dnaId, rankId, 'Eski Premier gözlem kovası yeni işlem beklemeden aynı DNA ID’ye bağlanmalı');
  assert.strictEqual(migratedRows[0].dnaLabel, `DNA #${rankId}`);
  assert.strictEqual(identity.audit().valid, true);

  console.log('✅ v4.6.0 Premier validation tests passed | exact thresholds, reasons, lost champions and cross-report DNA ID consistency');
} finally {
  restore();
}
