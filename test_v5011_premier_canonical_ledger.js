'use strict';
const assert = require('assert');
const h = require('./1_hafiza.js');
const labPremier = require('./62_lab_premier_league.js');

function gapPremier(id) {
  return {
    id,
    sym: `GAP${id}USDT`,
    yon: 'LONG',
    sanal: true,
    accountingContinuityId: id,
    accountingContinuityTracked: true,
    accountingContinuityTrack: 'LAB_PREMIER',
    accountingContinuityClosed: false,
    restartRecovered: true,
    dataQuality: 'RESTART_GAP',
    learningEligible: false,
    labPremierDecision: { upperLayerIncluded: true },
    labPremierObservation: { upperLayerIncluded: true }
  };
}

// Exact live symptom: Premier opened 10, scientific closed 5, visible active 0.
// The missing five are persisted Premier positions moved to Restart-GAP after restart.
h.state.accountingContinuity = {
  version: 'v5.0.10-ENTRY-PROVEN-PREMIER-SAFE-FALLBACK',
  initializedAt: new Date().toISOString(),
  repairedAt: null,
  legacy: {
    openedCounter: 2711,
    scientificClosed: 2110,
    activeAtMigration: 43,
    classifiedDifference: 558,
    restartGapHistoricalCounter: 0,
    restartGapClosed: 0,
    classificationModel: 'CANONICAL-POSITION-PARTITION-v3'
  },
  current: {
    opened: 10,
    closed: 5,
    openedPremier: 10,
    openedShadow: 0,
    openedReal: 0,
    closedScientific: 5,
    closedRestartGap: 0,
    closedPremier: 5,
    closedShadow: 0,
    closedReal: 0,
    legacyRecoveredClosed: 0,
    closedRestartGapRawBeforeRepair: 0,
    restartGapOverlapCorrection: 0,
    classificationRepairedAt: null,
    lastOpenAt: null,
    lastCloseAt: null
  },
  recentClosedIds: []
};
const activePositions = Array.from({ length: 5 }, (_, i) => gapPremier(`PG${i + 1}`));
h.state.aktifPozisyonlar = activePositions;

const observationAggregate = {
  opened: 10,
  active: 5,
  closed: 5,
  tp: 2,
  sl: 3,
  be: 0,
  net: -0.448,
  grossProfit: 0.72,
  grossLoss: 1.168,
  commission: 0.25
};
const ledger = labPremier.premierAccounting(activePositions, observationAggregate);
assert.equal(ledger.opened, 10);
assert.equal(ledger.closedScientific, 5);
assert.equal(ledger.activeScientific, 0);
assert.equal(ledger.activeGap, 5);
assert.equal(ledger.closedGap, 0);
assert.equal(ledger.difference, 0);
assert.equal(ledger.reconciled, true);
assert.equal(ledger.equation, '10 = 5 + 0 + 5 + 0');
assert.equal(ledger.observationReconciled, true);

const aggregate = labPremier.metrics(observationAggregate);
const text = labPremier.compactTelegramFromModel({
  league: { premierCount: 49, exitValidatedCount: 39, entryFallbackCount: 10, forwardVerifiedCount: 0 },
  aggregate,
  accounting: ledger
});
assert.ok(text.includes('Açılan 10 | Bilimsel aktif 0 | Bilimsel kapanan 5'));
assert.ok(text.includes('Restart-GAP: Aktif 5 | Kapanan 0 | Öğrenme dışı'));
assert.ok(text.includes('Premier mutabakatı: 10 = 5 + 0 + 5 + 0 | Fark +0 ✅'));
assert.ok(text.includes('Kârlı/TP 2 | ❌ Zararlı/SL 3'));
assert.ok(text.includes('GAP sonuçları dahil edilmez'));

console.log('✅ v5.0.11 Premier canonical ledger passed | 10 opened = 5 scientific closed + 0 scientific active + 5 active GAP + 0 closed GAP; difference zero');
