const assert = require('assert');
const ayarlar = require('./ayarlar.js');
const audit = require('./57_exit_victory_audit.js');
const executor = require('./51_sanal_dynamic_exit_executor.js');
const cards = require('./55_dna_identity_card_engine.js');

const coverage = audit.runtimeCoverage();
assert.strictEqual(coverage.total, 27, 'Çekirdek exit sayısı 27 olmalı');
assert.strictEqual(coverage.supported, 27, '27 exit modelinin tamamı canlı executor tarafından desteklenmeli');
assert.deepStrictEqual(coverage.unsupported, []);

const oldVirtual = ayarlar.sanalDynamicExitAktif;
try {
  ayarlar.sanalDynamicExitAktif = true;
  const now = Date.now();
  const trendPos = {
    sym: 'TRENDTESTUSDT', yon: 'LONG', sanal: true,
    girisFiyati: 100, acilisZamani: now - (5 * 60 * 1000),
    execution: { pricePath: [{ ts: now, price: 100.2, pnlPct: 0.2, stTrend: 'DOWN', stAligned: false }] },
    executionExitAssignment: { ready: true, algorithmId: 'TREND_EXIT_ST', label: 'Trend Exit (ST Bozulması)', assignmentId: 'TEST|TREND', activeForPosition: true },
    exitPlanShadow: { ready: true, selectedAlgorithmId: 'TREND_EXIT_ST', selectedAlgorithmLabel: 'Trend Exit (ST Bozulması)' }
  };
  const result = executor.evaluate(trendPos, 100.2);
  assert.strictEqual(result.active, true);
  assert.strictEqual(result.close, true, 'ST bozulması canlı executor kapanışı üretmeli');
  assert.strictEqual(result.algorithmId, 'TREND_EXIT_ST');
} finally {
  ayarlar.sanalDynamicExitAktif = oldVirtual;
}

const leagueModel = {
  leagues: {
    premier: [{ key: 'YON=LONG|BTC=0011|COIN=0010', leagueScore: 95, total: 10, tp: 7, sl: 3, be: 0, winRate: 70, net: 2, profitFactor: 1.5, expectancy: 0.2, recent5: {}, momentum: { status: 'GUCLENIYOR' }, exit: { algorithmLabel: 'MFE Koruma %70', algorithmId: 'MFE_PROTECT_70' } }],
    championship: [], development: [], historical: []
  }
};
const cardModel = cards.build(leagueModel, { dna: [] });
assert.strictEqual(cardModel.cards[0].winRate, 70, 'DNA kartı WR değerini lig oyuncusundan doğru okumalı');
assert.strictEqual(cardModel.cards[0].tp, 7);
assert.strictEqual(cardModel.cards[0].sl, 3);

console.log(`✅ v4.5.3 Exit Finalization tests passed | Runtime ${coverage.supported}/${coverage.total} | WR ${cardModel.cards[0].winRate}`);
