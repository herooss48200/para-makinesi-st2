'use strict';
const assert = require('assert');
const h = require('./1_hafiza.js');

h.state.accountingContinuity = null;
h.state.basariOzeti = { toplamAcilanEmir: 2702, tp: 1000, sl: 1000, be: 105 };
h.state.restartGapOzet = { closedQuarantined: 573 };
h.state.aktifPozisyonlar = [];

const continuity = require('./65_accounting_continuity.js');

const premier = {
  id: 'P-1', sanal: true,
  labPremierDecision: { upperLayerIncluded: true }
};
const shadow = { id: 'S-1', sanal: true };
continuity.trackAtOpen(premier);
continuity.trackAtOpen(shadow);
h.state.aktifPozisyonlar = [premier, shadow];

let snap = continuity.snapshot(h.state.aktifPozisyonlar);
assert.equal(snap.current.openedPremier, 1);
assert.equal(snap.current.openedShadow, 1);
assert.equal(snap.active.premier, 1);
assert.equal(snap.active.shadow, 1);
assert.equal(snap.legacyActive, 0, 'tracked active positions must not become migration GAP');

// Simulate restart: persisted tracked flags and ledger remain intact.
continuity.ensure();
snap = continuity.snapshot(h.state.aktifPozisyonlar);
assert.equal(snap.current.openedPremier, 1);
assert.equal(snap.legacyActive, 0, 'Premier active must survive restart without becoming GAP');

continuity.trackAtClose(premier, { scientific: true });
h.state.aktifPozisyonlar = [shadow];
continuity.trackAtClose(shadow, { restartGap: true, scientific: false });
h.state.aktifPozisyonlar = [];
snap = continuity.snapshot([]);
assert.equal(snap.current.closed, 2, 'all tracked closes reconcile exact position ledger');
assert.equal(snap.current.closedPremier, 1, 'scientific Premier close is learning evidence');
assert.equal(snap.current.closedShadow, 0, 'GAP close must not become shadow learning evidence');
assert.equal(snap.current.closedRestartGap, 1);
assert.equal(snap.difference, 0);
assert.equal(snap.reconciled, true);
console.log('✅ v5.0.7 learning telemetry consistency passed | Premier+Shadow total, GAP excluded, restart identity preserved');
