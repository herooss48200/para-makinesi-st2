const assert = require('assert');
const h = require('./1_hafiza.js');
const replay = require('./22_exit_replay_engine.js');
const dashboard = require('./45_exit_evolution_dashboard.js');
const league = require('./46_dna_league_engine.js');

assert.strictEqual(league.CLASSIFICATION_POLICY_VERSION, 4, 'v4.6 politika sürümü yeniden sınıflandırmayı tetiklemeli');
assert.strictEqual(league.classificationPolicyMigrationRequired({ classificationPolicyVersion: 2 }), true);

const catalog = replay.algorithms().filter(x => x.isExecutable !== false);
assert.strictEqual(catalog.length, 27, 'Aktif katalog 27 olmalı');
const active = catalog[0];
const originalSummary = h.state.exitReplayOzet;
try {
  const bucket = (key, label, delta, samples = 10) => ({
    key, label, algorithmClass: 'TEST', isExecutable: true, samples,
    netUsdt: delta + 1, actualNetUsdt: 1, deltaUsdt: delta,
    winsVsActual: samples, lossesVsActual: 0,
    profitableTrades: samples, losingTrades: 0,
    grossProfitUsdt: delta + 1, grossLossUsdt: 0
  });
  h.state.exitReplayOzet = {
    version: 'TEST', totalTrades: 10, lastUpdate: null,
    byAlgorithm: {
      ACTUAL: bucket('ACTUAL', 'Gerçek', 0),
      [active.id]: bucket(active.id, active.label, 5),
      OLD_VARIANT_999: bucket('OLD_VARIANT_999', 'Eski Varyant', 999)
    },
    bySignature: {
      TESTDNA: {
        key: 'TESTDNA', label: 'TESTDNA', samples: 10,
        algorithms: {
          ACTUAL: bucket('ACTUAL', 'Gerçek', 0),
          [active.id]: bucket(active.id, active.label, 5),
          OLD_VARIANT_999: bucket('OLD_VARIANT_999', 'Eski Varyant', 999)
        }
      }
    },
    timeBehavior: {}, last10: [], actualTotalNetUsdt: 0,
    oracleBestTotalNetUsdt: 0, oraclePotentialDeltaUsdt: 0
  };
  const model = replay.buildModel();
  assert.strictEqual(model.configuredAlgorithmCount, 27);
  assert.strictEqual(model.historicalInactiveAlgorithmCount, 1);
  assert.ok(model.algorithmRanking.every(x => x.key !== 'OLD_VARIANT_999'));
  assert.strictEqual(model.dna[0].bestExit.key, active.id, 'Eski varyant DNA best-exit olamamalı');

  const dm = dashboard.buildDashboardModel(model, { totalValidated: 0, algorithms: [] });
  assert.strictEqual(dm.totalAlgorithms, 27);
  assert.strictEqual(dm.historicalInactiveAlgorithms, 1);
  assert.ok(dm.topAlgorithms.every(x => x.key !== 'OLD_VARIANT_999'));
  const text = dashboard.telegramMetni(dm);
  assert.ok(text.includes('Çekirdek yarışan exit: <b>27</b>'));
  assert.ok(!text.includes('Yarışan model: <b>33</b>'));
} finally {
  h.state.exitReplayOzet = originalSummary;
}

const good = {
  key: 'YON=LONG|BTC=1101|COIN=0011', total: 12, expectancy: 0.2036,
  profitFactor: 2.02, net: 2.443, death: 'YOK', leagueScore: 98.68,
  pairMetrics: { total: 7, expectancy: 0.1487, profitFactor: 999, net: 1.04, algorithmLabel: 'Sabit TP %0.4' },
  momentum: { status: 'YENI' }
};
const pairOnly = {
  key: 'YON=SHORT|BTC=0010|COIN=0001', total: 8, expectancy: -0.1,
  profitFactor: 0.7, net: -0.8, death: 'YOK', leagueScore: 82,
  pairMetrics: { total: 19, expectancy: 0.3925, profitFactor: 36.11, net: 7.45, algorithmLabel: 'MFE Koruma %70' },
  momentum: { status: 'YENI' }
};
const leagues = league.proposedLeagues([good, pairOnly], { premierMinSample: 10, championshipMinSample: 5, championshipSize: 50 });
assert.deepStrictEqual(leagues.premier.map(x => x.key), [good.key], 'Premier kapısı yalnız gerçek DNA metriklerini kullanmalı');

const leagueModel = {
  regime: { activeDirection: 'LONG', long: { expectancy: 0.1 }, short: { expectancy: -0.1 } },
  leagueSizes: { premier: 1, championship: 0, development: 0, historical: 0 },
  worstTenCount: 0, lastTransferTradeCount: 10, nextTransferAt: 15,
  leagues: { premier: [good], championship: [], development: [], historical: [] },
  transfers: [], audit: { profitableCount: 1, profitableOutsidePremierCount: 0, rule: 'TEST' }
};
const leagueText = league.telegramText(leagueModel, { limit: 1 });
assert.ok(leagueText.includes('DNA N12'), 'Telegram DNA N değerini gerçek toplamdan göstermeli');
assert.ok(leagueText.includes('ExitN7'), 'Exit kanıt örneği ayrı gösterilmeli');
assert.ok(leagueText.includes('Exp +0.2036'));
assert.ok(leagueText.includes('PF 2.02'));

console.log('✅ v4.5.4 report consistency tests passed | Catalog 27 | Premier DNA N source unified');
