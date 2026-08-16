'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6111-'));
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

  assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon, 20);
  assert.strictEqual(ayarlar.renkoCikisStopGuncellemeAdimTugla, 0.50);
  assert.strictEqual(ayarlar.renkoCikisGuvenliKarTabaniYuzde, 0.40);
  assert.strictEqual(ayarlar.renkoCikisMinimumNetKarYuzde, 0.30);
  assert.strictEqual(exit.SAFE_FLOOR_MIN(), 0.40);
  assert(Math.abs(exit.SAFE_FLOOR_MIN() - (exit.ROUND_TRIP_COMMISSION_PCT() + exit.MIN_NET_PROFIT_PCT())) < 1e-9);

  // v6.11.0'dan bekleyen açık pozisyon: öğrenilmiş trail donuk kalır; güvenlik tabanı/adımı yükseltilir.
  const waiting = {
    sanalOrderId: 'V6111-WAITING', sym: 'JASMYUSDT', yon: 'LONG', girisFiyati: 100, sl: 98.5,
    breakevenAktif: false, korunanKarYuzdesi: 0,
    girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 1, renkoEntryBrickDistance: 0.75 },
    renkoExitAssignment: {
      patternKey: 'LONG|RRRR', assignedTrailBricks: 1.75, assignedActivationProfitPct: 0.80,
      assignedSafeFloorPct: 0.15, assignedStopUpdateStepBricks: 1.00,
      assignedTakeoverPct: 0.64, assignedAtrMultiplier: 1.33, assignedCaptureRatio: 0.45,
      liveExitMode: 'SAFE_COMMISSION_BRICK_TRAIL', assignmentSchema: 'V6110_POSITION_FROZEN'
    }
  };
  const migrated = exit.assign(waiting);
  assert.strictEqual(migrated.assignedTrailBricks, 1.75, 'bekleyen pozisyonun öğrenilmiş trail mesafesi değişti');
  assert.strictEqual(migrated.assignedSafeFloorPct, 0.40);
  assert.strictEqual(migrated.assignedMinimumNetProfitPct, 0.30);
  assert.strictEqual(migrated.assignedStopUpdateStepBricks, 0.50);
  assert.strictEqual(migrated.safetyPolicySchema, 'V6112_DIRECT_PROFIT_FLOOR');
  assert(migrated.safetyPolicyMigratedAt, 'bekleyen açık pozisyon güvenlik göçü kaydedilmedi');

  // Takeover'ı zaten aktif eski pozisyon geriye dönük sıkılaştırılmaz; frozen politika korunur.
  const activeLegacy = {
    sanalOrderId: 'V6111-ACTIVE-LEGACY', sym: 'OLDUSDT', yon: 'LONG', girisFiyati: 100, sl: 100.15,
    breakevenAktif: true, korunanKarYuzdesi: 0.15, renkoExitActivated: true,
    renkoExitPeak: 100.80, renkoExitTrailAnchor: 100.80, renkoExitFirstProtectionStop: 100.15,
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
  assert.strictEqual(preserved.profitFloorPolicy, 'FROZEN_ACTIVE_POSITION_POLICY');
  const activeTick = exit.updateBrick(activeLegacy, 100.50);
  assert.strictEqual(activeTick.active, true, 'aktif eski pozisyon yeni taban nedeniyle pasife düştü');
  assert.strictEqual(activeLegacy.sl, 100.15, 'aktif eski pozisyon geriye dönük sıkılaştırıldı');

  // Güncel V6112 doğrudan ekonomi: +%0.25 erken taban, +%0.50 güçlü taban, +%0.60 Renko aktivasyonu.
  let pre = exit.updateBrick(waiting, 100.24);
  assert.strictEqual(pre.active, false);
  assert.strictEqual(pre.reason, 'CURRENT_PRICE_BELOW_DIRECT_FLOOR_ARM_THRESHOLD');
  assert.strictEqual(waiting.sl, 98.5);

  pre = exit.updateBrick(waiting, 100.25);
  assert.strictEqual(pre.active, true);
  assert.strictEqual(pre.justEarlyFloorLocked, true);
  assert(Math.abs(waiting.sl - 100.20) < 1e-9);

  pre = exit.updateBrick(waiting, 100.50);
  assert.strictEqual(pre.active, true);
  assert.strictEqual(pre.justFloorLocked, true);
  assert(Math.abs(waiting.sl - 100.40) < 1e-9);

  const activated = exit.updateBrick(waiting, 100.60);
  assert.strictEqual(activated.active, true);
  assert.strictEqual(activated.justActivated, true);
  assert.strictEqual(waiting.renkoExitActivated, true);

  // 0.50T tamamlanmadan stop oynamaz; büyüdükçe dondurulmuş trail ilerler ve geri gevşemez.
  const floorStop = waiting.sl;
  const noise = exit.updateBrick(waiting, 100.99);
  assert.strictEqual(noise.changed, false);
  assert.strictEqual(waiting.sl, floorStop);
  const halfBrick = exit.updateBrick(waiting, 101.11);
  assert(halfBrick.advancedBricks >= 0.50);
  const runner = exit.updateBrick(waiting, 103.11);
  assert(runner.changed, 'büyüyen pozisyonda öğrenilmiş trail stopu ilerlemedi');
  const tightened = waiting.sl;
  exit.updateBrick(waiting, 102.20);
  assert.strictEqual(waiting.sl, tightened, 'geri çekilmede stop gevşedi');

  const text = exit.takeoverText(waiting);
  assert(text.includes('Erken ekonomi: +%0.25 → stop +%0.20'));
  assert(text.includes('Brüt güçlü kâr tabanı: %0.40'));
  assert(text.includes('Hedef minimum net: %0.30'));
  assert(text.includes('Stop güncelleme adımı: 0.50'));

  const report = fs.readFileSync(path.join(__dirname, '2_rapor.js'), 'utf8');
  assert(report.includes('Brüt taban %'));
  assert(report.includes('Min net %'));
  assert(!report.includes('Net taban %${Number(atama.assignedSafeFloorPct)'));
  assert.strictEqual(version.botSurumu, '6.13.5-R25.5-STARTUP-FAST-FAIL-REPAIR-N5-20SLOT-20USDT');
  assert.strictEqual(exit.VERSION, 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT');

  console.log('✅ v6.11.1 minimum net +%0.30 floor first, frozen brick trail second, 0.50T update and current 20-slot risk settings passed');
} finally {
  Module._load = originalLoad;
  fs.rmSync(tmp, { recursive: true, force: true });
}
