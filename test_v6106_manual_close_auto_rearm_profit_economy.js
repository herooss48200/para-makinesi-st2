'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6106-'));
process.env.AGROS_DATA_DIR = tempDir;

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
  const evolution = require('./74_st2_renko_exit_evolution.js');
  ayarlar.renkoCikisCanliModu = 'ADAPTIVE_ATR_MFE';

  assert.strictEqual(evolution.MIN_ATR(), 1.25, 'ATR alt sınırı ekonomi korumasına yükselmedi');
  assert.strictEqual(evolution.MAX_CAPTURE(), 0.70, 'MFE capture üst sınırı %70 değil');
  assert.strictEqual(evolution.MFE_ARM_MULTIPLIER(), 2, 'runner aktivasyonu takeover x2 değil');

  const pos = {
    sym: 'TESTUSDT', yon: 'LONG', girisFiyati: 100, sl: 98,
    girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'GGGG', renkoBoxSize: 0.05 },
    execution: { pricePath: [{ price: 100, pnlPct: 0, atrPct: 0.05, at: Date.now() }] },
    renkoExitAssignment: {
      assignedTrailBricks: 1,
      assignedTakeoverPct: 0.27,
      assignedAtrMultiplier: 1.05,
      assignedCaptureRatio: 0.87,
      assignedSafeFloorPct: 0.15,
      profileSamples: 46,
      profileConfidence: 0.88,
      takeoverSource: 'ONLINE_LEARNED_PROFILE',
      status: 'WAITING_TAKEOVER'
    }
  };

  const repaired = evolution.assign(pos);
  assert(repaired.economyRepairMigratedAt, 'eski sıkı profil migrate edilmedi');
  assert(repaired.assignedAtrMultiplier >= 1.25, 'eski ATR 1.05× korunmaya devam etti');
  assert(repaired.assignedCaptureRatio <= 0.70, 'eski MFE %87 korunmaya devam etti');
  assert(repaired.assignedTakeoverPct >= 0.40, 'güvenli fallback takeover eşiği uygulanmadı');

  // Takeover anında sadece güvenli +%0.15 tabanı çalışır; ATR/MFE runner oluşmadan sıkılaşmaz.
  pos.execution.pricePath.push({ price: 100.40, pnlPct: 0.40, atrPct: 0.05, at: Date.now() + 1 });
  const takeover = evolution.update(pos, 100.40);
  assert.strictEqual(takeover.active, true);
  assert.strictEqual(takeover.justActivated, true);
  assert(Math.abs(pos.sl - 100.15) < 1e-9, `güvenli kâr tabanı yanlış: ${pos.sl}`);
  assert.strictEqual(takeover.atrStop, null, 'runner oluşmadan ATR stop devreye girdi');
  assert.strictEqual(takeover.mfeFloor, null, 'runner oluşmadan MFE stop devreye girdi');

  pos.execution.pricePath.push({ price: 100.70, pnlPct: 0.70, atrPct: 0.05, at: Date.now() + 2 });
  const breathing = evolution.update(pos, 100.70);
  assert.strictEqual(breathing.atrStop, null, 'takeover sonrası nefes bölgesinde ATR stop devreye girdi');
  assert.strictEqual(breathing.mfeFloor, null, 'takeover sonrası nefes bölgesinde MFE stop devreye girdi');
  assert(Math.abs(pos.sl - 100.15) < 1e-9, 'nefes bölgesinde güvenli taban gereksiz sıkılaştı');

  // Peak %1.00 olduğunda runner aktif olur; ATR çok küçük olsa bile stop peak'in %70'inden sıkı olamaz.
  pos.execution.pricePath.push({ price: 101.00, pnlPct: 1.00, atrPct: 0.05, at: Date.now() + 3 });
  const runner = evolution.update(pos, 101.00);
  assert(runner.atrStop > 0, 'runner aşamasında ATR stop üretilmedi');
  assert(runner.mfeFloor > 0, 'runner aşamasında MFE koruması üretilmedi');
  assert(runner.effective <= 100.7000000001, `stop zirve kârın %70'inden sıkı: ${runner.effective}`);
  assert(runner.effective >= 100.54, 'runner stopu beklenenden fazla gevşek');

  // Replay ekonomisi komisyon sonrası değerlendirilir ve runner nefes alanı canlıyla aynıdır.
  const replay = evolution.adaptiveReplay([
    { price: 100.40, pnlPct: 0.40, atrPct: 0.05 },
    { price: 100.70, pnlPct: 0.70, atrPct: 0.05 },
    { price: 101.00, pnlPct: 1.00, atrPct: 0.05 },
    { price: 100.70, pnlPct: 0.70, atrPct: 0.05 }
  ], 'LONG', 100, 0.40, 1.25, 0.55, 100.70, 0.15);
  assert(Math.abs(replay.grossPct - 0.70) < 1e-9, `replay gross yanlış: ${replay.grossPct}`);
  assert(Math.abs(replay.pct - (0.70 - evolution.ROUND_TRIP_COMMISSION_PCT())) < 1e-9, 'replay net komisyonu düşmedi');
  assert(replay.capture <= 70.0000001, 'replay peak capture ekonomi üst sınırını aştı');

  // Tek/az örnek veya negatif ekonomi artık canlı takeover profili olamaz.
  assert.strictEqual(evolution.eligible({ samples: 4, tp: 4, sl: 0, net: 1, grossProfit: 1, grossLoss: 0 }), false);
  assert.strictEqual(evolution.eligible({ samples: 5, tp: 2, sl: 3, net: -0.1, grossProfit: 1, grossLoss: 1.1 }), false);
  assert.strictEqual(evolution.eligible({ samples: 5, tp: 3, sl: 2, net: 1, grossProfit: 2, grossLoss: 1 }), true);

  const tinyHighCapture = { samples: 10, tp: 8, sl: 2, net: 0.40, grossProfit: 0.80, grossLoss: 0.40, emaNet: 0.04, emaCapture: 92, emaGiveback: 0.01, mfeCaptureSum: 920, givebackSum: 0.1 };
  const runnerEconomy = { samples: 10, tp: 6, sl: 4, net: 2.00, grossProfit: 3.00, grossLoss: 1.00, emaNet: 0.20, emaCapture: 62, emaGiveback: 0.25, mfeCaptureSum: 620, givebackSum: 2.5 };
  assert(evolution.adaptiveScore(runnerEconomy) > evolution.adaptiveScore(tinyHighCapture), 'yüksek capture küçük kârı runner ekonomisinin önünde seçiliyor');

  const positionSource = fs.readFileSync(path.join(__dirname, '4_pozisyon.js'), 'utf8');
  const lifecycleSource = fs.readFileSync(path.join(__dirname, '86_st2_close_lifecycle.js'), 'utf8');
  assert(positionSource.includes('closeLifecycle.commitRealClose'), 'gerçek kapanış kritik commit bariyerine bağlanmadı');
  assert(lifecycleSource.includes('manualCloseLocks'), 'aynı sembol/yön manuel kapanış cooldown koruması kayboldu');
  const executionSource = fs.readFileSync(path.join(__dirname, '85_st2_real_order_execution.js'), 'utf8');
  assert(executionSource.includes('MANUAL_EXTERNAL_CLOSE_AUTO_REARM'), 'manuel kapanış auto-rearm audit eksik');
  assert(!executionSource.includes("setGlobalBlock(MANUAL_REARM_BLOCK"), 'manuel kapanış hâlâ hesap-geneli global block kuruyor');

  console.log('✅ v6.10.6 manual-close auto-rearm + safe floor + runner breathing zone + net-economy replay passed');
} finally {
  Module._load = originalLoad;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
