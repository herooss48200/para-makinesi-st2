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
const { createSt2LivePanelScheduler } = require('./92_st2_live_panel_scheduler.js');
const marketPriceRuntime = require('./93_st2_market_price_runtime.js');
binanceAg.configure({ concurrency: ayarlar.binanceAgEszamanlilik || 3 });

let donguCalisiyor = false;
let sonOzetLog = 0;
let ilkSt2TaramaTamamlandi = false;
let sonStartupGateLog = 0;
let startupEarlyDeliveryPromise = null;
let donguBaslangic = 0;
let donguAsama = 'IDLE';
let sonDonguWatchdogLog = 0;
let exchangeReconcileTask = null;
let startupExchangeReconcileTask = null;
let sonStartupProtectionAt = 0;

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
    const marketReady = h.state.startupMarketReady === true;
    const startupUnblocked = h.state.realOrderStartupBlocked !== true;
    const realEntrySafe = ayarlar.sanalEmirModu === true || (marketReady && startupUnblocked && reconciliationFresh && networkOk);
    h.state.st2RealEntrySafety = {
        ready: realEntrySafe,
        reconciliationFresh,
        priceNetworkOk: networkOk,
        marketReady,
        startupUnblocked,
        updatedAt: now,
        reason: realEntrySafe ? 'READY' : (!marketReady ? 'MARKET_WARMUP_NOT_READY' : (!startupUnblocked ? 'STARTUP_RECONCILIATION_PENDING' : (!reconciliationFresh ? 'EXCHANGE_RECONCILIATION_STALE' : 'NETWORK_PRICE_NOT_VERIFIED')))
    };
    return h.state.st2RealEntrySafety;
}

async function st2ExchangeReconcileBackground(reason = 'INTERVAL') {
    if (ayarlar.sanalEmirModu) {
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
        // R26 CORE ONLY: aktif runtime yalnız gerçek pozisyonları taşır. Tarihsel deney kayıtları runtime'a yüklenmez.
        if (!ayarlar.sanalEmirModu) {
            const once = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar.length : 0;
            const gercekler = (h.state.aktifPozisyonlar || []).filter(pos => pos?.sanal === false);
            const temizlenen = Math.max(0, once - gercekler.length);
            h.state.aktifPozisyonlar = gercekler;
            h.state.alinanlar = gercekler.filter(p => String(p?.yon || '').toUpperCase() === 'LONG').map(p => p.sym);
            h.state.aktifShortlar = gercekler.filter(p => String(p?.yon || '').toUpperCase() === 'SHORT').map(p => p.sym);
            console.log(`🧹 [CORE RUNTIME] Aktif deney yaşamı kaldırıldı ${temizlenen} | Korunan gerçek ${gercekler.length}`);
        }
        await piyasa.sembolleriYukle();
        // v6.11.0: Signed Futures çağrıları ve restart mutabakatı raw sistem saatine bırakılmaz.
        const timeHealth = await h.binanceTimeSync({ force: true });
        if (!ayarlar.sanalEmirModu && timeHealth?.healthy !== true) throw new Error('BINANCE_TIME_AUTHORITY_NOT_READY');
        h.binanceTimeStartPeriodic();
        console.log(`⏱️ [BINANCE TIME AUTHORITY] ${timeHealth?.healthy ? 'HEALTHY' : 'DEGRADED'} | Offset ${Number(timeHealth?.offsetMs || 0)} ms | RTT ${Number(timeHealth?.lastRttMs || 0)} ms`);
        if (ayarlar.sanalEmirModu) {
            await piyasa.acikPozisyonlariBorsadanDevral();
            const rec = st2ExchangeReconcileState();
            rec.status = 'VIRTUAL'; rec.ok = true; rec.lastOkAt = Date.now();
            rec.lastAttemptAt = rec.lastOkAt; rec.lastFinishAt = rec.lastOkAt; rec.lastDurationMs = 0; rec.error = null;
            h.state.realOrderStartupBlocked = false;
            st2RealEntrySafetyUpdate(false);
        } else {
            // R26 CORE PHASED STARTUP: warmup öncesi yalnız tek bounded positionRisk snapshot.
            // Ağır open-order/history/accounting reconciliation warmup ile ASLA yarışmaz.
            const snapshot = await piyasa.acikPozisyonlariHizliDevral();
            const rec = st2ExchangeReconcileState();
            rec.status = 'WARMUP_DEFERRED'; rec.ok = false; rec.lastAttemptAt = Date.now();
            rec.error = 'FULL_RECONCILIATION_DEFERRED_UNTIL_MARKET_READY';
            h.state.realOrderStartupBlocked = true;
            st2RealEntrySafetyUpdate(false);
            console.log(`🔐 [GERÇEK RESTART MUTABAKATI] SAFETY SNAPSHOT ${Array.isArray(snapshot?.positions) ? snapshot.positions.length : 0} | Full mutabakat warmup READY sonrası | Yeni gerçek entry FAIL-CLOSED`);
        }
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
                    '⏳ 15m/1m Renko çekirdeği hazırlanıyor; yeni gerçek emir hazır olana kadar fail-closed.'
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
                    console.log(`${summary?.ready ? '✅' : '⚠️'} [STARTUP MARKET WARMUP] ${summary?.ready ? 'MARKET READY' : 'ENTRY GATE KAPALI'} | ${Number(summary?.pusuHazir || 0)}/${Number(summary?.total || 0)} mum | ${Number(summary?.trendHazir || 0)}/${Number(summary?.total || 0)} ST`);
                    if (!ayarlar.sanalEmirModu && summary?.ready === true && !startupExchangeReconcileTask) {
                        const rec = st2ExchangeReconcileState();
                        rec.status = 'POST_WARMUP_RUNNING'; rec.ok = false; rec.lastAttemptAt = Date.now(); rec.error = null;
                        h.state.realOrderStartupBlocked = true;
                        st2RealEntrySafetyUpdate();
                        startupExchangeReconcileTask = Promise.resolve()
                            .then(() => piyasa.acikPozisyonlariBorsadanDevral())
                            .then(result => {
                                rec.status = 'READY'; rec.ok = true; rec.lastFinishAt = Date.now();
                                rec.lastDurationMs = rec.lastFinishAt - Number(rec.lastAttemptAt || rec.lastFinishAt);
                                rec.lastOkAt = rec.lastFinishAt; rec.error = null;
                                h.state.realOrderStartupBlocked = Boolean(result?.blocked);
                                st2RealEntrySafetyUpdate();
                                console.log(`✅ [GERÇEK FULL MUTABAKAT POST-WARMUP] Tamamlandı | Gerçek ${Array.isArray(result?.positions) ? result.positions.length : 0} | ${rec.lastDurationMs}ms`);
                                return result;
                            })
                            .catch(err => {
                                rec.status = 'DEGRADED'; rec.ok = false; rec.lastFinishAt = Date.now();
                                rec.lastDurationMs = rec.lastFinishAt - Number(rec.lastAttemptAt || rec.lastFinishAt);
                                rec.error = String(err?.message || err); h.state.realOrderStartupBlocked = true;
                                st2RealEntrySafetyUpdate();
                                console.error(`⚠️ [GERÇEK FULL MUTABAKAT POST-WARMUP] ${rec.error} | Yeni gerçek entry kapalı`);
                                return { blocked: true, error: rec.error };
                            })
                            .finally(() => { startupExchangeReconcileTask = null; });
                    }
                })
                .catch(err => {
                    h.state.startupMarketReady = false;
                    h.state.startupMarketWarmup = { ...(h.state.startupMarketWarmup || {}), durum: 'FAILED', hataMesaji: err.message, tamamlanma: new Date().toISOString() };
                    console.error(`❌ [STARTUP MARKET WARMUP] ${err.message} | Yeni giriş kapalı, pozisyon koruma açık.`);
                });
        });

        console.log('🧹 [CORE RUNTIME] Yalnız ST2 Renko + Premier/N5 + gerçek execution zinciri aktif.');

        const emirModu = ayarlar.sanalEmirModu ? 'SANAL EMİR MODU' : 'BINANCE EMİR MODU';
        const baslangicMesaji = `🚀 <b>PARA MAKİNESİ BOTU AKTİF</b>\n\n` +
            `🧪 Emir Modu: ${emirModu}\n` +
            `🧩 Versiyon: ${versiyonBilgi.telegramOzet()}\n` +
            `📊 Strateji: ${ayarlar.renkoKaynakPeriyodu || ayarlar.pusuPeriyodu} ATR-Renko pusu + Entry Evolution + 1m Renko SuperTrend\n` +
            `📡 İzlenen Evren: ${h.state.semboller.length}/${Number(ayarlar.taranacakCoinSayisi || 200)} | Veri ${h.state.sembolVeriSagligi?.durum || 'BEKLIYOR'}\n` +
            `🧠 Geri Yüklenen Pozisyon: ${h.state.aktifPozisyonlar.length}\n` +
            `⭐ Premier seçimi: Score + N5 canlı ekonomi + Renko Premier koruması\n` +
            `📊 Giriş: Direct/Confirmed + Entry Evolution + 1m Renko ST\n` +
            `🔒 Gerçek emir: fail-closed\n` +
            `🛡️ Binance minimumu karşılanmazsa emir güvenle atlanır.\n` +
            `<i>Sistem kapanmış mumları izliyor, pusu kuruyor ve sniper tetik bekliyor...</i>`;

        const fs = require('fs');
        const path = require('path');
        const startupStampFile = path.join(process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data'), 'st2-startup-telegram.json');
        let startupLastSentAt = 0;
        try { startupLastSentAt = Number(JSON.parse(fs.readFileSync(startupStampFile, 'utf8'))?.lastSentAt || 0); } catch (_) {}
        const startupCooldownMs = 10 * 60 * 1000;
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
            // R26 CORE ONLY: yalnız ST2 panel scheduler kullanılır.
        };

        console.log(`✅ SİSTEM HAZIR. DÖNGÜ BAŞLATILDI. Emir Modu: ${emirModu}`);

        // v6.13.5-R11: ST2 canlı panel ritmi ağır 200-sembol Renko taramasının DIŞINDADIR.
        // Gate READY olduğunda ilk panel hemen talep edilir; sonrasında ayarlanan cadence ile devam eder.
        // Bu scheduler yalnız rapor ister; giriş/çıkış/Renko karar matematiğine dokunmaz.
        if (ayarlar.entryStrategyMode === 'ST2_RENKO') {
            const st2LivePanelScheduler = createSt2LivePanelScheduler({
                enabled: () => ayarlar.canliRaporAktif === true,
                ready: () => h.state.startupMarketReady === true, // R26: warmup CPU tek başına; operasyon paneli READY sonrası.
                intervalMs: () => Number(ayarlar.canliRaporGuncellemeMs || 30000),
                request: () => rapor.raporTalepEt(false),
                onError: err => console.error(`⚠️ [ST2 LIVE PANEL SCHEDULER] ${err?.message || err}`)
            });
            st2LivePanelScheduler.start();
            console.log(`📊 [ST2 LIVE PANEL SCHEDULER] Startup dahil bağımsız cadence ${Math.round(Number(ayarlar.canliRaporGuncellemeMs || 30000) / 1000)} sn`);

            // R18: Binance gerçek pozisyon mutabakatı ana Renko döngüsünü ASLA bekletmez.
            // Mutabakat ayrı control-plane worker'ında akar; tazeliği gerçek emir kapısında fail-closed kullanılır.
            if (!ayarlar.sanalEmirModu) {
                const reconcileIntervalMs = Math.max(2000, Number(ayarlar.st2ExchangeReconcileIntervalMs || 5000));
                setInterval(() => {
                    if (h.state.startupMarketReady !== true || h.state.realOrderStartupBlocked === true || startupExchangeReconcileTask) return;
                    st2ExchangeReconcileBackground('INTERVAL').catch(err =>
                        console.error(`⚠️ [ST2 EXCHANGE RECONCILE SCHEDULER] ${err?.message || err}`));
                }, reconcileIntervalMs).unref?.();
                console.log(`🔁 [ST2 EXCHANGE RECONCILE BG] Warmup sonrası aktif | Periyot ${reconcileIntervalMs} ms | Gerçek emir fail-closed tazelik ${Math.max(5000, Number(ayarlar.st2ExchangeReconcileFreshMs || 15000))} ms`);
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
                // R26 CORE ONLY: warmup sırasında ana loop tarama yapmaz.
                // Gerçek pozisyon varsa yalnız 5 sn aralıkla fiyat/koruma çalışır; böylece startup KLINE CPU'yu tek başına kullanır.
                if (h.state.startupMarketReady !== true) {
                    const realPositions = (h.state.aktifPozisyonlar || []).filter(pos => pos?.sanal === false);
                    if (realPositions.length === 0) return;
                    const protectionEveryMs = Math.max(5000, Number(ayarlar.st2StartupProtectionIntervalMs || 5000));
                    if (Date.now() - sonStartupProtectionAt < protectionEveryMs) return;
                    sonStartupProtectionAt = Date.now();
                }

                // R18 CONTROL PLANE: exchange reconciliation artık ana Renko döngüsünün dışında akar.
                // Ana döngü pusu/scan üretmeye devam eder; gerçek emir ve stop ilerletme yalnız taze
                // reconciliation + doğrulanmış network fiyatı varken açılır.
                donguAsama = 'FUTURES_PRICES';
                let st2NetworkPriceOk = true;
                {
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
                }

                donguAsama = 'POSITION_PROTECTION';
                const protectionSafety = h.state.st2RealEntrySafety || {};
                if (ayarlar.sanalEmirModu || (st2NetworkPriceOk && protectionSafety.reconciliationFresh === true)) {
                    // R26 CORE ONLY: tek gerçek pozisyon koruma yolu.
                    await p.izSurmeyiGuncelle({ skipExchangeReconcile: !ayarlar.sanalEmirModu });
                } else {
                    h.state.st2ProtectionDeferredAt = Date.now();
                    h.state.st2ProtectionDeferredReason = !st2NetworkPriceOk ? 'NETWORK_PRICE_NOT_VERIFIED' : 'EXCHANGE_RECONCILIATION_STALE';
                }

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
                        if (typeof revizyon.periyodikTazelemeyiBaslat === 'function') revizyon.periyodikTazelemeyiBaslat();
                    }
                } else if (Date.now() - sonStartupGateLog >= Math.max(30000, Number(ayarlar.startupMarketGuardLogAralikMs || 60000))) {
                    sonStartupGateLog = Date.now();
                    const warm = h.state.startupMarketWarmup || {};
                    console.log(`⏳ [STARTUP ENTRY GATE] Yeni giriş kapalı | Piyasa hazırlığı ${warm.durum || 'BEKLIYOR'} | Mum ${Number(warm.pusuHazir || 0)} | ST ${Number(warm.trendHazir || 0)} | Pozisyon koruma aktif`);
                }

                const now = Date.now();

                if (now - sonOzetLog > 30000) {
                    sonOzetLog = now;
                    const agDurum = binanceAg.durumOzeti({ reset: true });
                    const tg = typeof h.telegramKuyrukOzeti === 'function' ? h.telegramKuyrukOzeti() : { critical: 0, panel: 0, detail: 0 };
                    const sonStGuncelleme = Number(h.state.sonTrendGuncellemeZamani || h.state.sonSniperGuncellemeZamani || 0);
                const warm = h.state.startupMarketWarmup || {};
                const warmHazir = Math.min(Number(warm.pusuHazir || 0), Number(warm.trendHazir || 0));
                const warmMetni = h.state.startupMarketReady === true
                    ? 'READY'
                    : `${warm.asama || warm.durum || 'BEKLIYOR'} READY ${warmHazir}/${Number(warm.toplam || h.state.semboller.length || 0)} (işlenen ${Number(warm.islenen || 0)})`;
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
