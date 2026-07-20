'use strict';
const assert = require('assert');
const fs = require('fs');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

function active(id, track, gap = false, premier = false) {
  return {
    id,
    sym: `T${id}USDT`,
    yon: 'LONG',
    sanal: true,
    accountingContinuityId: id,
    accountingContinuityTracked: true,
    accountingContinuityTrack: track,
    accountingContinuityClosed: false,
    restartRecovered: gap,
    dataQuality: gap ? 'RESTART_GAP' : 'SCIENTIFIC',
    learningEligible: !gap,
    labPremierDecision: premier ? { upperLayerIncluded: true } : null,
    labPremierObservation: premier ? { upperLayerIncluded: true } : null
  };
}

// Exact reproduction of the AWS report that exposed v5.0.8's overlap:
// 121 opened, 88 closed, 33 active; raw GAP-close counter 26 overlapped
// scientific counters by 16. Canonical partition must recover GAP closed=10.
h.state.accountingContinuity = {
  version: 'v5.0.8-ACTIVE-EVIDENCE-RECONCILIATION',
  initializedAt: new Date().toISOString(),
  repairedAt: null,
  legacy: {
    openedCounter: 2710,
    scientificClosed: 2110,
    activeAtMigration: 40,
    classifiedDifference: 560,
    restartGapHistoricalCounter: 573,
    restartGapClosed: 573,
    classificationModel: 'ACTIVE-BATCH-ONLY-v2'
  },
  current: {
    opened: 121,
    closed: 88,
    openedPremier: 9,
    openedShadow: 112,
    openedReal: 0,
    closedScientific: 78,
    closedRestartGap: 26,
    closedPremier: 5,
    closedShadow: 73,
    closedReal: 0,
    legacyRecoveredClosed: 33,
    lastOpenAt: null,
    lastCloseAt: null
  },
  recentClosedIds: []
};

const positions = [];
for (let i = 0; i < 4; i++) positions.push(active(`PG${i}`, 'LAB_PREMIER', true, true));
for (let i = 0; i < 28; i++) positions.push(active(`SG${i}`, 'LAB_SHADOW', true, false));
positions.push(active('SA0', 'LAB_SHADOW', false, false));
h.state.aktifPozisyonlar = positions;

const continuity = require('./65_accounting_continuity.js');
const snap = continuity.snapshot(positions);
assert.equal(snap.current.opened, 121);
assert.equal(snap.current.closed, 88);
assert.equal(snap.trackedActive, 33);
assert.equal(snap.difference, 0, 'exact position ledger must reconcile');
assert.equal(snap.canonical.premier.closedGap, 0);
assert.equal(snap.canonical.shadow.closedGap, 10);
assert.equal(snap.canonical.closedGap, 10, 'canonical GAP close must be residual 10, not overlapping raw 26');
assert.equal(snap.current.closedRestartGap, 10, 'persisted GAP counter must be repaired');
assert.equal(snap.current.closedRestartGapRawBeforeRepair, 26);
assert.equal(snap.current.restartGapOverlapCorrection, 16);
const learningOpened = snap.canonical.premier.opened + snap.canonical.shadow.opened;
const learningClosed = snap.canonical.premier.closedScientific + snap.canonical.shadow.closedScientific;
const learningGapClosed = snap.canonical.premier.closedGap + snap.canonical.shadow.closedGap;
const learningGapActive = snap.canonical.premier.activeGap + snap.canonical.shadow.activeGap;
const learningActive = snap.canonical.premier.activeScientific + snap.canonical.shadow.activeScientific;
assert.equal(learningOpened, 121);
assert.equal(learningClosed, 78);
assert.equal(learningGapClosed, 10);
assert.equal(learningGapActive, 32);
assert.equal(learningActive, 1);
assert.equal(learningOpened - learningClosed - learningGapClosed - learningGapActive - learningActive, 0);

const reportSource = fs.readFileSync(require.resolve('./2_rapor.js'), 'utf8');
assert.ok(reportSource.includes('continuity.canonical'), 'report must use canonical partition');
assert.ok(reportSource.includes('Eski sayaç çakışması onarıldı'), 'repair must be visible in audit output');

// ATR end-to-end proof: real candle rows -> ATR% in pricePath -> frozen ATR
// assignment -> executor closes on ATR retracement. No hand-injected atrPct.
const exitOptimizer = require('./15_exit_optimizer_foundation.js');
const executor = require('./51_sanal_dynamic_exit_executor.js');
const models = require('./44_exit_evolution_models.js');
const victory = require('./57_exit_victory_audit.js');
const oldDynamic = ayarlar.sanalDynamicExitAktif;
ayarlar.sanalDynamicExitAktif = true;
h.state.sniperMumlar = h.state.sniperMumlar || {};
h.state.exitAtrPct = {};
h.state.sniperMumlar.ATRTEST = Array.from({ length: 15 }, (_, i) => ({
  openTime: Date.now() - (15 - i) * 180000,
  open: 100,
  high: 100.2,
  low: 99.8,
  close: 100
}));

const atrPos = {
  id: 'ATR-E2E-LONG',
  sym: 'ATRTEST',
  yon: 'LONG',
  sanal: true,
  girisFiyati: 100,
  acilisZamani: Date.now() - 60000,
  executionExitAssignment: {
    ready: true,
    algorithmId: 'ATR_TRAIL_1_5X',
    label: 'ATR Trailing 1.5x',
    assignmentId: 'ATR-E2E-ASSIGNMENT'
  },
  exitPlanShadow: {
    ready: true,
    selectedAlgorithmId: 'ATR_TRAIL_1_5X',
    selectedAlgorithmLabel: 'ATR Trailing 1.5x',
    assignmentId: 'ATR-E2E-ASSIGNMENT'
  }
};
exitOptimizer.pozisyonBaslat(atrPos);
exitOptimizer.tickGuncelle(atrPos, 101);
assert.ok(atrPos.execution.pricePath.length > 0);
assert.ok(Number(atrPos.execution.pricePath.at(-1).atrPct) > 0, 'ATR% must be produced from sniper candles');
let atrDecision = executor.evaluate(atrPos, 101);
assert.equal(atrDecision.active, true);
assert.equal(atrDecision.close, false);
exitOptimizer.tickGuncelle(atrPos, 100.2);
atrDecision = executor.evaluate(atrPos, 100.2);
assert.equal(atrDecision.close, true, 'ATR executor must close after sufficient peak retracement');
assert.equal(atrDecision.algorithmId, 'ATR_TRAIL_1_5X');
assert.match(atrDecision.reason, /ATR geri çekilme/);

const atrAlgorithms = models.algorithms().filter(x => x.className === 'ATR_TRAILING');
assert.equal(atrAlgorithms.length, 3);
assert.ok(atrAlgorithms.every(x => executor.isSupported(x.id)), 'all ATR variants must be executable');
const replayResult = atrAlgorithms[0].run({
  startTs: 0,
  side: 'LONG',
  valueUsdt: 50,
  commissionUsdt: 0.05,
  actualNetUsdt: 0,
  actualNetPct: 0,
  actualGrossPct: 0,
  pathRows: [
    { ts: 1000, pnlPct: 1.0, atrPct: 0.4 },
    { ts: 2000, pnlPct: 0.2, atrPct: 0.4 }
  ]
});
assert.equal(replayResult.exitSource, 'ATR_TRAILING_BREAK');
assert.equal(replayResult.modelTriggered, true);
const coverage = victory.runtimeCoverage();
assert.equal(coverage.complete, true);
assert.equal(coverage.unsupported.filter(x => String(x.id).startsWith('ATR_TRAIL_')).length, 0);
assert.ok(fs.readFileSync(require.resolve('./57_exit_victory_audit.js'), 'utf8').includes('ATR zinciri'));
ayarlar.sanalDynamicExitAktif = oldDynamic;

console.log('✅ v5.0.9 canonical ledger + ATR runtime proof passed | live 121/78/26/32/1 overlap repaired to 121=78+10+32+1; ATR candle→path→executor chain closes');
