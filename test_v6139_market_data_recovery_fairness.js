'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');

function candles(tfMs, count, start, base = 100) {
    return Array.from({ length: count }, (_, i) => ({
        openTime: start + i * tfMs,
        closeTime: start + (i + 1) * tfMs - 1,
        open: String(base + i * 0.01),
        high: String(base + i * 0.01 + 0.02),
        low: String(base + i * 0.01 - 0.02),
        close: String(base + i * 0.01 + 0.01),
        volume: '1'
    }));
}

(async () => {
    const symbols = ['AAAUSDT','BBBUSDT','CCCUSDT','DDDUSDT'];
    const fakeAyarlar = {
        entryStrategyMode: 'ST2_RENKO',
        renkoKaynakPeriyodu: '15m',
        pusuPeriyodu: '15m',
        sniperPeriyodu: '1m',
        superTrendPeriyodu: '3m',
        bollingerperiod: 20,
        renkoKaynakMumLimiti: 250,
        renkoOnayAtrPeriod: 14,
        superTrendPeriod: 10,
        startupMarketReadyOrani: 0.95,
        startupMarketGuardLogAralikMs: 60000,
        binanceAgEszamanlilik: 3,
        binanceAgIsciSayisi: 8,
        binanceStartupAgEszamanlilik: 4,
        binanceStartupAgIsciSayisi: 8,
        binanceStartupTimeoutMs: 8000,
        binanceStartupRetry: 0,
        binanceStartupQueueTimeoutMs: 30000,
        binanceStartupRequestSpacingMs: 15,
        binanceRecoveryAgEszamanlilik: 2,
        marketRecoveryBatchSize: 2,
        marketStartupRepairRounds: 3,
        marketStartupMaxWarmupMs: 120000,
        marketRecoveryRoundDelayMs: 1,
        pusuDeltaMumLimiti: 3,
        superTrendDeltaMumLimiti: 3,
        binanceBulkRefreshTimeoutMs: 8000,
        binanceBulkRefreshRetry: 0,
        binanceBulkRefreshQueueTimeoutMs: 15000,
        binanceBulkRefreshRequestSpacingMs: 20,
        pusuRefreshMaxTurMs: 120000,
        superTrendRefreshMaxTurMs: 55000,
        kapanmisMumYayinGecikmesiMs: 3000,
        binanceTopluVeriRetryMs: 30000,
        taranacakCoinSayisi: 200,
        st1ShadowStartupGecikmeMs: 999999,
        st1ShadowTazelemeMs: 999999
    };

    const h = { state: {
        semboller: [...symbols],
        yerelPusuHafizasi: {},
        sonPusuMumZamani: {},
        sniperMumlar: {},
        trendMumlar: {},
        trendSuperTrend: {},
        sniperSuperTrend: {},
        sniperCanliMumlar: {},
        sniperSuperTrendCanli: {},
        trendCanliMumlar: {},
        trendSuperTrendCanli: {},
        canliFiyatlar: {},
        startupMarketReady: false,
        startupMarketWarmup: {},
        sembolVeriSagligi: {}
    }};

    const calls = [];
    const workerCaps = [];
    const failOnce = new Set();
    let configuredConcurrency = 0;
    const fakeAg = {
        configure({ concurrency } = {}) { if (concurrency) configuredConcurrency = Number(concurrency); return {}; },
        async binanceMumlariCek(sym, tf, limit, options) {
            calls.push({ sym, tf, limit: Number(limit), label: options?.label, priority: options?.priority });
            if (failOnce.has(String(options?.label))) { failOnce.delete(String(options?.label)); throw new Error('TEST_ONCE'); }
            const tfMs = tf === '15m' ? 15 * 60_000 : tf === '3m' ? 3 * 60_000 : 60_000;
            return candles(tfMs, Number(limit), Date.now() - tfMs * (Number(limit) + 2), 100);
        },
        async havuzdaCalistir(items, worker, concurrency) {
            workerCaps.push({ requested: Number(concurrency), network: configuredConcurrency, count: items.length });
            const out = [];
            let index = 0;
            const n = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
            async function run() {
                while (true) {
                    const i = index++;
                    if (i >= items.length) return;
                    try { out[i] = { ok: true, value: await worker(items[i], i) }; }
                    catch (error) { out[i] = { ok: false, error }; }
                }
            }
            await Promise.all(Array.from({ length: n }, run));
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

    // 1) Queue fairness: worker count may not exceed network concurrency.
    calls.length = 0;
    workerCaps.length = 0;
    failOnce.add('START_CANDLE:CCCUSDT');
    failOnce.add('START_SNIPER:DDDUSDT');
    await revizyon.derinGecmisiInsaEt({ concurrency: 4, workers: 8 });
    assert(workerCaps.length >= 1, 'startup must use symbol pool');
    assert(workerCaps.every(x => x.requested <= x.network), `worker cap violated: ${JSON.stringify(workerCaps)}`);
    assert.strictEqual(h.state.startupMarketReady, true, 'targeted startup repair must recover transient misses');
    assert(Number(h.state.startupMarketWarmup?.repairRound || 0) >= 1, 'startup must perform at least one repair round after transient misses');

    // 2) Degraded 15m recovery must target only missing cache first, in a bounded batch.
    revizyon._resetScheduleForTest();
    h.state.startupMarketReady = false;
    h.state.yerelPusuHafizasi = {};
    h.state.sonPusuMumZamani = {};
    for (const sym of symbols.slice(0, 2)) {
        h.state.yerelPusuHafizasi[sym] = candles(15 * 60_000, 30, Date.now() - 31 * 15 * 60_000, 200);
        h.state.sonPusuMumZamani[sym] = h.state.yerelPusuHafizasi[sym].at(-1).closeTime;
    }
    calls.length = 0;
    const pusu = await revizyon.pusuVerileriniTazele({ force: true });
    const pusuCalls = calls.filter(x => String(x.label).startsWith('PUSU_CANDLE:'));
    assert.strictEqual(pusu.recoveryMode, true);
    assert.strictEqual(pusuCalls.length, 2, 'recovery batch must be bounded to missing symbols');
    assert.deepStrictEqual(new Set(pusuCalls.map(x => x.sym)), new Set(symbols.slice(2)), 'healthy symbols must not consume recovery deadline');
    assert(pusuCalls.every(x => x.limit === 250), 'missing 15m cache must get full history, not delta candles');

    // 3) Degraded 1m recovery must do the same.
    revizyon._resetScheduleForTest();
    h.state.startupMarketReady = false;
    h.state.sniperMumlar = {};
    for (const sym of symbols.slice(0, 2)) {
        h.state.sniperMumlar[sym] = candles(60_000, 30, Date.now() - 31 * 60_000, 300);
    }
    calls.length = 0;
    const st = await revizyon.superTrendHesapla(false, { skipTrend: true });
    const sniperCalls = calls.filter(x => String(x.label).startsWith('SNIPER_CANDLE:'));
    assert.strictEqual(st.recoveryMode, true);
    assert.strictEqual(sniperCalls.length, 2, '1m recovery batch must be bounded to missing symbols');
    assert.deepStrictEqual(new Set(sniperCalls.map(x => x.sym)), new Set(symbols.slice(2)), 'healthy 1m cache must not consume recovery deadline');
    assert(sniperCalls.every(x => x.limit === 80), 'missing 1m cache must get full history');

    // 4) Once healthy, "3" remains a candle delta limit, never a coin limit.
    revizyon._resetScheduleForTest();
    h.state.startupMarketReady = true;
    for (const sym of symbols) {
        h.state.yerelPusuHafizasi[sym] = candles(15 * 60_000, 30, Date.now() - 31 * 15 * 60_000, 400);
        h.state.sonPusuMumZamani[sym] = h.state.yerelPusuHafizasi[sym].at(-1).closeTime;
        h.state.sniperMumlar[sym] = candles(60_000, 30, Date.now() - 31 * 60_000, 500);
    }
    calls.length = 0;
    const normal = await revizyon.pusuVerileriniTazele({ force: true });
    const normalCalls = calls.filter(x => String(x.label).startsWith('PUSU_CANDLE:'));
    assert.strictEqual(normal.recoveryMode, false);
    assert.strictEqual(normalCalls.length, symbols.length, 'healthy delta refresh must cover the whole universe');
    assert(normalCalls.every(x => x.limit === 3), 'delta limit 3 must mean three candles per symbol');

    // 5) Telegram wording must not call missing cache an error anymore.
    const reportSource = fs.readFileSync('./2_rapor.js', 'utf8');
    assert(reportSource.includes('Eksik cache ${veriSagligi.cacheEksik}'));
    assert(reportSource.includes('İstek/veri hata ${veriSagligi.istekHata}'));
    assert(reportSource.includes('Deadline ${veriSagligi.deadlineAtlanan}'));
    assert(!reportSource.includes('| Hata ${veriSagligi.hata} | Son Renko tarama'));

    console.log('✅ v6.13.5-R6 recovery fairness passed | worker<=socket + missing-first recovery + truthful telemetry');
})().catch(err => {
    console.error(err.stack || err);
    process.exit(1);
});
