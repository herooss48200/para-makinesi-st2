'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ledger = require('./65_accounting_continuity.js');

const old = {
  summary: h.state.basariOzeti,
  gap: h.state.restartGapOzet,
  active: h.state.aktifPozisyonlar,
  continuity: h.state.accountingContinuity
};

try {
  h.state.basariOzeti = { tp: 1000, sl: 1000, be: 105, toplamAcilanEmir: 2702 };
  h.state.restartGapOzet = { closedQuarantined: 574 };

  // Simulates the faulty v5.0.4 state saved on AWS. 573 was frozen as a
  // cumulative historical counter; one old migration position later closed.
  h.state.accountingContinuity = {
    version: 'v5.0.4-ACCOUNTING-CONTINUITY',
    initializedAt: '2026-07-19T22:43:00.000Z',
    legacy: {
      openedCounter: 2702,
      scientificClosed: 2105,
      restartGapClosed: 573,
      activeAtMigration: 40,
      classifiedDifference: 0
    },
    current: {
      opened: 2,
      closed: 0,
      openedPremier: 0,
      openedShadow: 2,
      openedReal: 0,
      closedScientific: 0,
      closedRestartGap: 0,
      closedPremier: 0,
      closedShadow: 0,
      closedReal: 0,
      legacyRecoveredClosed: 1
    },
    recentClosedIds: []
  };

  const legacy = Array.from({ length: 39 }, (_, i) => ({
    sym: `OLD${i}USDT`, yon: 'LONG', sanal: true, sanalOrderId: `OLD-${i}`,
    restartRecovered: true, dataQuality: 'RESTART_GAP', learningEligible: false
  }));
  const shadow1 = {
    sym: 'ENJUSDT', yon: 'LONG', sanal: true, sanalOrderId: 'N1',
    accountingContinuityTracked: true, accountingContinuityTrack: 'LAB_SHADOW',
    labPremierDecision: { upperLayerIncluded: false }
  };
  const shadow2 = {
    sym: '1000XECUSDT', yon: 'SHORT', sanal: true, sanalOrderId: 'N2',
    accountingContinuityTracked: true, accountingContinuityTrack: 'LAB_SHADOW',
    labPremierDecision: { upperLayerIncluded: false }
  };
  h.state.aktifPozisyonlar = [...legacy, shadow1, shadow2];

  const repaired = ledger.initializeMigration();
  assert.strictEqual(repaired.version, ledger.VERSION);
  assert.strictEqual(repaired.legacy.restartGapHistoricalCounter, 573,
    'persisted migration snapshot must remain the historical telemetry baseline');
  assert.strictEqual(repaired.legacy.classifiedDifference, 557,
    '2702 - 2105 - 40 migration actives = 557 unresolved historical difference');
  assert.strictEqual(repaired.current.opened, 2, 'forward opened counter must be preserved');
  assert.strictEqual(repaired.current.closed, 0, 'forward closed counter must be preserved');

  const snap = ledger.snapshot(h.state.aktifPozisyonlar);
  assert.strictEqual(snap.legacyActive, 39);
  assert.strictEqual(snap.migrationBatchClosed, 1);
  assert.strictEqual(snap.migrationBatchDifference, 0);
  assert.strictEqual(snap.migrationBatchReconciled, true);
  assert.strictEqual(snap.trackedActive, 2);
  assert.strictEqual(snap.difference, 0);
  assert.strictEqual(snap.reconciled, true);

  const distribution = ledger.activeBreakdown([
    { sanal: true, labPremierDecision: { upperLayerIncluded: true } },
    { sanal: true, labPremierDecision: { upperLayerIncluded: false } },
    { sanal: true, restartRecovered: true, learningEligible: false },
    { sanal: false }
  ]);
  assert.strictEqual(distribution.premier, 1);
  assert.strictEqual(distribution.shadow, 1);
  assert.strictEqual(distribution.restartGap, 1);
  assert.strictEqual(distribution.real, 1);
  assert.strictEqual(distribution.total, 4);

  const text = ledger.telegramLines(h.state.aktifPozisyonlar);
  assert.ok(text.includes('Tarihsel belirsiz fark: 557'));
  assert.ok(text.includes('Migration Gap: Yüklenen 40 | Kapanan 1 | Aktif 39 | Mutabakat +0 ✅'));
  assert.ok(text.includes('Eski Restart Gap telemetrisi: 573'));
  assert.ok(text.includes('v5.0.5 kesin defter: Açılan 2 | Kapanan 0 | Aktif 2 | Mutabakat +0 ✅'));

  const reportSource = fs.readFileSync(path.join(__dirname, '2_rapor.js'), 'utf8');
  assert.ok(reportSource.includes('Premier aktif:'));
  assert.ok(reportSource.includes('Gölge aktif:'));
  assert.ok(reportSource.includes('Restart Gap aktif:'));
  assert.ok(reportSource.includes('Toplam izlenen:'));
  assert.ok(!reportSource.includes('🛡️ Restart Gap kapanış:'),
    'cumulative telemetry must not be labeled as verified closes');

  console.log('✅ v5.0.5 classification repair passed | cumulative telemetry separated; migration and forward ledgers reconcile');
} finally {
  h.state.basariOzeti = old.summary;
  h.state.restartGapOzet = old.gap;
  h.state.aktifPozisyonlar = old.active;
  h.state.accountingContinuity = old.continuity;
}
