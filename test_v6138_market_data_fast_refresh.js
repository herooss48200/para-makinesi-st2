'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');

function candles(tfMs, count, start = Date.now() - tfMs * (count + 5), base = 100) {
    return Array.from({ length: count }, (_, i) => {
        const openTime = start + i * tfMs;
        return {
            openTime,
            closeTime: openTime + tfMs - 1,
            open: String(base + i * 0.01),
            high: String(base + i * 0.01 + 0.03),
            low: String(base + i * 0.01 - 0.02),
            close: String(base + i * 0.01 + 0.01),
            volume: '100'
        };
    });
}

(async () => {
    const revisionSource = fs.readFileSync('./revizyon.js', 'utf8');
    const networkSource = fs.readFileSync('./64_binance_network_resilience.js', 'utf8');
    const reportSource = fs.readFileSync('./2_rapor.js', 'utf8');
    const entrySource = fs.readFileSync('./72_st2_renko_entry.js', 'utf8');
    const settingsSource = fs.readFileSync('./ayarlar.js', 'utf8');

    assert(revisionSource.includes('mumlariBirlestir'), 'delta candle merge helper missing');
    assert(revisionSource.includes('pusuDeltaMumLimiti'), '15m delta refresh missing');
    assert(revisionSource.includes('superTrendDeltaMumLimiti'), '1m delta refresh missing');
    assert(revisionSource.includes("skipTrend: true"), 'core 1m refresh must not drag ST1 shadow every cycle');
    assert(revisionSource.includes('marketBulkRefreshOwner'), 'single bulk refresh lock missing');
    assert(networkSource.includes('QUEUE_WAIT_TIMEOUT'), 'queued request timeout missing');
    assert(settingsSource.includes('binanceStartupAgEszamanlilik: 10'), 'startup fast profile missing');
    assert(settingsSource.includes('binanceTopluVeriRetryMs: 30000'), 'delta refresh retry window must be bounded to 30s');
    assert(reportSource.includes('1m Veri ${veriSagligi.renko1mVeriHazir}'), '1m cache truth missing from report');
    assert(reportSource.includes('Renko ST hesap ${veriSagligi.renko1mStHazir}'), 'computed Renko ST truth missing from report');
    assert(entrySource.includes('onay1mRenkoHazir: audit.onay1mRenkoHazir'), 'scan health must publish computed 1m Renko ST count');

    const fakeAyarlar = {
        entryStrategyMode: 'ST2_RENKO',
        renkoKaynakPeriyodu: '15m', pusuPeriyodu: '15m', sniperPeriyodu: '1m', superTrendPeriyodu: '3m',
        bollingerperiod: 20, renkoKaynakMumLimiti: 250, renkoOnayAtrPeriod: 14, superTrendPeriod: 10,
        startupMarketReadyOrani: 0.95, startupMarketGuardLogAralikMs: 60000,
        binanceAgEszamanlilik: 3, binanceAgIsciSayisi: 8,
        binanceStartupAgEszamanlilik: 10, binanceStartupAgIsciSayisi: 20,
        binanceStartupTimeoutMs: 8000, binanceStartupRetry: 0, binanceStartupQueueTimeoutMs: 30000, binanceStartupRequestSpacingMs: 15,
        pusuDeltaMumLimiti: 3, superTrendDeltaMumLimiti: 3,
        binanceBulkRefreshTimeoutMs: 8000, binanceBulkRefreshRetry: 0, binanceBulkRefreshQueueTimeoutMs: 15000, binanceBulkRefreshRequestSpacingMs: 20,
        pusuRefreshMaxTurMs: 120000, superTrendRefreshMaxTurMs: 55000,
        kapanmisMumYayinGecikmesiMs: 3000, binanceTopluVeriRetryMs: 90000,
        taranacakCoinSayisi: 200
    };
    const symbols = ['AAAUSDT', 'BBBUSDT'];
    const h = { state: {
        semboller: symbols,
        yerelPusuHafizasi: {}, sonPusuMumZamani: {}, sniperMumlar: {}, trendMumlar: {}, trendSuperTrend: {}, sniperSuperTrend: {},
        sniperCanliMumlar: {}, sniperSuperTrendCanli: {}, trendCanliMumlar: {}, trendSuperTrendCanli: {}, canliFiyatlar: {},
        startupMarketReady: true, startupMarketWarmup: {}, sembolVeriSagligi: {}
    }};
    for (const [idx, sym] of symbols.entries()) {
        h.state.yerelPusuHafizasi[sym] = candles(15 * 60_000, 30, Date.now() - 15 * 60_000 * 35, 100 + idx);
        h.state.sonPusuMumZamani[sym] = h.state.yerelPusuHafizasi[sym].at(-1).closeTime;
        h.state.sniperMumlar[sym] = candles(60_000, 30, Date.now() - 60_000 * 35, 200 + idx);
        h.state.trendMumlar[sym] = candles(3 * 60_000, 20, Date.now() - 3 * 60_000 * 25, 300 + idx);
        h.state.trendSuperTrend[sym] = 'UP';
    }

    const calls = [];
    let delayMs = 0;
    const fakeAg = {
        configure() {},
        async binanceMumlariCek(sym, tf, limit, options) {
            calls.push({ sym, tf, limit, label: options?.label, retries: options?.retries, queueTimeoutMs: options?.queueTimeoutMs, requestSpacingMs: options?.requestSpacingMs });
            if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
            const tfMs = tf === '15m' ? 15 * 60_000 : tf === '3m' ? 3 * 60_000 : 60_000;
            return candles(tfMs, Number(limit), Date.now() - tfMs * (Number(limit) + 1), 500);
        },
        async havuzdaCalistir(items, worker) {
            const out = [];
            for (const item of items) {
                try { out.push({ ok: true, value: await worker(item) }); }
                catch (error) { out.push({ ok: false, error }); }
            }
            return out;
        }
    };
    const fakeMotor = { hesaplaSuperTrend: () => ({ trend: 'UP', value: 1 }) };

    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (parent?.filename?.endsWith('revizyon.js')) {
            if (request === './ayarlar.js') return fakeAyarlar;
            if (request === './1_hafiza.js') return h;
            if (request === './motor.js') return fakeMotor;
            if (request === './64_binance_network_resilience.js') return fakeAg;
        }
        return originalLoad.apply(this, arguments);
    };

    let revizyon;
    try {
        delete require.cache[require.resolve('./revizyon.js')];
        revizyon = require('./revizyon.js');
    } finally {
        Module._load = originalLoad;
    }

    // Startup profile: two core histories per symbol, fail-fast and no ST1 shadow in the gate.
    revizyon._resetScheduleForTest();
    calls.length = 0;
    h.state.startupMarketReady = false;
    const startup = await revizyon.derinGecmisiInsaEt({ concurrency: 4, workers: 8 });
    assert.strictEqual(startup.ready, true);
    assert.strictEqual(startup.coreRequests, symbols.length * 2);
    const startupCalls = calls.filter(x => String(x.label).startsWith('START_'));
    assert.strictEqual(startupCalls.length, symbols.length * 2);
    assert(startupCalls.every(x => x.retries === 0), 'first startup pass must fail fast without retry storms');
    assert(startupCalls.every(x => x.queueTimeoutMs === 30000), 'startup requests need bounded queue wait');
    assert.strictEqual(h.state.sembolVeriSagligi.renko1mVeriHazir, symbols.length);
    revizyon._resetScheduleForTest();

    // Re-seed warm caches for delta refresh proof.
    for (const [idx, sym] of symbols.entries()) {
        h.state.yerelPusuHafizasi[sym] = candles(15 * 60_000, 30, Date.now() - 15 * 60_000 * 35, 100 + idx);
        h.state.sonPusuMumZamani[sym] = h.state.yerelPusuHafizasi[sym].at(-1).closeTime;
        h.state.sniperMumlar[sym] = candles(60_000, 30, Date.now() - 60_000 * 35, 200 + idx);
        h.state.trendMumlar[sym] = candles(3 * 60_000, 20, Date.now() - 3 * 60_000 * 25, 300 + idx);
        h.state.trendSuperTrend[sym] = 'UP';
    }
    calls.length = 0;
    const pusuBefore = h.state.yerelPusuHafizasi.AAAUSDT.length;
    await revizyon.pusuVerileriniTazele({ force: true });
    const pusuCalls = calls.filter(x => String(x.label).startsWith('PUSU_CANDLE:'));
    assert.strictEqual(pusuCalls.length, symbols.length);
    assert(pusuCalls.every(x => x.limit === 3), 'warm 15m cache must request only delta candles');
    assert(h.state.yerelPusuHafizasi.AAAUSDT.length >= pusuBefore, 'delta merge must preserve historical 15m cache');

    revizyon._resetScheduleForTest();
    calls.length = 0;
    const sniperBefore = h.state.sniperMumlar.AAAUSDT.length;
    await revizyon.superTrendHesapla(false, { skipTrend: true });
    const sniperCalls = calls.filter(x => String(x.label).startsWith('SNIPER_CANDLE:'));
    assert.strictEqual(sniperCalls.length, symbols.length);
    assert(sniperCalls.every(x => x.limit === 3), 'warm 1m cache must request only delta candles');
    assert(h.state.sniperMumlar.AAAUSDT.length >= sniperBefore, 'delta merge must preserve historical 1m cache');
    assert.strictEqual(h.state.sembolVeriSagligi.renko1mVeriHazir, symbols.length, 'core 1m cache count must stay truthful');

    // Shared bulk lock: a slow 15m refresh must make the parallel 1m bulk cycle skip, not pile up.
    revizyon._resetScheduleForTest();
    delayMs = 30;
    const slowPusu = revizyon.pusuVerileriniTazele({ force: true });
    await new Promise(resolve => setTimeout(resolve, 2));
    const parallel = await revizyon.superTrendHesapla(false, { skipTrend: true });
    assert.strictEqual(parallel.skipped, true);
    assert.strictEqual(parallel.reason, 'BULK_BUSY');
    await slowPusu;
    delayMs = 0;
    revizyon._resetScheduleForTest();

    // Real queue guard: a queued LOW-priority task must fail instead of waiting forever.
    delete require.cache[require.resolve('./64_binance_network_resilience.js')];
    const network = require('./64_binance_network_resilience.js');
    network._testReset();
    network.configure({ concurrency: 1 });
    const blocker = network.kuyrukluIstek('TEST_BLOCKER', () => new Promise(resolve => setTimeout(() => resolve('ok'), 1200)), {
        priority: 'HIGH', queueTimeoutMs: 5000, label: 'TEST_BLOCKER'
    });
    const queued = network.kuyrukluIstek('TEST_QUEUE_TIMEOUT', () => Promise.resolve('late'), {
        priority: 'LOW', queueTimeoutMs: 1000, label: 'TEST_QUEUE_TIMEOUT'
    });
    await assert.rejects(queued, err => err?.code === 'EQUEUEWAIT');
    await blocker;
    const stats = network.durumOzeti();
    assert(stats.queueTimeout >= 1, 'queue timeout counter must increment');
    network._testReset();

    console.log('✅ v6.13.5-R6 preserves R5 fast startup + delta refresh + queue watchdog + truthful 1m report passed');
})().catch(err => {
    console.error(err.stack || err);
    process.exit(1);
});
