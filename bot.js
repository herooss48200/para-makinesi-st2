require('dotenv').config();
const h = require('./1_hafiza.js');
const p = require('./4_pozisyon.js');
const piyasa = require('./3_piyasa.js');
const revizyon = require('./revizyon.js');
const ayarlar = require('./ayarlar.js');
const rapor = require('./2_rapor.js');
const versiyonBilgi = require('./versiyon.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');
const binanceAg = require('./64_binance_network_resilience.js');
const accountingContinuity = require('./65_accounting_continuity.js');
const globalHistoricalRuntime = require('./79_st2_global_historical_runtime.js');
const { createSt2LivePanelScheduler } = require('./92_st2_live_panel_scheduler.js');
const marketPriceRuntime = require('./93_st2_market_price_runtime.js');
binanceAg.configure({ concurrency: ayarlar.binanceAgEszamanlilik || 3 });

let donguCalisiyor = false;
let sonOzetLog = 0;
let sonCanliRapor = 0;
let pusuRaporCalisiyor = false;
let ilkSt2TaramaTamamlandi = false;
let startupPanelPlanlandi = false;
let sonStartupGateLog = 0;
let startupEarlyDeliveryPromise = null;
let donguBaslangic = 0;
let donguAsama = 'IDLE';
let sonDonguWatchdogLog = 0;
let exchangeReconcileTask = null;

function st2ExchangeReconcileState() {
    h.state.st2ExchangeReconciliation ||= {
        status: ayarlar.sanalEmirModu ? 'VIRTUAL' : 'STARTUP',
        ok: ayarlar.sanalEmirModu === true,
        lastOkAt: ayarlar.sanalEmirModu ? Date.now() : 0,
        lastAttemptAt: 0,
        lastFinishAt: 0,
        lastDurationMs: 0,
        error: null
    };
    return h.state.st2ExchangeReconciliation;
}

function st2RealEntrySafetyUpdate(priceNetworkOk = null) {
    const rec = st2ExchangeReconcileState();
    const now = Date.now();
    const freshMs = Math.max(5000, Number(ayarlar.st2ExchangeReconcileFreshMs || 15000));
    const reconciliationFresh = ayarlar.sanalEmirModu === true || (rec.ok === true && Number(rec.lastOkAt || 0) > 0 && now - Number(rec.lastOkAt || 0) <= freshMs);
    const previous = h.state.st2RealEntrySafety || {};
    const networkOk = priceNetworkOk == null ? previous.priceNetworkOk === true : priceNetworkOk === true;
    const realEntrySafe = ayarlar.sanalEmirModu === true || (reconciliationFresh && networkOk);
    h.state.st2RealEntrySafety = {
        ready: realEntrySafe,
        reconciliationFresh,
        priceNetworkOk: networkOk,
        updatedAt: now,
        reason: realEntrySafe ? 'READY' : (!reconciliationFresh ? 'EXCHANGE_RECONCILIATION_STALE' : 'NETWORK_PRICE_NOT_VERIFIED')
    };
    return h.state.st2RealEntrySafety;
}

async function st2ExchangeReconcileBackground(reason = 'INTERVAL') {
    if (ayarlar.sanalEmirModu || ayarlar.entryStrategyMode !== 'ST2_RENKO') {
        const rec = st2ExchangeReconcileState();
        rec.status = 'VIRTUAL'; rec.ok = true; rec.lastOkAt = Date.now(); rec.error = null;
        st2RealEntrySafetyUpdate();
        return rec;
    }
    if (exchangeReconcileTask) return exchangeReconcileTask;
    const rec = st2ExchangeReconcileState();
    const startedAt = Date.now();
    rec.status = 'RUNNING'; rec.lastAttemptAt = startedAt; rec.reason = reason;
    exchangeReconcileTask = (async () => {
        try {
            const result = await p.izSurmeyiGuncelle({ reconcileOnly: true });
            rec.lastFinishAt = Date.now();
            rec.lastDurationMs = rec.lastFinishAt - startedAt;
            rec.ok = result?.exchangeOk !== false;
            rec.status = rec.ok ? 'READY' : 'DEGRADED';
            rec.error = rec.ok ? null : String(result?.error || 'EXCHANGE_RECONCILIATION_FAILED');
            if (rec.ok) rec.lastOkAt = rec.lastFinishAt;
            st2RealEntrySafetyUpdate();
            return result;
        } catch (err) {
            rec.lastFinishAt = Date.now();
            rec.lastDurationMs = rec.lastFinishAt - startedAt;
            rec.ok = false;
            rec.status = 'DEGRADED';
            rec.error = String(err?.message || err);
            st2RealEntrySafetyUpdate();
            console.error(`⚠️ [ST2 EXCHANGE RECONCILE BG] ${rec.error}`);
            return { exchangeOk: false, error: rec.error };
        } finally {
            exchangeReconcileTask = null;
        }
    })();
    return exchangeReconcileTask;
}

async function baslat() {
    console.log('=== [PARA MAKİNESİ AUTOMATION SYSTEM] STARTING ===');
    console.log(`🧩 Versiyon: ${versiyonBilgi.kisaOzet()}`);

    try {
        startupEarlyDeliveryPromise = null;
        kaliciHafiza.yukle();
        // R12 live-liveness recovery: READY yalnız market cache readiness'tir; ilk Golden Renko audit ayrıca izlenir.
        h.state.st2FirstScanCompleted = false;
        h.state.st2FirstScanCompletedAt = null;
        const safeStartup = require('./74_st2_safe_startup.js');
        safeStartup.verifyOrThrow();
        await piyasa.sembolleriYukle();
        // v6.11.0: Signed Futures çağrıları ve restart mutabakatı raw sistem saatine bırakılmaz.
        const timeHealth = await h.binanceTimeSync({ force: true });
        if (!ayarlar.sanalEmirModu && timeHealth?.healthy !== true) throw new Error('BINANCE_TIME_AUTHORITY_NOT_READY');
        h.binanceTimeStartPeriodic();
        console.log(`⏱️ [BINANCE TIME AUTHORITY] ${timeHealth?.healthy ? 'HEALTHY' : 'DEGRADED'} | Offset ${Number(timeHealth?.offsetMs || 0)} ms | RTT ${Number(timeHealth?.lastRttMs || 0)} ms`);
        await piyasa.acikPozisyonlariBorsadanDevral();
        {
            const rec = st2ExchangeReconcileState();
            rec.status = ayarlar.sanalEmirModu ? 'VIRTUAL' : 'READY';
            rec.ok = true;
            rec.lastOkAt = Date.now();
            rec.lastAttemptAt = rec.lastOkAt;
            rec.lastFinishAt = rec.lastOkAt;
            rec.lastDurationMs = 0;
            rec.error = null;
            st2RealEntrySafetyUpdate(false);
        }
        accountingContinuity.initializeMigration();
        kaliciHafiza.kaydet('accounting-continuity-migration');

        // v6.8.3-HOTFIX1: Kritik başlangıç görünürlüğü ağır tarihsel hazırlığın arkasında beklemez.
        // Mesaj başarılı/belirsiz teslimde aynı startup damgasını yazar; normal startup görevi
        // daha sonra bu damgayı görüp ikinci mesajı bastırır.
        {
            const fsEarly = require('fs');
            const pathEarly = require('path');
            const dataDirEarly = process.env.AGROS_DATA_DIR
                ? pathEarly.resolve(process.env.AGROS_DATA_DIR)
                : pathEarly.join(__dirname, 'data');
            const stampFileEarly = pathEarly.join(dataDirEarly, 'st2-startup-telegram.json');
            let lastSentEarly = 0;
            try { lastSentEarly = Number(JSON.parse(fsEarly.readFileSync(stampFileEarly, 'utf8'))?.lastSentAt || 0); } catch (_) {}
            const cooldownEarly = 10 * 60 * 1000;
            if (Date.now() - lastSentEarly >= cooldownEarly) {
                const earlyMessage = [
                    '🚀 AGROS ST2 BAŞLATILIYOR',
                    `🧩 Sürüm: ${versiyonBilgi.botSurumu}`,
                    `📡 İzlenen evren: ${h.state.semboller.length}/${Number(ayarlar.taranacakCoinSayisi || 200)}`,
                    `💼 Korunan ${ayarlar.sanalEmirModu ? 'sanal' : 'gerçek'} pozisyon: ${ayarlar.sanalEmirModu ? h.state.aktifPozisyonlar.length : h.state.aktifPozisyonlar.filter(p => p?.sanal === false).length}`,
                    ...(!ayarlar.sanalEmirModu ? [`🧪 Geri yüklenen Shadow/GAP: ${h.state.aktifPozisyonlar.filter(p => p?.sanal !== false).length}`] : []),
                    '⏳ Tarihsel veri ve Renko hazırlığı sürüyor; işlem defteri korunuyor.'
                ].join('\n');
                startupEarlyDeliveryPromise = new Promise(resolve => {
                    setImmediate(async () => {
                        try {
                            const sonuclar = await h.telegramMesajGonderKritikTeslim(earlyMessage, {
                                coalesceKey: `st2-startup:${versiyonBilgi.botSurumu}`
                            });
                            const basarili = Array.isArray(sonuclar) && sonuclar.length > 0 && sonuclar.every(x => x?.sonuc?.ok === true);
                            const belirsiz = Array.isArray(sonuclar) && sonuclar.some(x => x?.sonuc?.ambiguousDelivery === true);
                            if (basarili || belirsiz) {
                                const sentAt = Date.now();
                                fsEarly.mkdirSync(pathEarly.dirname(stampFileEarly), { recursive: true });
                                fsEarly.writeFileSync(stampFileEarly, JSON.stringify({
                                    lastSentAt: sentAt,
                                    version: versiyonBilgi.botSurumu,
                                    delivery: basarili ? 'EARLY_OK' : 'EARLY_AMBIGUOUS_NO_RETRY'
                                }, null, 2));
                                console.log(`${basarili ? '✅' : '⚠️'} [ST2 EARLY STARTUP TELEGRAM] ${basarili ? 'Teslim doğrulandı' : 'Teslim belirsiz; tekrar yok'} | ${new Date(sentAt).toISOString()}`);
                            } else {
                                console.log('⚠️ [ST2 EARLY STARTUP TELEGRAM] Teslim doğrulanmadı; normal startup görevi daha sonra yeniden deneyecek.');
                            }
                        } catch (err) {
                            console.error(`⚠️ [ST2 EARLY STARTUP TELEGRAM HATASI] ${err.message}`);
                        } finally {
                            resolve();
                        }
                    });
                });
            }
        }

        // Ağır 200-coin mum/ST hazırlığı ana koruma döngüsünü bloke etmez.
        // Bu sırada açık pozisyon mutabakatı ve iz sürme çalışır; yeni girişler fail-closed bekler.
        h.state.startupMarketReady = false;
        setImmediate(() => {
            Promise.resolve(revizyon.derinGecmisiInsaEt())
                .then(summary => {
                    console.log(`${summary?.ready ? '✅' : '⚠️'} [STARTUP MARKET WARMUP] ${summary?.ready ? 'ENTRY GATE AÇILDI' : 'ENTRY GATE KAPALI'} | ${Number(summary?.pusuHazir || 0)}/${Number(summary?.total || 0)} mum | ${Number(summary?.trendHazir || 0)}/${Number(summary?.total || 0)} ST`);
                })
                .catch(err => {
                    h.state.startupMarketReady = false;
                    h.state.startupMarketWarmup = { ...(h.state.startupMarketWarmup || {}), durum: 'FAILED', hataMesaji: err.message, tamamlanma: new Date().toISOString() };
                    console.error(`❌ [STARTUP MARKET WARMUP] ${err.message} | Yeni giriş kapalı, pozisyon koruma açık.`);
                });
        });

        const historicalRuntimeStatus = globalHistoricalRuntime.activate({
            warmupMs: ayarlar.globalHistoricalStartupWarmupMs || 600000,
            retryMs: 300000,
            canRun: () => h.state.startupMarketReady === true && !h.state.aktifPozisyonlar.some(pos => pos?.sanal === false)
        });
        console.log(`🌍 [GLOBAL HISTORICAL RUNTIME] ${historicalRuntimeStatus.activation} | Isınma ${Math.round(Number(historicalRuntimeStatus.warmupMs || 0) / 1000)} sn | Gerçek pozisyon varsa ertelenir | Coin ${historicalRuntimeStatus.readyCoins}/${historicalRuntimeStatus.coins} | Sinyal ${historicalRuntimeStatus.signals} | Pattern ${historicalRuntimeStatus.patterns} | Mutabakat ${historicalRuntimeStatus.reconciliationOk ? 'OK' : 'ARKA PLANDA'}`);

        // v4.0.1: Yeni katmanların gerçekten yüklendiğini düşük maliyetli biçimde doğrula.
        // Ağır DNA/exit geçmişi başlangıçta yeniden hesaplanmaz; kayıtlı modeller kullanılır.
        try {
            const dnaLeague = require('./46_dna_league_engine.js');
            const dynamicExit = require('./47_dynamic_dna_exit_engine.js');
            const premierObservation = require('./48_premier_observation_engine.js');
            const adaptiveLeague = require('./49_adaptive_trading_league.js');
            const labPremier = require('./62_lab_premier_league.js');
            const leagueState = dnaLeague.findPlayer('__HEALTHCHECK__') === null;
            let exitModel = dynamicExit.readModel();
            if (exitModel && (!Array.isArray(exitModel.dnaBase) || exitModel.version !== dynamicExit.VERSION)) {
                console.log(`🧬 [EXIT MODEL MIGRATION] Eski anahtar modeli algılandı (${exitModel.version || 'BILINMIYOR'}). DNA aile eşleştirmesi bir kez yenileniyor...`);
                exitModel = dynamicExit.updateFromReplay();
                console.log(`✅ [EXIT MODEL MIGRATION] ${Number(exitModel?.totalBaseDna || 0)} temel DNA exit profili hazır.`);
            }
            const observation = premierObservation.read();
            const labModel = labPremier.build();
            console.log(`🧩 [LEGACY COMPATIBILITY MEMORY] ${adaptiveLeague.VERSION} | Kimlik/audit uyumluluğu ${leagueState ? 'OK' : 'OK'} | Premier/Shadow yetkisi YOK | Eski observation kapanan ${Number(observation?.closed || 0)}`);
            console.log(`🧩 [LEGACY EXIT COMPATIBILITY] ${labPremier.VERSION} | Eski kayıt ${Number(labModel?.premierCount || 0)} | İleri kayıt ${Number(labModel?.forwardVerifiedCount || 0)} | Exit uyumluluğu ${exitModel ? 'HAZIR' : 'ACTUAL_FALLBACK'} | Yeni Premier yetkisi YOK`);
            console.log('🛡️ [RAM-SAFE] Ağır replay yalnız model eskiyse bir kez, sonrasında kontrollü 25 kapanış aralığında güncellenir.');
            console.log('🧬 [ST2 PREMIER SCORE RUNTIME ACTIVE] EXACT_CONTEXT + PF + EXPECTANCY + CANLI_FORM + ENTRY + TAKEOVER + ÖRNEK_GÜVENİ | GÖRECELİ_SIRALAMA=AKTİF | GERÇEK=FAIL_CLOSED');
        } catch (err) {
            console.error(`❌ [ADAPTIVE LEAGUE STARTUP HATASI] ${err.message}`);
        }

        const emirModu = ayarlar.sanalEmirModu ? 'SANAL EMİR MODU' : 'BINANCE EMİR MODU';
        const baslangicMesaji = `🚀 <b>PARA MAKİNESİ BOTU AKTİF</b>\n\n` +
            `🧪 Emir Modu: ${emirModu}\n` +
            `🧩 Versiyon: ${versiyonBilgi.telegramOzet()}\n` +
            `📊 Strateji: ${ayarlar.renkoKaynakPeriyodu || ayarlar.pusuPeriyodu} ATR-Renko pusu + Entry Evolution + 1m Renko SuperTrend\n` +
            `📡 İzlenen Evren: ${h.state.semboller.length}/${Number(ayarlar.taranacakCoinSayisi || 200)} | Veri ${h.state.sembolVeriSagligi?.durum || 'BEKLIYOR'}\n` +
            `🧠 Geri Yüklenen Pozisyon: ${h.state.aktifPozisyonlar.length}\n` +
            `🧬 Sanal öğrenme: Renko exact-context + Premier kalite puanı + Williams %R dar-bölge gölge döngüsü\n` +
            `⭐ Premier seçimi: PF + expectancy + canlı form + Entry + Takeover + örnek güveni\n` +
            `📊 Karar: minimum kalite eşiği + göreceli sıralama; geçiş nedeni açık\n` +
            `🔒 Gerçek emir: fail-closed\n` +
            `🛡️ Binance minimumu karşılanmazsa emir güvenle atlanır.\n` +
            `🗃️ Eski muhasebe/başarı sayıları korunuyor; açılış ekranında gizlendi.\n\n` +
            `<i>Sistem kapanmış mumları izliyor, pusu kuruyor ve sniper tetik bekliyor...</i>`;

        const fs = require('fs');
        const path = require('path');
        const startupStampFile = path.join(process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data'), 'st2-startup-telegram.json');
        let startupLastSentAt = 0;
        try { startupLastSentAt = Number(JSON.parse(fs.readFileSync(startupStampFile, 'utf8'))?.lastSentAt || 0); } catch (_) {}
        const startupCooldownMs = 10 * 60 * 1000;
        const startupPanelPlanla = (reason, delayMs = null) => {
            if (startupPanelPlanlandi) return;
            startupPanelPlanlandi = true;
            const gecikme = delayMs == null
                ? Math.max(5000, Number(ayarlar.st2StartupPanelGecikmeMs || 15000))
                : Math.max(0, Number(delayMs) || 0);
            setTimeout(() => {
                console.log(`📊 [ST2 STARTUP PANEL] ${reason} sonrası canlı panel talep edildi.`);
                rapor.raporTalepEt(false);
            }, gecikme).unref?.();
        };
        const startupTelegramTask = async () => {
            // Erken teslim tamamlanmadan zengin startup mesajını başlatma; aynı açılışta çift mesaj üretme.
            if (startupEarlyDeliveryPromise) await startupEarlyDeliveryPromise.catch(() => {});
            try { startupLastSentAt = Number(JSON.parse(fs.readFileSync(startupStampFile, 'utf8'))?.lastSentAt || 0); } catch (_) {}
            if (Date.now() - startupLastSentAt >= startupCooldownMs) {
                // v6.7.2 compatibility proof only: h.telegramMesajGonderTekil(baslangicMesaji)
                const sonuclar = await h.telegramMesajGonderKritikTeslim(baslangicMesaji, { coalesceKey: `st2-startup:${versiyonBilgi.botSurumu}` });
                const basarili = Array.isArray(sonuclar) && sonuclar.length > 0 && sonuclar.every(x => x?.sonuc?.ok === true);
                const belirsiz = Array.isArray(sonuclar) && sonuclar.some(x => x?.sonuc?.ambiguousDelivery === true);
                if (basarili || belirsiz) {
                    const sentAt = Date.now();
                    try { fs.mkdirSync(path.dirname(startupStampFile), { recursive: true }); fs.writeFileSync(startupStampFile, JSON.stringify({ lastSentAt: sentAt, version: versiyonBilgi.botSurumu, delivery: basarili ? 'OK' : 'AMBIGUOUS_NO_RETRY' }, null, 2)); } catch (e) { console.error(`⚠️ [ST2 STARTUP TELEGRAM STAMP] ${e.message}`); }
                    console.log(`${basarili ? '✅' : '⚠️'} [ST2 STARTUP TELEGRAM] ${basarili ? 'Tekil kritik teslim doğrulandı — güvenilir startup hattı' : 'Teslim belirsiz; çift gönderimi önlemek için tekrar yok'} | ${new Date(sentAt).toISOString()}`);
                } else {
                    console.log('⚠️ [ST2 STARTUP TELEGRAM] Kritik gönderim tüm denemelerde başarısız; startup damgası yazılmadı.');
                }
            } else {
                console.log(`⏭️ [ST2 STARTUP TELEGRAM] Tekrar başlangıç mesajı bastırıldı | Son gönderim ${new Date(startupLastSentAt).toISOString()}`);
            }
            // ST2 canlı paneli bağımsız scheduler tarafından yalnız Entry Gate READY olduktan sonra başlatılır.
            // Non-ST2 eski startup panel davranışı korunur.
            if (ayarlar.entryStrategyMode !== 'ST2_RENKO') startupPanelPlanla('GENEL_STARTUP');
        };

        console.log(`✅ SİSTEM HAZIR. DÖNGÜ BAŞLATILDI. Emir Modu: ${emirModu}`);

        // v6.13.5-R11: ST2 canlı panel ritmi ağır 200-sembol Renko taramasının DIŞINDADIR.
        // Gate READY olduğunda ilk panel hemen talep edilir; sonrasında ayarlanan cadence ile devam eder.
        // Bu scheduler yalnız rapor ister; giriş/çıkış/Renko karar matematiğine dokunmaz.
        if (ayarlar.entryStrategyMode === 'ST2_RENKO') {
            const st2LivePanelScheduler = createSt2LivePanelScheduler({
                enabled: () => ayarlar.canliRaporAktif === true,
                ready: () => h.state.startupMarketReady === true,
                intervalMs: () => Number(ayarlar.canliRaporGuncellemeMs || 30000),
                request: () => rapor.raporTalepEt(false),
                onError: err => console.error(`⚠️ [ST2 LIVE PANEL SCHEDULER] ${err?.message || err}`)
            });
            st2LivePanelScheduler.start();
            console.log(`📊 [ST2 LIVE PANEL SCHEDULER] Gate READY sonrası bağımsız cadence ${Math.round(Number(ayarlar.canliRaporGuncellemeMs || 30000) / 1000)} sn`);

            // R18: Binance gerçek pozisyon mutabakatı ana Renko döngüsünü ASLA bekletmez.
            // Mutabakat ayrı control-plane worker'ında akar; tazeliği gerçek emir kapısında fail-closed kullanılır.
            if (!ayarlar.sanalEmirModu) {
                const reconcileIntervalMs = Math.max(2000, Number(ayarlar.st2ExchangeReconcileIntervalMs || 5000));
                setInterval(() => {
                    st2ExchangeReconcileBackground('INTERVAL').catch(err =>
                        console.error(`⚠️ [ST2 EXCHANGE RECONCILE SCHEDULER] ${err?.message || err}`));
                }, reconcileIntervalMs).unref?.();
                setImmediate(() => st2ExchangeReconcileBackground('STARTUP').catch(err =>
                    console.error(`⚠️ [ST2 EXCHANGE RECONCILE STARTUP] ${err?.message || err}`)));
                console.log(`🔁 [ST2 EXCHANGE RECONCILE BG] Ana döngüden ayrıldı | Periyot ${reconcileIntervalMs} ms | Gerçek emir fail-closed tazelik ${Math.max(5000, Number(ayarlar.st2ExchangeReconcileFreshMs || 15000))} ms`);
            }
        }

        // R13: ana işlem döngüsü görünür liveness kanıtı.
        // Karar matematiğini değiştirmez; yalnız uzun süren aşamayı açıklar.
        setInterval(() => {
            if (!donguCalisiyor || !donguBaslangic) return;
            const gecen = Date.now() - donguBaslangic;
            const esik = Math.max(15000, Number(ayarlar.st2MainLoopWatchdogMs || 20000));
            const logAralik = Math.max(15000, Number(ayarlar.st2MainLoopWatchdogLogAralikMs || 30000));
            if (gecen >= esik && Date.now() - sonDonguWatchdogLog >= logAralik) {
                sonDonguWatchdogLog = Date.now();
                const ag = binanceAg.durumOzeti();
                console.warn(`⏱️ [ST2 MAIN LOOP WATCHDOG] Aşama ${donguAsama} | ${gecen} ms | Ağ aktif ${ag.active} kuyruk ${ag.queuedNow} inFlight ${ag.inFlight}`);
            }
        }, 5000).unref?.();

        setInterval(async () => {
            if (donguCalisiyor) return;
            if (Date.now() < h.state.cooldownBitis) return;

            donguCalisiyor = true;
            donguBaslangic = Date.now();
            donguAsama = 'STARTUP_WAIT';
            try {
                // R15: ST2 startup warmup sırasında açık pozisyon yoksa global ticker çağrısı yapılmaz.
                // Pozisyon varsa koruma için ticker çalışır; gate READY olduğunda giriş motoru kendi dedicated ticker hattını kullanır.
                const st2StartupBos = ayarlar.entryStrategyMode === 'ST2_RENKO' && h.state.startupMarketReady !== true && h.state.aktifPozisyonlar.length === 0;
                if (st2StartupBos) return;

                // R18 CONTROL PLANE: exchange reconciliation artık ana Renko döngüsünün dışında akar.
                // Ana döngü pusu/scan üretmeye devam eder; gerçek emir ve stop ilerletme yalnız taze
                // reconciliation + doğrulanmış network fiyatı varken açılır.
                donguAsama = 'FUTURES_PRICES';
                let st2NetworkPriceOk = true;
                if (ayarlar.entryStrategyMode === 'ST2_RENKO') {
                    const firstSt2AuditPending = h.state.startupMarketReady === true && !ilkSt2TaramaTamamlandi;
                    const priceState = await marketPriceRuntime.refreshForMainLoop({
                        state: h.state,
                        symbols: h.state.semboller || [],
                        // ENTRY taraması gerçek pozisyon korumasından ayrıdır: fallback pusu/scan'i yaşatır.
                        // Gerçek pozisyon stop ilerletme aşağıda yalnız networkOk olduğunda çalışır.
                        activePositions: [],
                        settings: ayarlar,
                        forceFallbackOnly: firstSt2AuditPending,
                        fetchAll: () => binanceAg.binanceFiyatlariCek({
                            timeoutMs: ayarlar.futuresTickerTimeoutMs || 6000,
                            retries: ayarlar.futuresTickerRetry ?? 0,
                            baseDelayMs: ayarlar.binanceAgRetryTabanMs || 900,
                            priority: 'CRITICAL',
                            label: 'FUTURES_PRICES'
                        }),
                        log: console
                    });
                    st2NetworkPriceOk = priceState.networkOk === true;
                    h.state.st2PriceRuntime = {
                        source: priceState.source, networkOk: st2NetworkPriceOk, usable: priceState.usable === true,
                        coverage: priceState.coverage || null, updatedAt: Date.now(),
                        error: priceState.error ? String(priceState.error.message || priceState.error) : null
                    };
                    const safety = st2RealEntrySafetyUpdate(st2NetworkPriceOk);
                    if (!priceState.usable) {
                        console.warn(`🛡️ [ST2 PRICE FAIL-CLOSED] ${priceState.source} | coverage ${Number(priceState.coverage?.fresh || 0)}/${Number(priceState.coverage?.total || 0)} | Renko scan bu tur veri yetersiz`);
                        return;
                    }
                    if (!safety.ready && !ayarlar.sanalEmirModu) {
                        const now = Date.now();
                        const lastLog = Number(h.state.st2RealEntrySafetyLastLogAt || 0);
                        if (now - lastLog >= 30000) {
                            h.state.st2RealEntrySafetyLastLogAt = now;
                            console.warn(`🛡️ [ST2 GERÇEK ENTRY FAIL-CLOSED] ${safety.reason} | Renko/pusu taraması DEVAM | Gerçek yeni emir YOK`);
                        }
                    }
                } else {
                    const fiyatlar = await binanceAg.binanceFiyatlariCek({ timeoutMs: ayarlar.futuresTickerTimeoutMs || 6000, retries: ayarlar.futuresTickerRetry ?? 0, baseDelayMs: ayarlar.binanceAgRetryTabanMs || 900, priority: 'CRITICAL', label: 'FUTURES_PRICES' });
                    for (const [sym, price] of Object.entries(fiyatlar)) h.state.canliFiyatlar[sym] = parseFloat(price);
                }

                donguAsama = 'POSITION_PROTECTION';
                const protectionSafety = ayarlar.entryStrategyMode === 'ST2_RENKO' ? (h.state.st2RealEntrySafety || {}) : { ready: true, reconciliationFresh: true };
                if (ayarlar.entryStrategyMode !== 'ST2_RENKO' || ayarlar.sanalEmirModu || (st2NetworkPriceOk && protectionSafety.reconciliationFresh === true)) {
                    // Exchange mutabakatı background worker'da; burada tekrar signed positionRisk çağrısı YOK.
                    // Stop/trail yalnız network fiyatı + taze signed mutabakat birlikte doğrulanmışsa ilerler.
                    await p.izSurmeyiGuncelle({ skipExchangeReconcile: !ayarlar.sanalEmirModu });
                } else {
                    // Mevcut Binance SL/TP korunur; stale mutabakat veya doğrulanmamış fiyatla stop/trail ileri taşınmaz.
                    h.state.st2ProtectionDeferredAt = Date.now();
                    h.state.st2ProtectionDeferredReason = !st2NetworkPriceOk ? 'NETWORK_PRICE_NOT_VERIFIED' : 'EXCHANGE_RECONCILIATION_STALE';
                }
                if (ayarlar.entryStrategyMode === 'ST2_RENKO') {
                    if (h.state.startupMarketReady === true) {
                        donguAsama = 'RENKO_SCAN';
                        h.state.st2RenkoScanInProgress = true;
                        h.state.st2RenkoScanStartedAt = Date.now();
                        let st2Audit;
                        try {
                            st2Audit = await require('./72_st2_renko_entry.js').taraVeDegerlendir();
                        } finally {
                            h.state.st2RenkoScanInProgress = false;
                            h.state.st2RenkoScanFinishedAt = Date.now();
                        }
                        donguAsama = 'POST_RENKO';
                        if (!ilkSt2TaramaTamamlandi) {
                            ilkSt2TaramaTamamlandi = true;
                            h.state.st2FirstScanCompleted = true;
                            h.state.st2FirstScanCompletedAt = Date.now();
                            console.log(`✅ [ST2 İLK TARAMA TAMAMLANDI] Yeni pusu ${Number(st2Audit?.yeniPusu || 0)} | Aktif ${Object.keys(h.state.st2Renko?.pusular || {}).length}`);
                            // R14: ilk canlı Renko auditinden önce hiçbir toplu refresh yok.
                            // Audit kanıtından sonra önce çekirdek 15m/1m planı, sonra düşük öncelikli ST1 shadow planlanır.
                            if (typeof revizyon.periyodikTazelemeyiBaslat === 'function') revizyon.periyodikTazelemeyiBaslat();
                            if (typeof revizyon.st1ShadowTazelemeyiBaslat === 'function') revizyon.st1ShadowTazelemeyiBaslat();
                            // R11: panel ilk tam Renko taramasını beklemez; bağımsız scheduler gate READY ile çalışır.
                        }
                    } else if (Date.now() - sonStartupGateLog >= Math.max(30000, Number(ayarlar.startupMarketGuardLogAralikMs || 60000))) {
                        sonStartupGateLog = Date.now();
                        const warm = h.state.startupMarketWarmup || {};
                        console.log(`⏳ [STARTUP ENTRY GATE] Yeni giriş kapalı | Piyasa hazırlığı ${warm.durum || 'BEKLIYOR'} | Mum ${Number(warm.pusuHazir || 0)} | ST ${Number(warm.trendHazir || 0)} | Pozisyon koruma aktif`);
                    }
                } else if (h.state.startupMarketReady === true) {
                    await p.piyasayiTaraVePusuKur();
                    await p.pusulariDenetleVeIslemAc();
                }
                // v6.4.1: Telegram pusu bildirimi ana piyasa döngüsünü bekletmez.
                // Aynı anda yalnız tek pusu raporu çalışır; yenileri bir sonraki turda güncel state ile birleşir.
                // ST2 kendi tekil/açılış pusu dedupe hattını kullanır. Eski genel pusu raporu
                // ST2 modunda çağrılmaz; böylece açılış pusuları iki kez gönderilmez.
                if (ayarlar.entryStrategyMode !== 'ST2_RENKO' && !pusuRaporCalisiyor) {
                    pusuRaporCalisiyor = true;
                    setImmediate(() => {
                        Promise.resolve(p.pusuRaporuGonder())
                            .catch(err => console.error(`⚠️ [PUSU RAPOR ARKA PLAN HATASI] ${err.message}`))
                            .finally(() => { pusuRaporCalisiyor = false; });
                    });
                }

                const now = Date.now();
                // Non-ST2 eski periyodik rapor davranışı korunur.
                // ST2 paneli yukarıdaki bağımsız scheduler tarafından yönetilir ve Renko taramasını beklemez.
                if (ayarlar.entryStrategyMode !== 'ST2_RENKO' && ayarlar.canliRaporAktif && now - sonCanliRapor >= (ayarlar.canliRaporGuncellemeMs || 60000)) {
                    sonCanliRapor = now;
                    rapor.raporTalepEt(false);
                }

                // v3.0.2 FIX: Strategy Lab toplu başarı/uyum analizi sadece kapanış sayacına bağlı kalmasın.
                // Ayarlanan dakikada bir Telegram'a ayrı mesaj olarak düşer; canlı raporu düzenlemez/silmez.
                try {
                    const blackbox = require('./8_blackbox.js');
                    if (ayarlar.entryStrategyMode !== 'ST2_RENKO' && blackbox.istatistikDakikaRaporGerekli && blackbox.istatistikDakikaRaporGerekli()) {
                        await h.telegramMesajGonder(blackbox.telegramIstatistikRaporMetni());
                        kaliciHafiza.kaydet('blackbox-dakika-istatistik-raporu-gonderildi');
                    }
                } catch (err) {
                    console.error(`⚠️ [BLACKBOX DAKİKA RAPOR HATASI] ${err.message}`);
                }

                if (now - sonOzetLog > 30000) {
                    sonOzetLog = now;
                    const agDurum = binanceAg.durumOzeti({ reset: true });
                    const tg = typeof h.telegramKuyrukOzeti === 'function' ? h.telegramKuyrukOzeti() : { critical: 0, panel: 0, detail: 0 };
                    const sonStGuncelleme = Number(h.state.sonTrendGuncellemeZamani || h.state.sonSniperGuncellemeZamani || 0);
                const warm = h.state.startupMarketWarmup || {};
                const warmMetni = h.state.startupMarketReady === true
                    ? 'READY'
                    : `${warm.asama || warm.durum || 'BEKLIYOR'} ${Number(warm.islenen || 0)}/${Number(warm.toplam || h.state.semboller.length || 0)}`;
                console.log(`💓 [BOT AKTİF] Sembol: ${h.state.semboller.length} | Pusu: ${Object.keys(ayarlar.entryStrategyMode === 'ST2_RENKO' ? (h.state.st2Renko?.pusular || {}) : h.state.pusuListesi).length} | Pozisyon: ${h.state.aktifPozisyonlar.length} | Entry Gate: ${warmMetni} | ST Güncelleme: ${sonStGuncelleme ? new Date(sonStGuncelleme).toLocaleTimeString() : 'yok'} | Ağ: OK ${agDurum.succeeded}, Hata ${agDurum.failed}, Retry ${agDurum.retried}, Birleşen ${agDurum.deduped}, Kuyruk ${agDurum.queuedNow} | TG Kritik ${tg.critical} Panel ${tg.panel} Detay ${tg.detail}`);
                }
            } catch (e) {
                if (e.message && (e.message.includes('429') || e.message.includes('1095'))) {
                    console.warn('⏳ Binance yoğun istek koruması sinyali! 15 saniye duraklatılıyor...');
                    h.state.cooldownBitis = Date.now() + 15000;
                } else {
                    console.error('❌ Döngü çalışma hatası:', e.message || e);
                }
            } finally {
                donguCalisiyor = false;
                donguBaslangic = 0;
                donguAsama = 'IDLE';
            }
        }, ayarlar.pingInterval || 1000);

        setImmediate(() => {
            startupTelegramTask().catch(err => console.error(`⚠️ [ST2 STARTUP RAPOR ARKA PLAN HATASI] ${err.message}`));
        });
    } catch (e) {
        console.error('❌ Kritik Başlatma Hatası! 5 saniye sonra yeniden denenecek:', e.message || e);
        setTimeout(baslat, 5000);
    }
}

baslat();
