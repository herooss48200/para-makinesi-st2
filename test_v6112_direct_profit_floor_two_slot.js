'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6112-'));
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

  assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon, 10, 'gerçek pozisyon limiti R24 sözleşmesinde 10 olmalı');
  assert.strictEqual(ayarlar.renkoCikisErkenEkonomiTetikYuzde, 0.25);
  assert.strictEqual(ayarlar.renkoCikisErkenEkonomiTabanYuzde, 0.20);
  assert.strictEqual(ayarlar.renkoCikisErkenEkonomiMinimumNetKarYuzde, 0.10);
  assert.strictEqual(ayarlar.renkoCikisKarTabaniAktivasyonYuzde, 0.50);
  assert.strictEqual(ayarlar.renkoCikisCanliAktivasyonYuzde, 0.60);
  assert.strictEqual(ayarlar.renkoCikisGuvenliKarTabaniYuzde, 0.40);
  assert.strictEqual(ayarlar.renkoCikisMinimumNetKarYuzde, 0.30);
  assert.strictEqual(ayarlar.renkoCikisStopGuncellemeAdimTugla, 0.50);
  assert.strictEqual(exit.EARLY_FLOOR_ARM_PROFIT_PCT(), 0.25);
  assert.strictEqual(exit.EARLY_SAFE_FLOOR_MIN(), 0.20);
  assert.strictEqual(exit.FLOOR_ARM_PROFIT_PCT(), 0.50);
  assert.strictEqual(exit.LIVE_ACTIVATION_PROFIT_PCT(), 0.60);
  assert.strictEqual(exit.SAFE_FLOOR_MIN(), 0.40);

  // Canlı aktivasyon tp adımı × kademe değildir; bu ayarlar değişse bile doğrudan %0.60 kalır.
  const oldStep = ayarlar.tpAdimYuzdesi;
  const oldStage = ayarlar.breakevenTetikKademe;
  ayarlar.tpAdimYuzdesi = 0.20;
  ayarlar.breakevenTetikKademe = 9;
  assert.strictEqual(exit.activationProfitPctFor({}), 0.60, '2 katı/kademe bağı canlı aktivasyonu değiştirdi');
  ayarlar.tpAdimYuzdesi = oldStep;
  ayarlar.breakevenTetikKademe = oldStage;

  const waiting = {
    sanalOrderId: 'V6112-WAITING', sym: 'JASMYUSDT', yon: 'LONG', girisFiyati: 100, sl: 98.5,
    breakevenAktif: false, korunanKarYuzdesi: 0,
    girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 1, renkoEntryBrickDistance: 0.75 },
    renkoExitAssignment: {
      patternKey: 'LONG|RRRR', assignedTrailBricks: 1.75, assignedActivationProfitPct: 0.80,
      assignedSafeFloorPct: 0.15, assignedStopUpdateStepBricks: 1.00,
      assignedTakeoverPct: 0.27, assignedAtrMultiplier: 1.33, assignedCaptureRatio: 0.45,
      liveExitMode: 'SAFE_COMMISSION_BRICK_TRAIL', assignmentSchema: 'V6110_POSITION_FROZEN'
    }
  };
  const migrated = exit.assign(waiting);
  assert.strictEqual(migrated.assignedTrailBricks, 1.75, 'öğrenilmiş trail mesafesi değişti');
  assert.strictEqual(migrated.assignedEarlyFloorArmProfitPct, 0.25);
  assert.strictEqual(migrated.assignedEarlySafeFloorPct, 0.20);
  assert.strictEqual(migrated.assignedEarlyMinimumNetProfitPct, 0.10);
  assert.strictEqual(migrated.assignedFloorArmProfitPct, 0.50);
  assert.strictEqual(migrated.assignedActivationProfitPct, 0.60, 'bekleyen pozisyon doğrudan aktivasyona taşınmadı');
  assert.strictEqual(migrated.assignedSafeFloorPct, 0.40, 'K1 güvenli tabanı %0.40 altına inmemeli');
  assert.strictEqual(migrated.assignedMinimumNetProfitPct, 0.30);
  assert.strictEqual(migrated.assignedStopUpdateStepBricks, 0.50);
  assert.strictEqual(migrated.safetyPolicySchema, 'V6112_DIRECT_PROFIT_FLOOR');

  // K0: +%0.25 görülmeden başlangıç stopu korunur.
  let r = exit.updateBrick(waiting, 100.24);
  assert.strictEqual(r.active, false);
  assert.strictEqual(r.reason, 'CURRENT_PRICE_BELOW_DIRECT_FLOOR_ARM_THRESHOLD');
  assert.strictEqual(waiting.sl, 98.5);

  // K0.5: +%0.25'te erken ekonomi tabanı +%0.20'ye taşınır; K1/Renko henüz yoktur.
  r = exit.updateBrick(waiting, 100.25);
  assert.strictEqual(r.active, true);
  assert.strictEqual(r.justEarlyFloorLocked, true);
  assert.strictEqual(r.changed, true);
  assert.strictEqual(waiting.renkoEarlyEconomyFloorLocked, true);
  assert.strictEqual(waiting.renkoProfitFloorLocked, undefined);
  assert(Math.abs(waiting.sl - 100.20) < 1e-9, `erken ekonomi tabanı yanlış: ${waiting.sl}`);
  assert.strictEqual(waiting.renkoEarlyEconomyFloorMinimumNetPct, 0.10);

  r = exit.updateBrick(waiting, 100.49);
  assert.strictEqual(r.active, true);
  assert.strictEqual(waiting.sl, 100.20);
  assert.strictEqual(waiting.renkoExitActivated, undefined);

  // K1: +%0.50'de eski komisyon-güvenli güçlü taban +%0.40'a yükselir.
  r = exit.updateBrick(waiting, 100.50);
  assert.strictEqual(r.active, true);
  assert.strictEqual(r.justFloorLocked, true);
  assert.strictEqual(r.justActivated, false);
  assert.strictEqual(waiting.renkoProfitFloorLocked, true);
  assert(Math.abs(waiting.sl - 100.40) < 1e-9, `güçlü kâr tabanı yanlış: ${waiting.sl}`);
  assert.strictEqual(waiting.renkoProfitFloorMinimumNetPct, 0.30);

  r = exit.updateBrick(waiting, 100.55);
  assert.strictEqual(r.active, true);
  assert.strictEqual(r.justActivated, false);
  assert.strictEqual(r.changed, false);
  assert.strictEqual(waiting.sl, 100.40);

  // K2: +%0.60 aktivasyonda dondurulmuş Renko trail başlar.
  r = exit.updateBrick(waiting, 100.60);
  assert.strictEqual(r.active, true);
  assert.strictEqual(r.justActivated, true);
  assert.strictEqual(waiting.renkoExitActivated, true);
  assert(waiting.sl >= 100.40);

  // 0.50T tamamlanmadan stop oynamaz; büyüdükçe dondurulmuş trail ilerler, geri gevşemez.
  const floorStop = waiting.sl;
  const noise = exit.updateBrick(waiting, 100.99);
  assert.strictEqual(noise.changed, false);
  assert.strictEqual(waiting.sl, floorStop);
  const half = exit.updateBrick(waiting, 101.11);
  assert(half.advancedBricks >= 0.50);
  const runner = exit.updateBrick(waiting, 103.11);
  assert(runner.changed, 'büyüyen pozisyonda trail stopu ilerlemedi');
  const tightened = waiting.sl;
  exit.updateBrick(waiting, 102.20);
  assert.strictEqual(waiting.sl, tightened, 'geri çekilmede stop gevşedi');

  // Takeover'ı aktif eski pozisyon geriye dönük yeni politika ile sıkılaştırılmaz.
  const activeLegacy = {
    sanalOrderId: 'V6112-ACTIVE-LEGACY', sym: 'OLDUSDT', yon: 'LONG', girisFiyati: 100, sl: 100.15,
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
  assert.strictEqual(preserved.assignedActivationProfitPct, 0.80);
  const legacyTick = exit.updateBrick(activeLegacy, 100.50);
  assert.strictEqual(legacyTick.active, true);
  assert.strictEqual(activeLegacy.sl, 100.15);

  const text = exit.takeoverText(waiting);
  assert(text.includes('Erken ekonomi: +%0.25 → stop +%0.20'));
  assert(text.includes('Güçlü taban kilitleme eşiği: %0.50'));
  assert(text.includes('Brüt güçlü kâr tabanı: %0.40'));
  assert(text.includes('Hedef minimum net: %0.30'));
  assert(text.includes('Doğrudan Renko aktivasyonu: %0.60'));
  assert(text.includes('Stop güncelleme adımı: 0.50'));

  assert.strictEqual(version.botSurumu, '6.13.5-R24.2-UNIFIED-PERCENT-ECONOMY-10SLOT-20USDT-LIVE-COHORTS-POSTCLOSE-24H');
  assert.strictEqual(exit.VERSION, 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT');
  console.log('✅ v6.11.2 direct floor/activation, no 2x rule, frozen brick trail and configurable 2-slot passed');
} finally {
  Module._load = originalLoad;
  fs.rmSync(tmp, { recursive: true, force: true });
}
