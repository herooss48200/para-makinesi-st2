const assert = require('assert');
const fs = require('fs');
const path = require('path');
const identity = require('./59_dna_identity_registry.js');
const league = require('./46_dna_league_engine.js');
const adaptive = require('./49_adaptive_trading_league.js');
const observation = require('./48_premier_observation_engine.js');
const readiness = require('./50_real_order_readiness_bridge.js');

const protectedFiles = [
  identity.REGISTRY_FILE,
  identity.BACKUP_FILE,
  identity.JOURNAL_FILE,
  `${identity.REGISTRY_FILE}.lock`,
  league.TRANSFER_FILE,
  league.TRANSFER_BACKUP_FILE,
  adaptive.STORY,
  adaptive.DASH,
  readiness.PREPARATION_JSON
];
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
function jsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

try {
  protectedFiles.forEach(remove);
  fs.mkdirSync(path.dirname(league.TRANSFER_FILE), { recursive: true });

  const A = 'YON=LONG|BTC=0Y01|COIN=Y010';
  const B = 'YON=SHORT|BTC=Y001|COIN=0YY0';
  const C = 'YON=LONG|BTC=YY00|COIN=00Y1';
  const legacyRows = [
    { version: 'v4.5', timestamp: '2026-07-17T10:00:00.000Z', totalTrades: 2001, key: A, from: 'DEVELOPMENT', to: 'HISTORICAL' },
    { version: 'v4.5', timestamp: '2026-07-17T10:01:00.000Z', totalTrades: 2002, key: B, from: 'CHAMPIONSHIP', to: 'DEVELOPMENT', dnaLabel: 'DNA #YOK' },
    { version: 'v4.5', timestamp: '2026-07-17T10:02:00.000Z', totalTrades: 2003, key: C, from: 'CHAMPIONSHIP', to: 'PREMIER' }
  ];
  const legacyText = legacyRows.map(row => JSON.stringify(row)).join('\n') + '\n';
  fs.writeFileSync(league.TRANSFER_FILE, legacyText);

  const migration = league.migrateTransferHistory({ persist: true });
  assert.strictEqual(migration.total, 3);
  assert.strictEqual(migration.migrated, 3, 'Bütün eski ID’siz transferler göç ettirilmeli');
  assert.strictEqual(migration.valid, true);
  assert.strictEqual(fs.readFileSync(league.TRANSFER_BACKUP_FILE, 'utf8'), legacyText, 'Göç öncesi dosya birebir yedeklenmeli');

  const migrated = jsonl(league.TRANSFER_FILE);
  assert.strictEqual(migrated.length, legacyRows.length, 'Göç sırasında hiçbir transfer satırı kaybolmamalı');
  for (const row of migrated) {
    assert.ok(row.dnaId > 0);
    assert.strictEqual(row.dnaLabel, `DNA #${row.dnaId}`);
    assert.ok(row.identityKey);
    assert.strictEqual(row.identityMigrationVersion, league.TRANSFER_ID_MIGRATION_VERSION);
  }

  league.appendTransfers([{ version: league.VERSION, timestamp: new Date().toISOString(), totalTrades: 2004, key: A, from: 'HISTORICAL', to: 'DEVELOPMENT' }]);
  const afterAppend = jsonl(league.TRANSFER_FILE);
  assert.strictEqual(afterAppend.length, 4);
  assert.ok(afterAppend[3].dnaId > 0, 'Yeni transfer merkezi ID olmadan yazılamamalı');
  assert.throws(() => league.appendTransfers([{ from: 'DEVELOPMENT', to: 'HISTORICAL', key: 'BOZUK_ANAHTAR' }]), /kimliğine bağlanamadı|kimliği/i);

  const playerId = identity.requireIdentity(A, { source: 'V461_TELEGRAM_TEST' });
  const player = {
    key: A, dnaId: playerId.id, dnaLabel: playerId.label, label: 'LONG BTC 0Y01 Coin Y010', total: 8,
    expectancy: 0.2, profitFactor: 1.6, net: 1.6, leagueScore: 90, momentum: { status: 'GUCLENIYOR' },
    exit: { algorithmLabel: 'MFE Koruma %70' }
  };
  const lm = {
    allPlayers: [player],
    leagues: { premier: [player], championship: [], development: [], historical: [] },
    leagueSizes: { premier: 1, championship: 0, development: 0, historical: 0 },
    audit: { profitableCount: 1, profitableOutsidePremierCount: 0 },
    recovery: { analyzedDna: 1 },
    worstTen: [], worstTenCount: 0,
    regime: { activeDirection: 'LONG' }
  };
  const observationModel = {
    premier: { net: 1, profitFactor: 1.5, expectancy: 0.2 },
    shadow: { closed: 0, net: 0 }, topDna: [], topExit: []
  };
  const telegram = adaptive.telegram([], {
    leagueModel: lm,
    observationModel,
    dynamicModel: { currentRegime: { key: 'RANGE|VOL_HIGH' } },
    persist: false
  });
  assert.ok(telegram.includes(playerId.label));
  assert.ok(!telegram.includes('DNA #YOK'), 'Adaptive League Telegram hiçbir koşulda DNA #YOK göstermemeli');

  const base = { total: 8, tp: 6, sl: 2, be: 0, decided: 8, winRate: 75, profitFactor: 1.7, expectancy: 0.15, net: 1.2, death: 'YOK', leagueScore: 95 };
  const readyPlayer = {
    ...base, key: A, dnaId: playerId.id, dnaLabel: playerId.label,
    exit: { ready: true, algorithmId: 'MFE_PROTECT_70', algorithmLabel: 'MFE Koruma %70', samples: 7, beatRate: 66, profitFactor: 1.8, netUsdt: 1.4, regimeKey: 'RANGE|VOL_HIGH', selectionScope: 'EXACT_CURRENT_REGIME' }
  };
  readyPlayer.premierValidation = league.premierValidation(readyPlayer, { premierMinSample: 5 });
  const readinessLeague = { allPlayers: [readyPlayer], leagues: { premier: [readyPlayer], championship: [], development: [], historical: [] }, audit: { lostChampions: [] }, regime: { activeDirection: 'LONG' } };
  const dynamicModel = { currentRegime: { key: 'RANGE|VOL_HIGH' }, dnaBase: [{ key: A, allBest: { algorithmId: 'MFE_PROTECT_70', algorithmLabel: 'MFE Koruma %70', samples: 8, profitFactor: 1.9, netUsdt: 1.8 } }] };

  const positiveState = { byDna: { [A]: { key: A, closed: 5, tp: 4, sl: 1, be: 0, net: 1.2, grossProfit: 2.2, grossLoss: 1.0 } } };
  const positiveProof = observation.dnaForwardProof(A, positiveState);
  assert.strictEqual(positiveProof.eligible, true);
  const prepared = readiness.buildPreparation(readinessLeague, { dynamicModel, observationState: positiveState, persist: false });
  assert.strictEqual(prepared.historicalCandidateCount, 1);
  assert.strictEqual(prepared.readyCount, 1, 'İleri kanıt pozitifse gerçek hazırlık adayı oluşmalı');
  assert.strictEqual(prepared.ready[0].forwardProof.eligible, true);

  const negativeState = { byDna: { [A]: { key: A, closed: 5, tp: 2, sl: 3, be: 0, net: -0.4, grossProfit: 0.6, grossLoss: 1.0 } } };
  const blocked = readiness.buildPreparation(readinessLeague, { dynamicModel, observationState: negativeState, persist: false });
  assert.strictEqual(blocked.historicalCandidateCount, 1, 'Tarihsel+Exit adayı kaybolmamalı');
  assert.strictEqual(blocked.readyCount, 0, 'İleri kanıt negatifse gerçek emir hazır denmemeli');
  assert.strictEqual(blocked.failClosed, true);
  assert.ok(blocked.forwardPending[0].blockers.includes('ILERI_DOGRULAMA_POZITIF_DEGIL'));
  assert.ok(blocked.answer.includes('gerçek emir açılmaz'));
  const blockedTelegram = readiness.preparationTelegram(blocked, 3);
  assert.ok(blockedTelegram.includes('İLERİ KANIT BEKLEYENLER'));
  assert.ok(blockedTelegram.includes(playerId.label));

  console.log('✅ v4.6.1 transfer identity + forward proof tests passed | zero DNA #YOK, zero lost transfer rows, real gate fail-closed');
} finally {
  restore();
}
