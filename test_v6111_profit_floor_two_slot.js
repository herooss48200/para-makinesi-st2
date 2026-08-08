'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6111-compat-'));
process.env.AGROS_DATA_DIR = tmp;
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  if (request === 'axios') return { create: () => ({}), get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (request === 'technicalindicators') return {};
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const ayarlar = require('./ayarlar.js');
  const exit = require('./74_st2_renko_exit_evolution.js');
  const version = require('./versiyon.js');

  // v6.11.1'den korunması gereken ekonomik güvenlik invariant'ları.
  assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon, 10, 'güncel configurable gerçek pozisyon limiti korunmalı');
  assert.strictEqual(ayarlar.renkoCikisStopGuncellemeAdimTugla, 0.50);
  assert.strictEqual(ayarlar.renkoCikisGuvenliKarTabaniYuzde, 0.40);
  assert.strictEqual(ayarlar.renkoCikisMinimumNetKarYuzde, 0.30);
  assert.strictEqual(exit.SAFE_FLOOR_MIN(), 0.40);

  // Bekleyen legacy pozisyon güncel güvenlik politikasına taşınırken öğrenilmiş trail mesafesi korunur.
  const waiting = {
    sanalOrderId: 'V6111-COMPAT-WAITING', sym: 'JASMYUSDT', yon: 'LONG', girisFiyati: 100, sl: 98.5,
    girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 1, renkoEntryBrickDistance: 0.75 },
    renkoExitAssignment: {
      patternKey: 'LONG|RRRR', assignedTrailBricks: 1.75, assignedActivationProfitPct: 0.80,
      assignedSafeFloorPct: 0.15, assignedStopUpdateStepBricks: 1.00,
      assignedTakeoverPct: 0.64, assignedAtrMultiplier: 1.33, assignedCaptureRatio: 0.45,
      liveExitMode: 'SAFE_COMMISSION_BRICK_TRAIL', assignmentSchema: 'V6110_POSITION_FROZEN'
    }
  };
  const migrated = exit.assign(waiting);
  assert.strictEqual(migrated.assignedTrailBricks, 1.75, 'öğrenilmiş trail mesafesi değişti');
  assert.strictEqual(migrated.assignedSafeFloorPct, 0.40);
  assert.strictEqual(migrated.assignedMinimumNetProfitPct, 0.30);
  assert.strictEqual(migrated.assignedStopUpdateStepBricks, 0.50);
  assert.strictEqual(migrated.safetyPolicySchema, 'V6112_DIRECT_PROFIT_FLOOR');

  // Zaten aktif/frozen legacy pozisyon geriye dönük sıkılaştırılmaz.
  const activeLegacy = {
    sanalOrderId: 'V6111-COMPAT-ACTIVE', sym: 'OLDUSDT', yon: 'LONG', girisFiyati: 100, sl: 100.15,
    renkoExitActivated: true, renkoExitPeak: 100.80, renkoExitTrailAnchor: 100.80,
    renkoExitFirstProtectionStop: 100.15,
    girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 1, renkoEntryBrickDistance: 0.75 },
    renkoExitAssignment: {
      patternKey: 'LONG|RRRR', assignedTrailBricks: 1.75, assignedActivationProfitPct: 0.80,
      assignedSafeFloorPct: 0.15, assignedStopUpdateStepBricks: 1.00,
      assignedTakeoverPct: 0.64, assignedAtrMultiplier: 1.33, assignedCaptureRatio: 0.45,
      liveExitMode: 'SAFE_COMMISSION_BRICK_TRAIL', assignmentSchema: 'V6110_POSITION_FROZEN', status: 'ACTIVE'
    }
  };
  const preserved = exit.assign(activeLegacy);
  assert.strictEqual(preserved.assignedSafeFloorPct, 0.15);
  assert.strictEqual(preserved.assignedStopUpdateStepBricks, 1.00);
  const tick = exit.updateBrick(activeLegacy, 100.50);
  assert.strictEqual(tick.active, true);
  assert.strictEqual(activeLegacy.sl, 100.15, 'aktif legacy pozisyon geriye dönük sıkılaştırıldı');

  const report = fs.readFileSync(path.join(__dirname, '2_rapor.js'), 'utf8');
  assert(report.includes('Min net %'));
  assert.strictEqual(version.botSurumu, '6.13.5-R16-PRICE-FALLBACK-FULL-CHAIN-RECOVERY');
  assert.strictEqual(exit.VERSION, 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT');

  console.log('✅ v6.11.1 legacy profit-floor compatibility passed | floor/net/step invariants + frozen active position preserved under R16');
} finally {
  Module._load = originalLoad;
  fs.rmSync(tmp, { recursive: true, force: true });
}
