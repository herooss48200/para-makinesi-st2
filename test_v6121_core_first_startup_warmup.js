'use strict';
const assert = require('assert');
const fs = require('fs');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const ag = require('./64_binance_network_resilience.js');
const revizyon = require('./revizyon.js');

function intervalMs(tf) {
    const n = parseInt(tf, 10) || 1;
    return tf.endsWith('m') ? n * 60_000 : n * 3_600_000;
}
function candles(tf, count) {
    const step = intervalMs(tf);
    const end = Date.now() - step;
    return Array.from({ length: count }, (_, i) => {
        const openTime = end - (count - i) * step;
        const base = 100 + i * 0.08;
        return {
            openTime,
            closeTime: openTime + step - 1,
            open: String(base),
            high: String(base + 0.25),
            low: String(base - 0.10),
            close: String(base + 0.15),
            volume: '1000'
        };
    });
}

(async () => {
    const originalFetch = ag.binanceMumlariCek;
    const originalThreshold = ayarlar.startupMarketReadyOrani;
    const originalStartupConcurrency = ayarlar.binanceStartupAgEszamanlilik;
    const originalStartupWorkers = ayarlar.binanceStartupAgIsciSayisi;
    const originalLog = console.log;
    const logs = [];
    const calls = { '15m': 0, '3m': 0, '1m': 0 };

    try {
        revizyon._resetScheduleForTest();
        ayarlar.startupMarketReadyOrani = 0.95;
        ayarlar.binanceStartupAgEszamanlilik = 4;
        ayarlar.binanceStartupAgIsciSayisi = 8;
        const symbols = Array.from({ length: 20 }, (_, i) => `T${String(i + 1).padStart(2, '0')}USDT`);
        h.state.semboller = symbols;
        h.state.sembolVeriSagligi = {};
        h.state.startupMarketReady = false;
        h.state.startupMarketWarmup = {};

        ag.binanceMumlariCek = async (_sym, tf, limit) => {
            calls[tf] = Number(calls[tf] || 0) + 1;
            await new Promise(resolve => setTimeout(resolve, 1));
            return candles(tf, Math.max(Number(limit) || 80, tf === '15m' ? 30 : 20));
        };
        console.log = (...args) => logs.push(args.join(' '));

        const summary = await revizyon.derinGecmisiInsaEt({ concurrency: 4, workers: 8 });

        assert.strictEqual(summary.ready, true, '15m + 3m çekirdek veri giriş kapısını açmalı');
        assert.strictEqual(summary.pusuHazir, symbols.length);
        assert.strictEqual(summary.trendHazir, symbols.length);
        assert.strictEqual(summary.coreRequests, symbols.length * 2);
        assert.strictEqual(summary.deferredSniperRequests, symbols.length);
        assert.strictEqual(calls['15m'], symbols.length, 'her sembol için tek 15m çekirdek isteği');
        assert.strictEqual(calls['3m'], symbols.length, 'her sembol için tek 3m ST1 isteği');
        assert.strictEqual(calls['1m'], 0, '1m sniper çekirdek giriş kapısını bekletmemeli');
        assert.strictEqual(h.state.startupMarketReady, true);
        assert.strictEqual(Object.keys(h.state.yerelPusuHafizasi).length, symbols.length);
        assert.strictEqual(Object.keys(h.state.trendSuperTrend).length, symbols.length);
        assert(logs.some(x => x.includes('[AŞAMALI BAŞLANGIÇ İLERLEME]')), 'ilerleme kanıtı loglanmalı');
        assert(logs.some(x => x.includes('ÇEKİRDEK TAMAM')), 'çekirdek tamamlanma kanıtı loglanmalı');

        await new Promise(resolve => setTimeout(resolve, 150));
        assert.strictEqual(calls['1m'], symbols.length, '1m sniper çekirdekten sonra arka planda yüklenmeli');
        assert.strictEqual(Object.keys(h.state.sniperMumlar).length, symbols.length);

        const reportSource = fs.readFileSync('./2_rapor.js', 'utf8');
        const botSource = fs.readFileSync('./bot.js', 'utf8');
        const revisionSource = fs.readFileSync('./revizyon.js', 'utf8');
        assert(reportSource.includes('Entry Evolution yalnız GÖLGE'));
        assert(!reportSource.includes('Uygulama ${Number(evo.decisionChain'));
        assert(botSource.includes('Entry Gate: ${warmMetni}'));
        assert(revisionSource.includes("asama: 'CORE_15M_3M'"));
        assert(revisionSource.includes("skipTrend: true"));
        assert(revisionSource.includes("priority: 'LOW'"));

        originalLog('✅ v6.12.1 core-first 15m+3m startup gate + progressive health + deferred 1m shadow passed');
    } finally {
        ag.binanceMumlariCek = originalFetch;
        ayarlar.startupMarketReadyOrani = originalThreshold;
        ayarlar.binanceStartupAgEszamanlilik = originalStartupConcurrency;
        ayarlar.binanceStartupAgIsciSayisi = originalStartupWorkers;
        console.log = originalLog;
        revizyon._resetScheduleForTest();
    }
})().catch(err => {
    console.error(err.stack || err);
    process.exit(1);
});
