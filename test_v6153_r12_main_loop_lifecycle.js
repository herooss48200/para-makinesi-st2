'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6153-'));
  process.env.AGROS_DATA_DIR = tmp;

  const symbols = Array.from({ length: 200 }, (_, i) => `T${String(i).padStart(3, '0')}USDT`);
  const state = {
    semboller: [], aktifPozisyonlar: [], startupMarketReady: false, startupMarketWarmup: {},
    sembolVeriSagligi: { durum: 'BEKLIYOR' }, canliFiyatlar: {}, cooldownBitis: 0,
    st2Renko: { pusular: {} }, pusuListesi: {}, sonTrendGuncellemeZamani: 0, sonSniperGuncellemeZamani: 0
  };

  let priceCalls = 0;
  let protectionCalls = 0;
  let scanCalls = 0;
  let reportCalls = 0;
  let loopCb = null;
  const logs = [];

  const h = {
    state,
    async binanceTimeSync() { return { healthy: true, offsetMs: 0, lastRttMs: 1 }; },
    binanceTimeStartPeriodic() {},
    async telegramMesajGonderKritikTeslim() { return [{ sonuc: { ok: true } }]; },
    async telegramMesajGonder() { return [{ sonuc: { ok: true } }]; },
    telegramKuyrukOzeti() { return { critical: 0, panel: 0, detail: 0 }; }
  };
  const p = {
    async izSurmeyiGuncelle() { protectionCalls++; },
    async piyasayiTaraVePusuKur() {}, async pusulariDenetleVeIslemAc() {}, async pusuRaporuGonder() {}
  };
  const piyasa = {
    async sembolleriYukle() { state.semboller = symbols.slice(); state.sembolVeriSagligi = { durum: 'HEALTHY' }; },
    async acikPozisyonlariBorsadanDevral() { return { positions: [], restored: 0, adopted: 0, blocked: false }; }
  };
  const revizyon = {
    async derinGecmisiInsaEt() {
      state.startupMarketReady = true;
      state.startupMarketWarmup = { durum: 'READY', asama: 'GOLDEN_RENKO_CORE_COMPLETE', islenen: 200, toplam: 200, pusuHazir: 200, trendHazir: 200 };
      return { ready: true, pusuHazir: 200, trendHazir: 200, total: 200 };
    }
  };
  const ayarlar = {
    entryStrategyMode: 'ST2_RENKO', sanalEmirModu: false, taranacakCoinSayisi: 200,
    binanceAgEszamanlilik: 3, binanceAgTimeoutMs: 15000, binanceAgRetry: 2, binanceAgRetryTabanMs: 900,
    globalHistoricalStartupWarmupMs: 600000, canliRaporAktif: true, canliRaporGuncellemeMs: 30000,
    renkoKaynakPeriyodu: '15m', pusuPeriyodu: '15m', pingInterval: 1000, startupMarketGuardLogAralikMs: 60000
  };
  const rapor = { raporTalepEt() { reportCalls++; } };
  const versiyon = { botSurumu: '6.13.5-R12-RENKO-1M-ST-READINESS-ENTRY-FUNNEL', kisaOzet() { return this.botSurumu; }, telegramOzet() { return this.botSurumu; } };
  const kalici = { yukle() {}, kaydet() {} };
  const network = {
    configure() {},
    async binanceFiyatlariCek() {
      priceCalls++;
      return Object.fromEntries(symbols.map(s => [s, '100']));
    },
    durumOzeti() { return { succeeded: 1, failed: 0, retried: 0, deduped: 0, queuedNow: 0 }; }
  };
  const accounting = { initializeMigration() {} };
  const historical = { activate() { return { activation: 'ACTIVE', warmupMs: 600000, readyCoins: 0, coins: 0, signals: 0, patterns: 0, reconciliationOk: true }; } };
  const scheduler = { createSt2LivePanelScheduler() { return { start() {} }; } };
  const renkoEntry = { async taraVeDegerlendir() { scanCalls++; return { yeniPusu: 0 }; } };
  const safeStartup = { verifyOrThrow() {} };
  const dnaLeague = { findPlayer() { return null; } };
  const dynamicExit = { VERSION: 'TEST', readModel() { return { version: 'TEST', dnaBase: [] }; }, updateFromReplay() { return { totalBaseDna: 0, version: 'TEST', dnaBase: [] }; } };
  const premierObservation = { read() { return { closed: 0 }; } };
  const adaptiveLeague = { VERSION: 'TEST' };
  const labPremier = { VERSION: 'TEST', build() { return { premierCount: 0, forwardVerifiedCount: 0 }; } };
  const blackbox = { istatistikDakikaRaporGerekli() { return false; }, telegramIstatistikRaporMetni() { return ''; } };

  const originalLoad = Module._load;
  const originalSetInterval = global.setInterval;
  const originalLog = console.log;
  const originalError = console.error;

  global.setInterval = (cb, ms) => {
    if (Number(ms) === 1000 && !loopCb) loopCb = cb;
    return { unref() {} };
  };
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => logs.push(args.join(' '));

  Module._load = function(req, parent, isMain) {
    const fromBot = parent?.filename?.endsWith(path.sep + 'bot.js');
    if (fromBot) {
      if (req === 'dotenv') return { config() {} };
      if (req === './1_hafiza.js') return h;
      if (req === './4_pozisyon.js') return p;
      if (req === './3_piyasa.js') return piyasa;
      if (req === './revizyon.js') return revizyon;
      if (req === './ayarlar.js') return ayarlar;
      if (req === './2_rapor.js') return rapor;
      if (req === './versiyon.js') return versiyon;
      if (req === './5_kalici_hafiza.js') return kalici;
      if (req === './64_binance_network_resilience.js') return network;
      if (req === './65_accounting_continuity.js') return accounting;
      if (req === './79_st2_global_historical_runtime.js') return historical;
      if (req === './92_st2_live_panel_scheduler.js') return scheduler;
      if (req === './74_st2_safe_startup.js') return safeStartup;
      if (req === './46_dna_league_engine.js') return dnaLeague;
      if (req === './47_dynamic_dna_exit_engine.js') return dynamicExit;
      if (req === './48_premier_observation_engine.js') return premierObservation;
      if (req === './49_adaptive_trading_league.js') return adaptiveLeague;
      if (req === './62_lab_premier_league.js') return labPremier;
      if (req === './72_st2_renko_entry.js') return renkoEntry;
      if (req === './8_blackbox.js') return blackbox;
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('./bot.js')];
    require('./bot.js');

    // Startup warmup is intentionally launched with setImmediate() so production startup
    // never blocks position protection. A fixed 30 ms sleep is therefore nondeterministic
    // under npm/CI/loaded hosts. Wait for the actual contract instead of wall-clock luck.
    const waitUntil = async (predicate, timeoutMs = 2000, pollMs = 5) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, pollMs));
      }
      return Boolean(predicate());
    };
    const startupReady = await waitUntil(
      () => state.startupMarketReady === true && state.semboller.length === 200 && typeof loopCb === 'function'
    );
    assert.strictEqual(startupReady, true, 'startup warmup must open entry gate and register main loop within bounded startup deadline');
    assert.strictEqual(state.startupMarketReady, true, 'startup warmup must open entry gate');
    assert.strictEqual(state.semboller.length, 200, 'runtime must retain 200-symbol universe');
    assert.strictEqual(typeof loopCb, 'function', 'main loop interval must be registered');

    for (let i = 0; i < 3; i++) await loopCb();

    assert.strictEqual(priceCalls, 3, 'each loop must refresh market price once');
    assert.strictEqual(protectionCalls, 3, 'each loop must run position protection before entry scan');
    assert.strictEqual(scanCalls, 3, 'READY runtime must complete three consecutive Renko scans');
    assert(logs.filter(x => x.includes('[ST2 İLK TARAMA TAMAMLANDI]')).length === 1, 'first-scan completion marker must emit exactly once');
    assert(!logs.some(x => x.includes('Döngü çalışma hatası')), 'three-cycle runtime must have zero loop errors');
  } finally {
    Module._load = originalLoad;
    global.setInterval = originalSetInterval;
    console.log = originalLog;
    console.error = originalError;
    delete require.cache[require.resolve('./bot.js')];
  }

  console.log('✅ v6.13.5-R12 main-loop lifecycle passed | 200 symbols READY + 3x PRICE → PROTECTION → RENKO SCAN + zero loop errors');
})().catch(err => { console.error(err.stack || err); process.exit(1); });
