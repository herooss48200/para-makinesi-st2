'use strict';
const assert = require('assert');
const h = require('./1_hafiza.js');

h.state.accountingContinuity = null;
h.state.basariOzeti = { toplamAcilanEmir: 2710, tp: 1000, sl: 1000, be: 109 };
h.state.restartGapOzet = { closedQuarantined: 573 };
h.state.aktifPozisyonlar = [];

const continuity = require('./65_accounting_continuity.js');
const labPremier = require('./62_lab_premier_league.js');

function premier(id) {
  return {
    id, sanal: true,
    labPremierDecision: { upperLayerIncluded: true },
    labPremierObservation: {
      upperLayerIncluded: true,
      labDnaLabel: `LAB-${id}`,
      familyDnaLabel: `DNA-${id}`,
      proofLevel: 'LEARNING',
      exitAlgorithmLabel: 'Test Exit'
    }
  };
}

const stalePremierGap = premier('P-GAP');
const cleanPremier = premier('P-CLEAN');
const shadow = { id: 'S-CLEAN', sanal: true };

continuity.trackAtOpen(stalePremierGap);
continuity.trackAtOpen(cleanPremier);
continuity.trackAtOpen(shadow);

// A persisted Premier observation becomes Restart GAP after a restart.
// It must not remain visible as active Premier evidence.
stalePremierGap.restartRecovered = true;
stalePremierGap.dataQuality = 'RESTART_GAP';
stalePremierGap.learningEligible = false;

continuity.trackAtClose(shadow, { scientific: true });
h.state.aktifPozisyonlar = [stalePremierGap, cleanPremier];

let snap = continuity.snapshot(h.state.aktifPozisyonlar);
assert.equal(snap.current.openedPremier, 2);
assert.equal(snap.current.openedShadow, 1);
assert.equal(snap.current.closedShadow, 1);
assert.equal(snap.active.premier, 1, 'only clean Premier may be active evidence');
assert.equal(snap.active.shadow, 0);
assert.equal(snap.trackedRestartGapActive, 1, 'stale persisted Premier must be classified as active GAP');
assert.equal(labPremier.activeRows(h.state.aktifPozisyonlar).length, 1, 'LAB card must use the same clean Premier source');

let learningOpened = snap.current.openedPremier + snap.current.openedShadow;
let learningClosed = snap.current.closedPremier + snap.current.closedShadow;
let learningActive = snap.active.premier + snap.active.shadow;
let learningDifference = learningOpened - learningClosed - snap.current.closedRestartGap - snap.trackedRestartGapActive - learningActive;
assert.equal(learningDifference, 0, 'learning equation must reconcile while GAP is active');

continuity.trackAtClose(stalePremierGap, { restartGap: true, scientific: false });
h.state.aktifPozisyonlar = [cleanPremier];
snap = continuity.snapshot(h.state.aktifPozisyonlar);
assert.equal(snap.current.closedRestartGap, 1);
assert.equal(snap.trackedRestartGapActive, 0);
assert.equal(snap.active.premier, 1);
assert.equal(labPremier.activeRows(h.state.aktifPozisyonlar).length, 1);

learningOpened = snap.current.openedPremier + snap.current.openedShadow;
learningClosed = snap.current.closedPremier + snap.current.closedShadow;
learningActive = snap.active.premier + snap.active.shadow;
learningDifference = learningOpened - learningClosed - snap.current.closedRestartGap - snap.trackedRestartGapActive - learningActive;
assert.equal(learningDifference, 0, 'learning equation must reconcile after GAP closure');
assert.equal(snap.reconciled, true, 'exact position ledger must remain reconciled');

console.log('✅ v5.0.8 active evidence reconciliation passed | stale Premier GAP excluded, LAB/learning sources unified, equation exact');
