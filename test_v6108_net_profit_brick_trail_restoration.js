'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6108-'));
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
  const evo = require('./74_st2_renko_exit_evolution.js');
  assert.strictEqual(ayarlar.renkoCikisCanliModu, 'SAFE_COMMISSION_BRICK_TRAIL');
  assert.strictEqual(evo.BRICK_LIVE_MODE(), true);
  assert(evo.SAFE_FLOOR_MIN() >= evo.ROUND_TRIP_COMMISSION_PCT() + evo.MIN_NET_PROFIT_PCT());

  // Önceden öğrenilmiş tuğla mesafesi canlı pozisyona gerçekten bağlanmalıdır.
  fs.writeFileSync(evo.STATE_FILE, JSON.stringify({
    version: 'PREVIOUS', processedIds: {}, health: {},
    profiles: {
      'LONG|GGGG': {
        closed: 12,
        activeTrail: 1.25,
        candidates: {}, brickNetCandidates: {},
        brickEconomy: { economyEligible: true, samples: 12, trail: 1.25, net: 2.4, pf: 1.8, expectancy: 0.2 }
      }
    }
  }, null, 2));

  const pos = {
    id: 'V6108-LIVE', sym: 'TESTUSDT', yon: 'LONG', girisFiyati: 100, sl: 98,
    breakevenAktif: false, korunanKarYuzdesi: 0,
    executionExitAssignment: { ready: false, activeForPosition: false, samples: 0, reason: 'DNA_EXIT_N0_FALLBACK' },
    girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'GGGG', renkoBoxSize: 0.20 },
    execution: { pricePath: [] }
  };
  const assignment = evo.assign(pos);
  assert.strictEqual(assignment.assignedTrailBricks, 1.25, 'öğrenilmiş tuğla mesafesi canlı pozisyona bağlanmadı');
  assert.strictEqual(assignment.liveExitMode, 'SAFE_COMMISSION_BRICK_TRAIL');
  assert.strictEqual(assignment.atrMfeExecution, 'SHADOW_REPLAY_ONLY');

  const before = evo.update(pos, 100.30);
  assert.strictEqual(before.active, false);
  assert.strictEqual(before.reason, 'COMMISSION_SAFE_PROTECTION_NOT_READY');

  // Komisyon sonrası güvenli taban oluşunca canlı Renko tuğla takibi devralır.
  pos.breakevenAktif = true;
  pos.korunanKarYuzdesi = 0.12;
  pos.execution.pricePath.push({ price: 100.40, pnlPct: 0.40, atrPct: 0.01, at: Date.now() });
  const activated = evo.update(pos, 100.40);
  assert.strictEqual(activated.active, true);
  assert.strictEqual(activated.justActivated, true);
  assert(pos.sl >= 100.149999, `komisyon sonrası net pozitif taban korunmadı: ${pos.sl}`);
  assert.strictEqual(pos.renkoProtectionState, 'RENKO_STOP_GUNCELLENDI');

  // ATR çok küçük ve MFE profili çok sıkı olsa bile canlı stop yalnız tuğla mesafesine göre ilerlemeli.
  assignment.assignedAtrMultiplier = 0.30;
  assignment.assignedCaptureRatio = 0.95;
  pos.execution.pricePath.push({ price: 101.00, pnlPct: 1.00, atrPct: 0.01, at: Date.now() + 1 });
  const moved = evo.update(pos, 101.00);
  const expectedBrickStop = 101.00 - 0.20 * 1.25;
  assert(Math.abs(moved.brickStop - expectedBrickStop) < 1e-9, 'zirveden öğrenilmiş tuğla stopu yanlış');
  assert(Math.abs(pos.sl - expectedBrickStop) < 1e-9, 'ATR/MFE canlı stopu tuğla modelinden saptırdı');
  assert.strictEqual(moved.source, 'RENKO_TUGLA_TAKIP');

  // Geri çekilmede stop gevşemez.
  const oldStop = pos.sl;
  const pullback = evo.update(pos, 100.80);
  assert.strictEqual(pos.sl, oldStop);
  assert.strictEqual(pullback.changed, false);

  // Kâr korumasına hiç ulaşmayan kapanış Exit öğrenmesini yapay biçimde büyütmemeli.
  const noActivation = {
    id: 'V6108-NO-ACT', sym: 'NOACTUSDT', yon: 'LONG', girisFiyati: 100, sl: 98,
    girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 0.20 },
    execution: { pricePath: [{ price: 99.5, pnlPct: -0.5, at: Date.now() }] }
  };
  const rejected = evo.close(noActivation, { exitPrice: 99.5, reason: 'Sanal SL' });
  assert.strictEqual(rejected.accepted, false);
  assert.strictEqual(rejected.reason, 'NOT_ACTIVATED');

  // Aktif korumalı kapanış net komisyon ekonomisi havuzuna yazılır.
  pos.execution.pricePath.push({ price: 100.75, pnlPct: 0.75, atrPct: 0.01, at: Date.now() + 2 });
  const accepted = evo.close(pos, { exitPrice: oldStop, reason: 'İz Süren Stop', fiyatKarYuzdesi: 0.75 });
  assert.strictEqual(accepted.accepted, true);
  const saved = JSON.parse(fs.readFileSync(evo.STATE_FILE, 'utf8'));
  assert.strictEqual(saved.health.notActivated, 1);
  assert.strictEqual(saved.profiles['LONG|GGGG'].brickNetCandidates['1.25'].samples, 1);
  assert(saved.profiles['LONG|GGGG'].brickNetCandidates['1.25'].net < saved.profiles['LONG|GGGG'].candidates['1.25'].net,
    'komisyon net ekonomi replayinden düşülmedi');

  // Rapor katmanları birbirine karıştırılmamalı: DNA Exit gölge, canlı Renko ayrı.
  const reportSource = fs.readFileSync(path.join(__dirname, '2_rapor.js'), 'utf8');
  assert(reportSource.includes('DNA Exit Replay (GÖLGE)'));
  assert(reportSource.includes('CANLI RENKO KÂR TAKİBİ'));
  assert(reportSource.includes('Entry Evolution'));
  assert(reportSource.includes('Uygulama ${Number(evo.decisionChain?.entry?.matched'));

  const motorSource = fs.readFileSync(path.join(__dirname, 'motor.js'), 'utf8');
  assert(motorSource.includes('RENKO_EXIT_ASSIGN_ERROR'), 'sanal pozisyonda Renko Exit ataması scoreboard öncesinde dondurulmuyor');
  assert(motorSource.indexOf('renkoExitEvolution.assign(yeniPozisyon)') < motorSource.indexOf('exitMethodScoreboard.open(yeniPozisyon)'), 'sanal pozisyon ataması scoreboard sonrasına kalmış');

  const entrySource = fs.readFileSync(path.join(__dirname, '72_st2_renko_entry.js'), 'utf8');
  assert(entrySource.includes('const adaptiveEntryDecision = aktifTuglaKarari(pusu);'), 'Entry Evolution seçimi pusu tetik fiyatına tekil bağlanmamış');
  assert(entrySource.includes('renkoEntryBrickDistance: selectedEntryBrick'), 'seçilen giriş tuğlası pozisyona dondurulmuyor');

  const scoreboard = require('./52_exit_method_scoreboard.js');
  const method = scoreboard.methodFor(pos);
  assert.strictEqual(method.id, 'RENKO_COMMISSION_SAFE_BRICK_TRAIL');
  assert.strictEqual(method.label, 'Komisyon Güvenli Renko Tuğla Takibi');

  console.log('✅ v6.10.8 net-profit brick trail restoration + Entry binding proof + non-activated replay exclusion passed');
} finally {
  Module._load = originalLoad;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
