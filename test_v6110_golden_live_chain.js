'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6110-'));
process.env.AGROS_DATA_DIR = tmp;

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  if (request === 'axios') return { create: () => ({}), get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (request === 'technicalindicators') return {};
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const ayarlar = require('./ayarlar.js');
    const timeFactory = require('./87_st2_binance_time_authority.js');
    const exit = require('./74_st2_renko_exit_evolution.js');
    const h = require('./1_hafiza.js');

    // 1) Binance time authority: midpoint offset + -1021 one sync/one retry.
    let timeCalls = 0;
    const fakeBase = Date.now() + 2500;
    const authority = timeFactory.create({
      samples: 1,
      syncIntervalMs: 60000,
      maxAgeMs: 120000,
      requestImpl: async () => { timeCalls++; return fakeBase + timeCalls; }
    });
    const health = await authority.sync({ force: true });
    assert.strictEqual(health.healthy, true);
    assert(Math.abs(health.offsetMs) >= 2000, `offset not applied: ${health.offsetMs}`);
    let signedCalls = 0;
    const value = await authority.guardedCall(async () => {
      signedCalls++;
      if (signedCalls === 1) { const err = new Error('Timestamp for this request is outside of the recvWindow'); err.code = -1021; throw err; }
      return 'OK';
    }, 'TEST_SIGNED');
    assert.strictEqual(value, 'OK');
    assert.strictEqual(signedCalls, 2);
    assert.strictEqual(authority.health().guardedRetrySuccess, 1);

    // Every wrapped signed call receives an explicit recvWindow; caller payload is not mutated.
    let receivedPayload = null;
    const originalPayload = { symbol: 'BTCUSDT' };
    const signedClient = {
      futuresPositionRisk: async payload => { receivedPayload = payload; return []; }
    };
    authority.wrapClient(signedClient, ['futuresPositionRisk'], { recvWindow: 15000 });
    await signedClient.futuresPositionRisk(originalPayload);
    assert.strictEqual(receivedPayload.recvWindow, 15000);
    assert.strictEqual(originalPayload.recvWindow, undefined, 'signed wrapper mutated caller payload');
    let emptyPayload = null;
    const emptyClient = { futuresOpenOrders: async payload => { emptyPayload = payload; return []; } };
    authority.wrapClient(emptyClient, ['futuresOpenOrders'], { recvWindow: 12000 });
    await emptyClient.futuresOpenOrders();
    assert.strictEqual(emptyPayload.recvWindow, 12000);

    // 2) Telegram empty response becomes ambiguous/no retry and opens curl circuit.
    const tg = h._test;
    tg.telegramTransport.nativeCircuitUntil = 0;
    tg.telegramTransport.curlCircuitUntil = 0;
    tg.telegramTransport.nativeConsecutiveFailures = 0;
    tg.telegramTransport.curlConsecutiveFailures = 0;
    tg.telegramTransportKaydet('curl', { ok: false, description: 'CURL_EMPTY_RESPONSE', transient: true, ambiguousDelivery: true });
    assert(tg.telegramTransport.curlCircuitUntil > Date.now(), 'curl circuit did not open');
    const memorySrc = fs.readFileSync(path.join(__dirname, '1_hafiza.js'), 'utf8');
    assert(memorySrc.includes("description: 'CURL_EMPTY_RESPONSE'"));
    assert(memorySrc.includes('ambiguousDelivery: true'));
    assert(memorySrc.includes('TELEGRAM_ERROR_LOG_INTERVAL_MS'));
    assert(memorySrc.includes('telegramBulkCircuitOpen'));
    assert.strictEqual(tg.telegramDuzMetinFallbackUygun({ ok: false, description: 'CURL_EMPTY_RESPONSE', transient: true, ambiguousDelivery: true }), false);
    assert.strictEqual(tg.telegramDuzMetinFallbackUygun({ ok: false, description: "Bad Request: can't parse entities" }), true);

    // 3) Stop movement is quantized to completed Renko bricks; sub-brick noise cannot replace Binance stop.
    ayarlar.renkoCikisCanliModu = 'SAFE_COMMISSION_BRICK_TRAIL';
    ayarlar.renkoCikisStopGuncellemeAdimTugla = 1.00;
    ayarlar.renkoCikisGuvenliKarTabaniYuzde = 0.15;
    const pos = {
      sanalOrderId: 'V6110-Q', sym: 'TESTUSDT', yon: 'LONG', girisFiyati: 100, sl: 100.05,
      breakevenAktif: true, korunanKarYuzdesi: 0.15,
      girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'GGGG', renkoBoxSize: 1, renkoEntryBrickDistance: 0.75 }
    };
    const assignment = exit.assign(pos);
    assignment.assignedTrailBricks = 1.00;
    assignment.renkoBoxAtOpen = 1;
    assignment.assignedStopUpdateStepBricks = 1.00;
    const activated = exit.updateBrick(pos, 100.90);
    assert.strictEqual(activated.active, true);
    const firstStop = pos.sl;
    const noise = exit.updateBrick(pos, 101.70); // only +0.80 box from anchor
    assert.strictEqual(noise.changed, false, 'sub-brick noise moved stop');
    assert.strictEqual(pos.sl, firstStop);
    const completed = exit.updateBrick(pos, 101.91); // >= one completed box
    assert.strictEqual(completed.changed, true, 'completed brick did not move stop');
    assert(completed.advancedBricks >= 1);
    assert(pos.sl > firstStop);

    const replay = exit.brickReplay([
      { price: 100.90 }, { price: 101.70 }, { price: 101.91 }, { price: 101.00 }
    ], 'LONG', 100, 1, 1, 0.80, 0.15, 101.00, 1.00);
    assert.strictEqual(replay.activated, true);
    assert.strictEqual(replay.stopUpdateStepBricks, 1.00);

    // 4) Startup is protection-first and new entries are gated until background warmup is ready.
    const botSrc = fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8');
    const syncIdx = botSrc.indexOf('await h.binanceTimeSync({ force: true })');
    const adoptIdx = botSrc.indexOf('await piyasa.acikPozisyonlariBorsadanDevral()');
    assert(syncIdx >= 0 && syncIdx < adoptIdx, 'time sync must precede exchange reconciliation');
    assert(/setImmediate\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?Promise\.resolve\s*\(\s*revizyon\.derinGecmisiInsaEt\s*\(\s*\)\s*\)/.test(botSrc), 'background historical warmup chain missing');
    assert(botSrc.indexOf('await p.izSurmeyiGuncelle();') < botSrc.indexOf("if (ayarlar.entryStrategyMode === 'ST2_RENKO')"));
    assert(botSrc.includes('h.state.startupMarketReady === true'));
    assert(botSrc.includes('[STARTUP ENTRY GATE]'));
    assert(botSrc.includes('startupEarlyDeliveryPromise'));
    assert(botSrc.includes('if (startupEarlyDeliveryPromise) await startupEarlyDeliveryPromise'));
    assert(botSrc.includes('Gerçek pozisyon varsa ertelenir'));
    assert(botSrc.includes("canRun: () => h.state.startupMarketReady === true"));

    const revSrc = fs.readFileSync(path.join(__dirname, 'revizyon.js'), 'utf8');
    assert(revSrc.includes('startupMarketReadyOrani'));
    assert(revSrc.includes('overlapLog'));
    assert(revSrc.includes('binanceStartupAgEszamanlilik'));
    assert(revSrc.includes('startupMarketDurumuGuncelle'));
    assert(revSrc.includes('periyodikTazelemeyiBaslat'));
    assert(revSrc.includes("ag.configure({ concurrency: ayarlar.binanceAgEszamanlilik || 3 })"));
    const rev = require('./revizyon.js');
    h.state.startupMarketReady = false;
    h.state.startupMarketWarmup = { durum: 'DEGRADED' };
    h.state.semboller = ['AUSDT', 'BUSDT'];
    h.state.yerelPusuHafizasi = { AUSDT: [{}], BUSDT: [{}] };
    h.state.sniperMumlar = { AUSDT: [{}], BUSDT: [{}] };
    h.state.trendSuperTrend = {};
    const recoveredGate = rev._startupMarketDurumuGuncelle('TEST_RECOVERY');
    assert.strictEqual(recoveredGate.currentReady, true);
    assert.strictEqual(h.state.startupMarketReady, true, 'degraded startup did not recover entry gate');

    // 5) Real-entry time health and stop protection hardening are fail-closed.
    const realSrc = fs.readFileSync(path.join(__dirname, '85_st2_real_order_execution.js'), 'utf8');
    const marketSrc = fs.readFileSync(path.join(__dirname, '3_piyasa.js'), 'utf8');
    assert(realSrc.includes('BINANCE_TIME_AUTHORITY_NOT_READY'));
    assert(realSrc.includes('STOP_REPLACE_MIN_INTERVAL'));
    assert(realSrc.includes('STOP_DESIRED_ACTIVE_ADOPTED'));
    assert(realSrc.includes('gercekStopMinGuncellemeAralikMs'));
    assert(realSrc.includes('Hesap-geneli AGROS Algo/normal emir temizliği'));
    assert(!realSrc.includes('const symbols = new Set([\n    ...Object.values(state.records)'), 'startup still performs historical N-symbol algo sweep');
    assert(/setImmediate\(\(\)\s*=>\s*\{\s*Promise\.resolve\(h\.telegramMesajGonderKritikTeslim/.test(marketSrc));
    assert(!marketSrc.includes("await h.telegramMesajGonder([\n                '🔄 GERÇEK RESTART KAPANIŞ MUTABAKATI'"), 'restart close Telegram still blocks startup');
    const positionSrc = fs.readFileSync(path.join(__dirname, '4_pozisyon.js'), 'utf8');
    assert(positionSrc.includes('realStopRetryLastPersistSignature'));
    assert(positionSrc.includes('realStopRetryLastPersistAt'));
    const reportSrc = fs.readFileSync(path.join(__dirname, '2_rapor.js'), 'utf8');
    assert(reportSrc.includes('Canlı Zincir Saat'));
    assert(reportSrc.includes('TG Native'));

    // 6) Release contract and all prior entry/exit/manual-close safety remain in chain.
    const version = require('./versiyon.js');
    const op = require('./82_st2_operation_transparency.js');
    const real = require('./85_st2_real_order_execution.js');
    h.state.basamaklar.COOLUSDT = { tickSize: 0.01, pricePrecision: 2 };
    let cooldownNetworkCalls = 0;
    const cooldownResult = await real.replaceStopAtomic({
      sym: 'COOLUSDT', yon: 'LONG', sl: 95, realExecutionFingerprint: 'COOL-FP',
      realStopReplaceRetry: { triggerPrice: 96, nextAttemptAt: Date.now() + 60_000 }
    }, 96, {
      futuresPositionRisk: async () => { cooldownNetworkCalls++; return []; }
    });
    assert.strictEqual(cooldownResult.reason, 'STOP_REPLACE_COOLDOWN');
    assert.strictEqual(cooldownResult.localFastFail, true);
    assert.strictEqual(cooldownNetworkCalls, 0, 'cooldown performed an unnecessary Binance call');
    assert.strictEqual(version.botSurumu, '6.13.5-R5-MARKET-DATA-FAST-REFRESH');
    assert.strictEqual(op.VERSION, 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT');
    assert.strictEqual(exit.VERSION, 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT');
    assert.strictEqual(real.VERSION, 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT');

    console.log('✅ v6.11.0 golden live chain: time authority + staged startup + Telegram circuit + quantized atomic stop passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
