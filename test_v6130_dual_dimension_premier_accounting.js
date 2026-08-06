'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6130-accounting-'));
process.env.AGROS_DATA_DIR = tmp;

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  if (request === 'axios') return { create: () => ({}), get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (request === 'technicalindicators') return {};
  return originalLoad.call(this, request, parent, isMain);
};

const h = require('./1_hafiza.js');
h.state.aktifPozisyonlar = [];
h.state.accountingContinuity = null;
h.state.basariOzeti = { toplamAcilanEmir: 0, tp: 0, sl: 0, be: 0 };
h.state.restartGapOzet = { closedQuarantined: 0 };

const accounting = require('./65_accounting_continuity.js');
const realPremier = {
  sym: 'REALPREMIERUSDT', yon: 'LONG', sanal: false, acilisZamani: Date.now(),
  labPremierDecision: { upperLayerIncluded: true, premierTrack: 'RENKO_PATTERN_PREMIER' }
};

assert.strictEqual(accounting.trackAtOpen(realPremier), true);
h.state.aktifPozisyonlar = [realPremier];
let snap = accounting.snapshot(h.state.aktifPozisyonlar);
assert.strictEqual(realPremier.accountingExecutionTrack, 'REAL');
assert.strictEqual(realPremier.accountingScientificTrack, 'PREMIER');
assert.strictEqual(snap.active.real, 1);
assert.strictEqual(snap.active.premier, 1, 'gerçek Premier bilimsel Premier aktif sayacına dahil olmalı');
assert.strictEqual(snap.scientific.activeRealPremier, 1);
assert.strictEqual(snap.scientific.activeVirtualPremier, 0);
assert.strictEqual(snap.scientific.premier.activeScientific, 1);

const league = require('./62_lab_premier_league.js');
let report = league.premierAccounting(h.state.aktifPozisyonlar, { opened: 1, active: 1, closed: 0 });
assert.strictEqual(report.activeScientific, 1, 'Operasyon Merkezi Canlı Premier sayacı gerçek Premieri göstermeli');
assert.strictEqual(report.activeRealPremier, 1);
assert.strictEqual(report.activeVirtualPremier, 0);
assert.strictEqual(report.reconciled, true);

h.state.aktifPozisyonlar = [];
assert.strictEqual(accounting.trackAtClose(realPremier, { scientific: true }), true);
snap = accounting.snapshot([]);
assert.strictEqual(snap.current.closedReal, 1, 'gerçek yürütme kapanışı ayrı sayılmalı');
assert.strictEqual(snap.current.closedScientificPremier, 1, 'aynı kapanış bilimsel Premier olarak da sayılmalı');
assert.strictEqual(snap.scientific.premier.closedScientific, 1);
assert.strictEqual(snap.scientific.premier.activeScientific, 0);

report = league.premierAccounting([], { opened: 1, active: 0, closed: 1, tp: 1, net: 0.5 });
assert.strictEqual(report.activeScientific, 0);
assert.strictEqual(report.closedScientific, 1);
assert.strictEqual(report.reconciled, true);

console.log('✅ v6.13.0 dual-dimension REAL/VIRTUAL + PREMIER/SHADOW accounting passed');
