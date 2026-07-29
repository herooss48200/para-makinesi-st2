'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v661-'));
process.env.AGROS_DATA_DIR = tmp;

const labPremier = require('./62_lab_premier_league.js');
const renkoExit = require('./74_st2_renko_exit_evolution.js');
const globalOptimizer = require('./78_st2_global_historical_reconciliation.js');
const reportSource = fs.readFileSync(path.join(__dirname, '2_rapor.js'), 'utf8');
const motorSource = fs.readFileSync(path.join(__dirname, 'motor.js'), 'utf8');

// 1) RENKO_PATTERN_PREMIER kapanışı ana Premier raporuna dahil olmalı.
const pos = {
  sanal: true,
  sym: 'ERAUSDT',
  yon: 'LONG',
  sanalOrderId: 'V661-ERA-1',
  acilisZamani: Date.now() - 300000,
  labPremierDecision: {
    observationEligible: true,
    upperLayerIncluded: true,
    premierTrack: labPremier.TRACK.RENKO,
    labLeague: 'PREMIER',
    proofLevel: 'HISTORICAL_ADAPTIVE_RENKO_PREMIER',
    labKey: 'YON=LONG|BTC=0100|COIN=1000|BB=UST',
    labDnaId: 232,
    labDnaLabel: 'LAB #232',
    familyDnaLabel: 'DNA #366',
    exitValidated: false
  }
};
assert(labPremier.snapshot(pos), 'Renko Premier snapshot oluşturulmalı');
assert(labPremier.close(pos, { net: 7.6259, commission: 0.1, outcome: 'TP', reason: 'RENKO_TRAIL' }), 'Renko Premier kapanışı kabul edilmeli');
const model = labPremier.summaryModel([]);
assert.strictEqual(model.aggregate.closed, 1, 'Renko Premier kapanışı ana Premier N sayacına dahil edilmeli');
assert.strictEqual(Number(model.aggregate.net.toFixed(4)), 7.6259, 'Renko Premier neti ana Premier kasasına dahil edilmeli');

// 2) K3 stop hareketinden sonra sonraki döngüde K2'ye geri düşmemeli.
const p = {
  sym: 'KAITOUSDT', yon: 'LONG', girisFiyati: 100, sl: 100.12,
  breakevenAktif: true, korunanKarYuzdesi: 0.12,
  girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 1 }
};
renkoExit.assign(p);
let u = renkoExit.update(p, 103.0);
assert.strictEqual(u.active, true);
assert.strictEqual(p.renkoProtectionStage, 'K3', 'İlk stop hareketi K3 olmalı');
const movedStop = p.sl;
u = renkoExit.update(p, 103.0);
assert.strictEqual(u.changed, false);
assert.strictEqual(p.sl, movedStop);
assert.strictEqual(p.renkoProtectionStage, 'K3', 'K3 koruma sonraki döngüde K2’ye gerilememeli');
assert.strictEqual(p.renkoProtectionState, 'RENKO_STOP_KORUNUYOR');
assert(reportSource.includes("RENKO_STOP_KORUNUYOR: { stage: 'K3'"), 'Rapor K3 durumunu tek kaynaktan göstermeli');

// 3) Global optimizer canlı Trade Engine'den fail-closed ayrılmalı.
assert.strictEqual(globalOptimizer.EXECUTION_POLICY.mode, 'SHADOW_ONLY');
assert.strictEqual(globalOptimizer.EXECUTION_POLICY.liveGateAuthorized, false);
assert.strictEqual(globalOptimizer.EXECUTION_POLICY.tradeEngineWritable, false);
assert(!motorSource.includes("require('./78_st2_global_historical_reconciliation.js')"), 'Trade Engine global optimizerı doğrudan yüklememeli');
const advisory = globalOptimizer.sourceDecision('BTCUSDT', 'LONG', 'RRRR');
assert.strictEqual(advisory.advisoryOnly, true);
assert.strictEqual(advisory.liveExecutionAuthorized, false);
assert(globalOptimizer.telegram().includes('DENEYSEL SHADOW-ONLY'));
assert(globalOptimizer.telegram().includes('Canlı giriş filtresi değildir'));

console.log('✅ v6.6.1 Premier truth + persistent K3 + Shadow optimizer lock passed');
