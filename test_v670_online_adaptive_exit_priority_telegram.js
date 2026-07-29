'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v670-'));
process.env.AGROS_DATA_DIR = tmp;

const evo = require('./74_st2_renko_exit_evolution.js');
assert.strictEqual(evo.VERSION, 'v6.7.0-ONLINE-ADAPTIVE-ATR-CAPTURE');
assert.deepStrictEqual(evo.ATR_CANDIDATES(), [1, 1.25, 1.5, 1.75, 2, 2.5]);
assert.deepStrictEqual(evo.CAPTURE_CANDIDATES(), [0.5, 0.6, 0.7, 0.8, 0.9]);

// Bir bilimsel kapanış bile online profili üretmeli; N5/N10 kapısı beklenmemeli.
const rows = [
  { price: 100.00, pnlPct: 0.00, atrPct: 0.20, ts: 1700000000000 },
  { price: 100.35, pnlPct: 0.35, atrPct: 0.20, ts: 1700000060000 },
  { price: 100.80, pnlPct: 0.80, atrPct: 0.20, ts: 1700000120000 },
  { price: 101.20, pnlPct: 1.20, atrPct: 0.20, ts: 1700000180000 },
  { price: 101.00, pnlPct: 1.00, atrPct: 0.20, ts: 1700000240000 },
  { price: 100.75, pnlPct: 0.75, atrPct: 0.20, ts: 1700000300000 }
];
const closed = {
  sym: 'ONLINEUSDT', yon: 'LONG', girisFiyati: 100,
  sanalOrderId: 'V670-1', acilisZamani: 1700000000000,
  girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 0.20 },
  execution: { pricePath: rows }
};
const learned = evo.close(closed, { exitPrice: 100.75, fiyatKarYuzdesi: 0.75, reason: 'RENKO_TRAIL', restartGap: false });
assert.strictEqual(learned.accepted, true);
assert.strictEqual(learned.online.status, 'ONLINE_AKTIF');
assert.strictEqual(learned.online.samples, 1, 'ilk bilimsel kapanışta online profil aktif olmalı');
assert(Number.isFinite(learned.activeAtrMultiplier) && learned.activeAtrMultiplier > 0);
assert(learned.activeCaptureRatio >= 0.5 && learned.activeCaptureRatio <= 0.9);

const assigned = {
  sym: 'NEWUSDT', yon: 'LONG', girisFiyati: 100, sl: 99,
  girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 0.20 }
};
const assignment = evo.assign(assigned);
assert.strictEqual(assignment.takeoverSource, 'ONLINE_LEARNED_PROFILE');
assert.strictEqual(assignment.profileSamples, 1);
assert.strictEqual(assignment.assignedAtrMultiplier, learned.activeAtrMultiplier);
assert.strictEqual(assignment.assignedCaptureRatio, learned.activeCaptureRatio);
assert.strictEqual(assignment.takeoverLearningMode, 'ONLINE_EVERY_SCIENTIFIC_CLOSE_NEW_POSITIONS_ONLY');

// Canlı karar gerçek ATR ve atanmış MFE yakalama oranını birlikte kullanmalı.
const state = JSON.parse(fs.readFileSync(evo.STATE_FILE, 'utf8'));
state.profiles['LONG|RRRR'].activeTakeoverPct = 0.50;
state.profiles['LONG|RRRR'].activeAtrMultiplier = 1.50;
state.profiles['LONG|RRRR'].activeCaptureRatio = 0.80;
state.profiles['LONG|RRRR'].activeSafeFloorPct = 0.10;
state.profiles['LONG|RRRR'].activeTrail = 0.75;
fs.writeFileSync(evo.STATE_FILE, JSON.stringify(state));

const live = {
  sym: 'LIVEUSDT', yon: 'LONG', girisFiyati: 100, sl: 99,
  girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 0.25 },
  execution: { pricePath: [{ price: 101, pnlPct: 1, atrPct: 0.20, ts: Date.now() }] }
};
const liveAssignment = evo.assign(live);
assert.strictEqual(liveAssignment.assignedAtrMultiplier, 1.5);
assert.strictEqual(liveAssignment.assignedCaptureRatio, 0.8);
const decision = evo.update(live, 101);
assert.strictEqual(decision.active, true);
assert.strictEqual(decision.justActivated, true);
assert.strictEqual(decision.atrSource, 'LIVE_ATR_PATH');
assert(Math.abs(decision.atrStop - 100.7) < 1e-9, `ATR stop 100.7 bekleniyordu: ${decision.atrStop}`);
assert(Math.abs(decision.mfeFloor - 100.8) < 1e-9, `MFE stop 100.8 bekleniyordu: ${decision.mfeFloor}`);
assert.strictEqual(live.renkoExitLastStopSource, 'MFE_KORUMA');
assert(Math.abs(live.sl - 100.8) < 1e-9);

// Açık pozisyon ataması sonradan değişmemeli.
state.profiles['LONG|RRRR'].activeTakeoverPct = 1.25;
state.profiles['LONG|RRRR'].activeAtrMultiplier = 2.50;
state.profiles['LONG|RRRR'].activeCaptureRatio = 0.50;
fs.writeFileSync(evo.STATE_FILE, JSON.stringify(state));
evo.assign(live);
assert.strictEqual(live.renkoExitAssignment.assignedTakeoverPct, 0.50);
assert.strictEqual(live.renkoExitAssignment.assignedAtrMultiplier, 1.50);
assert.strictEqual(live.renkoExitAssignment.assignedCaptureRatio, 0.80);

const memory = fs.readFileSync('./1_hafiza.js', 'utf8');
const bot = fs.readFileSync('./bot.js', 'utf8');
const report = fs.readFileSync('./2_rapor.js', 'utf8');
const entry = fs.readFileSync('./72_st2_renko_entry.js', 'utf8');
const settings = fs.readFileSync('./ayarlar.js', 'utf8');

assert(memory.includes("const telegramIsKuyruklari = { critical: [], panel: [], detail: [] }"), 'Telegram öncelik kuyrukları eksik');
assert(memory.includes("telegramWorkerBaslat(priority === 'critical' ? 'critical' : 'bulk')"), 'kritik ve toplu Telegram işçileri ayrılmalı');
assert(memory.includes('telegramKritikWorkerCalisiyor') && memory.includes('telegramBulkWorkerCalisiyor'), 'ayrı Telegram işçi durumları eksik');
assert(memory.includes('family: 4') && memory.includes("['-4', '-sS'"), 'Native ve curl IPv4 yolu eksik');
assert(memory.includes('Native IPv4 başarısız; curl IPv4 fallback doğrulandı'), 'fallback teslim kanıtı eksik');
assert(memory.includes('telegramNativeBypassUntil') && memory.includes('TELEGRAM_NATIVE_BYPASS_MS'), 'Native hata devre kesicisi eksik');
assert(report.includes("{ priority: 'detail' }"), 'ağır raporlar detail kuyruğuna ayrılmalı');
assert(report.includes('st2DetayRaporStartupGecikmeMs') && report.includes('startupHazir'), 'açılış detay warm-up eksik');
assert(!bot.includes('rapor.raporTalepEt(true);'), 'açılışta ağır rapor zorlanmamalı');
assert(bot.includes("ayarlar.entryStrategyMode !== 'ST2_RENKO' && !pusuRaporCalisiyor"), 'ST2 eski genel pusu raporu devre dışı olmalı');
assert(entry.includes('st2-startup-pusu-telegram.json') && entry.includes('Aynı açılış özeti tekrar bastırıldı'), 'açılış pusu tekilleştirme damgası eksik');
assert(settings.includes('renkoCikisIlkAtamaKapanis: 1'), 'online öğrenme ilk kapanışta başlamalı');
assert(settings.includes('st2DetayRaporMinAralikMs: 900000'), 'detay raporu 15 dakika seyrek olmalı');

// Gerçek scheduler testi: devam eden ilk detail bittikten sonra kritik iş, bekleyen detail işini geçmeli.
(async () => {
  const https = require('https');
  const EventEmitter = require('events');
  const originalRequest = https.request;
  const order = [];
  const completion = [];
  process.env.AGROS_ST2_TELEGRAM_TOKEN = 'TEST_TOKEN';
  process.env.AGROS_ST2_TELEGRAM_CHAT_ID = '123';
  https.request = (options, callback) => {
    const req = new EventEmitter();
    let body = '';
    req.write = chunk => { body += String(chunk || ''); };
    req.setTimeout = () => {};
    req.destroy = err => req.emit('error', err);
    req.end = () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_) {}
      order.push(parsed.text);
      const delay = parsed.text === 'DETAIL-1' ? 80 : 5;
      setTimeout(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        callback(res);
        setTimeout(() => {
          res.emit('data', JSON.stringify({ ok: true, result: { message_id: order.length } }));
          res.emit('end');
        }, 5);
      }, delay);
    };
    return req;
  };
  try {
    delete require.cache[require.resolve('./1_hafiza.js')];
    const memoryRuntime = require('./1_hafiza.js');
    const d1 = memoryRuntime.telegramMesajGonder('DETAIL-1', { priority: 'detail' }).then(x => { completion.push('DETAIL-1'); return x; });
    await new Promise(resolve => setTimeout(resolve, 1));
    const d2 = memoryRuntime.telegramMesajGonder('DETAIL-2', { priority: 'detail' }).then(x => { completion.push('DETAIL-2'); return x; });
    const critical = memoryRuntime.telegramMesajGonder('CRITICAL', { priority: 'critical' }).then(x => { completion.push('CRITICAL'); return x; });
    await Promise.all([d1, d2, critical]);
    assert.deepStrictEqual(order, ['DETAIL-1', 'CRITICAL', 'DETAIL-2'], `istek başlangıç sırası hatalı: ${order.join(',')}`);
    assert.strictEqual(completion[0], 'CRITICAL', `kritik mesaj aktif detay isteğini bekledi: ${completion.join(',')}`);
    const q = memoryRuntime.telegramKuyrukOzeti();
    assert.strictEqual(q.critical, 0);
    assert.strictEqual(q.detail, 0);
    assert.strictEqual(q.delivered.critical, 1);
    assert.strictEqual(q.delivered.detail, 2);
  } finally {
    https.request = originalRequest;
  }
  console.log('✅ v6.7.0 online adaptive ATR/MFE exit + priority Telegram + single startup pusu passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
