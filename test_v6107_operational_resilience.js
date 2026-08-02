'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6107-'));
  process.env.AGROS_DATA_DIR = tempDir;
  process.env.AGROS_ST2_GLOBAL_HISTORICAL_RUNTIME = 'true';
  process.env.AGROS_ST2_GLOBAL_HISTORICAL_AUTO_TRAIN = 'false';

  try {
    // 1) Gerçek kapanışın kritik commit'i rapor/Telegram'dan bağımsızdır.
    const lifecycle = require('./86_st2_close_lifecycle.js');
    const real = { sym: 'BTCUSDT', yon: 'LONG', sanal: false };
    const shadow = { sym: 'ETHUSDT', yon: 'LONG', sanal: true };
    const state = { aktifPozisyonlar: [real, shadow], manualCloseLocks: {} };
    const order = [];
    const commit = lifecycle.commitRealClose({
      state,
      pos: real,
      indexHint: 0,
      reconciliation: { manual: true, reason: 'MANUAL_EXTERNAL_CLOSE', exitPrice: 101, netPnl: 0.1 },
      livePrice: 100.5,
      manualLockMs: 60_000,
      removeAuxiliary: () => order.push('AUX_REMOVED'),
      persist: reason => order.push(`PERSIST:${reason}`),
      now: 1_000
    });
    assert.strictEqual(commit.ok, true);
    assert.strictEqual(commit.removed, true);
    assert.deepStrictEqual(state.aktifPozisyonlar, [shadow], 'kapanmış gerçek pozisyon aktif slotu boşaltmadı');
    assert.strictEqual(state.manualCloseLocks['BTCUSDT|LONG'], 61_000, 'yalnız sembol/yön cooldown kilidi kurulmadı');
    assert(order.includes('PERSIST:manuel-external-close-critical-commit'), 'rapordan önce kritik state yazılmadı');

    const duplicateCommit = lifecycle.commitRealClose({ state, pos: real, reconciliation: {}, persist: () => { throw new Error('çift persist'); } });
    assert.strictEqual(duplicateCommit.alreadyCommitted, true, 'aynı kapanış ikinci kez commit edildi');

    let scheduled = null;
    let panelRuns = 0;
    const scheduledResult = lifecycle.scheduleCloseReport({
      pos: real,
      closePrice: 101,
      reason: 'MANUAL_EXTERNAL_CLOSE',
      scheduler: fn => { scheduled = fn; },
      reportClose: async () => { throw new Error('TELEGRAM_TIMEOUT_SIMULATION'); },
      sendPanel: async () => { panelRuns++; },
      persist: reason => order.push(`PERSIST:${reason}`),
      logger: { error: () => {} }
    });
    assert.strictEqual(scheduledResult.scheduled, true);
    assert.strictEqual(typeof scheduled, 'function');
    assert.strictEqual(state.aktifPozisyonlar.length, 1, 'arka plan raporu slotu yeniden bloke etti');
    scheduled();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(panelRuns, 1, 'rapor hatasında panel görevi izole çalışmadı');
    assert(order.includes('PERSIST:gercek-close-report-failed'), 'rapor hatası audit state kaydı üretmedi');
    assert.strictEqual(lifecycle.scheduleCloseReport({ pos: real, reportClose: async()=>{} }).duplicate, true, 'aynı kapanış raporu ikinci kez planlandı');

    // 2) Global Historical activate() ağır reconciliation.summary() çağırmadan dönmelidir.
    let summaryCalls = 0;
    let deferred = null;
    const originalLoad = Module._load;
    Module._load = function patched(request, parent, isMain) {
      if (parent?.filename?.endsWith('79_st2_global_historical_runtime.js') && request === './75_st2_historical_renko_training.js') {
        return { DEFAULT_SYMBOLS: ['BTCUSDT'], load:()=>({symbols:{}}), save:()=>{}, downloadKlines:async()=>[], trainSymbol:()=>({symbols:{}}) };
      }
      if (parent?.filename?.endsWith('79_st2_global_historical_runtime.js') && request === './78_st2_global_historical_reconciliation.js') {
        return { COINS:['BTC'], SYMBOLS:['BTCUSDT'], summary:()=>{ summaryCalls++; return {historical:{readyCoins:1,signals:2,readyPatterns:3},reconciliation:{ok:true}}; } };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve('./79_st2_global_historical_runtime.js')];
    const runtime = require('./79_st2_global_historical_runtime.js');
    const status = runtime.activate({ warmupMs: 30_000, scheduler: fn => { deferred = fn; return { unref(){} }; } });
    assert.strictEqual(summaryCalls, 0, 'startup activate ağır historical summary çalıştırdı');
    assert.strictEqual(status.activation, 'READ_ONLY_REFRESH_DEFERRED_GUARDED');
    assert.strictEqual(typeof deferred, 'function', 'historical arka plan işi planlanmadı');
    runtime._resetForTest();
    Module._load = originalLoad;

    // 3) Kapanmış mum yokken 200 coinlik istek turu yeniden başlamamalıdır.
    const originalLoad2 = Module._load;
    Module._load = function patchedRefresh(request, parent, isMain) {
      if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
      if (request === 'binance-api-node') return { default: () => ({}) };
      if (request === 'axios') return { create:()=>({}), get:async()=>({data:{}}), post:async()=>({data:{}}) };
      if (request === 'technicalindicators') return {};
      return originalLoad2.call(this, request, parent, isMain);
    };
    const refresh = require('./revizyon.js');
    assert.strictEqual(refresh._intervalMs('15m'), 900_000);
    const now = Date.UTC(2026, 7, 1, 9, 15, 10);
    const bucket = refresh._closedCandleBucket('15m', now);
    assert.strictEqual(refresh._refreshDue(bucket, bucket, bucket, now, now), false, 'aynı kapanmış mum için yeniden toplu istek açılıyor');
    assert.strictEqual(refresh._refreshDue(bucket + 1, bucket, bucket, now, now + 900_000), true, 'yeni kapanmış mum turu engellendi');
    Module._load = originalLoad2;

    // 4) Entegrasyon kanıtları: gerçek kapanış commit bariyeri + öncelik ayrımı.
    const positionSource = fs.readFileSync(path.join(__dirname, '4_pozisyon.js'), 'utf8');
    const botSource = fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8');
    const refreshSource = fs.readFileSync(path.join(__dirname, 'revizyon.js'), 'utf8');
    assert(positionSource.includes('closeLifecycle.commitRealClose'));
    assert(positionSource.includes('closeLifecycle.scheduleCloseReport'));
    assert(positionSource.includes('Slot SERBEST'));
    assert(botSource.includes("priority: 'CRITICAL'"), 'canlı ticker kuyruğun kritik önceliğine alınmadı');
    assert(refreshSource.includes("'LOW'"), 'toplu candle işleri düşük önceliğe alınmadı');
    assert(refreshSource.includes('CLOSED_CANDLE_NOT_DUE'), 'kapanmış mum due-gate eksik');

    console.log('✅ v6.10.7 close commit barrier + non-blocking historical startup + closed-candle network scheduling passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch(err => {
  console.error('❌ v6.10.7 operational resilience test failed:', err.stack || err);
  process.exitCode = 1;
});
