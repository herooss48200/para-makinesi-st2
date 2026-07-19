const assert = require('assert');
const fs = require('fs');
const path = require('path');
const identity = require('./59_dna_identity_registry.js');
const league = require('./46_dna_league_engine.js');
const readiness = require('./50_real_order_readiness_bridge.js');

const protectedFiles = [identity.REGISTRY_FILE, identity.BACKUP_FILE, identity.JOURNAL_FILE, `${identity.REGISTRY_FILE}.lock`, readiness.PREPARATION_JSON];
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
  const readyKey = 'YON=SHORT|BTC=0010|COIN=0001';
  const pendingKey = 'YON=LONG|BTC=1010|COIN=0101';
  const base = { total: 8, tp: 6, sl: 2, be: 0, decided: 8, winRate: 75, profitFactor: 1.7, expectancy: 0.15, net: 1.2, death: 'YOK', leagueScore: 95 };
  const readyPlayer = {
    ...base, key: readyKey,
    exit: { ready: true, algorithmId: 'MFE_PROTECT_70', algorithmLabel: 'MFE Koruma %70', samples: 7, beatRate: 66, profitFactor: 1.8, netUsdt: 1.4, regimeKey: 'RANGE|VOL_HIGH', selectionScope: 'EXACT_CURRENT_REGIME' }
  };
  readyPlayer.premierValidation = league.premierValidation(readyPlayer, { premierMinSample: 5 });
  const pendingPlayer = {
    ...base, key: pendingKey, leagueScore: 80,
    exit: { ready: true, algorithmId: 'TIME_15M', algorithmLabel: '15 Dakika Exit', samples: 7, beatRate: 52, profitFactor: 0.9, netUsdt: -0.2, regimeKey: 'RANGE|VOL_HIGH' }
  };
  pendingPlayer.premierValidation = league.premierValidation(pendingPlayer, { premierMinSample: 5 });

  const leagues = league.applyLeagueDecisions({ premier: [readyPlayer, pendingPlayer], championship: [], development: [], historical: [] }, { premierMinSample: 5 });
  const lm = { allPlayers: [readyPlayer, pendingPlayer], leagues, audit: { lostChampions: [] }, regime: { activeDirection: 'SHORT' } };
  const dm = {
    currentRegime: { key: 'RANGE|VOL_HIGH' },
    dna: [{
      key: `${readyKey}|BTC_TF=5M|COIN_TF=15M|BB=ORTA_UST`,
      allBest: { algorithmId: 'DETAIL_ONLY', algorithmLabel: 'Ayrıntı Elite', samples: 9, profitFactor: 1.5, netUsdt: 1.1 }
    }],
    dnaBase: [{
      key: readyKey,
      allBest: { algorithmId: 'TIME_10M', algorithmLabel: '10 Dakika Exit', samples: 20, profitFactor: 2.1, netUsdt: 3.4, deltaUsdt: 4.2 }
    }]
  };

  const observationState = { byDna: {
    [readyKey]: { key: readyKey, closed: 5, tp: 4, sl: 1, be: 0, net: 1.0, grossProfit: 2.0, grossLoss: 1.0 },
    [pendingKey]: { key: pendingKey, closed: 2, tp: 1, sl: 1, be: 0, net: -0.2, grossProfit: 0.4, grossLoss: 0.6 }
  }};
  const out = readiness.buildPreparation(lm, { dynamicModel: dm, observationState, persist: false });
  assert.strictEqual(out.readyCount, 1);
  assert.strictEqual(out.failClosed, false);
  assert.strictEqual(out.ready[0].key, readyKey);
  assert.ok(out.ready[0].dnaId > 0);
  assert.strictEqual(out.ready[0].activeExit.label, 'MFE Koruma %70');
  assert.strictEqual(out.ready[0].eliteExit.label, '10 Dakika Exit');
  assert.notStrictEqual(out.ready[0].activeExit.algorithmId, out.ready[0].eliteExit.algorithmId, 'Aktif ve tüm zaman Elite Exit ayrı tutulmalı');
  assert.strictEqual(out.exitPending.length, 1);
  assert.ok(out.exitPending[0].blockers.includes('GUNCEL_POZITIF_EXIT_KANITI_YOK'));

  const text = readiness.preparationTelegram(out, 5);
  assert.ok(text.includes(out.ready[0].dnaLabel));
  assert.ok(text.includes('Aktif Exit (RANGE|VOL_HIGH): MFE Koruma %70'));
  assert.ok(text.includes('Tüm Dönem Elite: 10 Dakika Exit'));

  const failClosedLm = { allPlayers: [pendingPlayer], leagues: { premier: [pendingPlayer], championship: [], development: [], historical: [] }, audit: { lostChampions: [] } };
  const blocked = readiness.buildPreparation(failClosedLm, { dynamicModel: { currentRegime: { key: 'RANGE|VOL_HIGH' }, dna: [] }, observationState: { byDna: {} }, persist: false });
  assert.strictEqual(blocked.readyCount, 0);
  assert.strictEqual(blocked.failClosed, true);
  assert.ok(blocked.answer.includes('gerçek emir açılmaz'));
  assert.strictEqual(identity.audit().valid, true);

  console.log('✅ v4.6.0 real-trading preparation tests passed | proof-based candidates, active/Elite separation and fail-closed behavior');
} finally {
  restore();
}
