delete require.cache[require.resolve('./ayarlar.js')];
const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const m = require('./motor.js');
const ag = require('./64_binance_network_resilience.js');
const renkoCore = require('./72_st2_renko_core.js');

let pusuTazelemeCalisiyor = false;
let superTrendCalisiyor = false;
let sonPusuBasariliBucket = null;
let sonPusuDenemeBucket = null;
let sonPusuDenemeZamani = 0;
let sonSniperBasariliBucket = null;
let sonTrendBasariliBucket = null;
let sonSniperDenemeBucket = null;
let sonTrendDenemeBucket = null;
let sonSuperTrendDenemeZamani = 0;
const overlapLogAt = { pusu: 0, superTrend: 0 };
let pusuTimerRef = null;
let stTimerRef = null;
function readyRatioThreshold() { return Math.max(0.80, Math.min(1, Number(ayarlar.startupMarketReadyOrani || 0.95))); }
function aktifEvrenSeti() { return new Set((h.state.semboller || []).map(String)); }
function cacheHazirSayisi(cache) {
    const aktif = aktifEvrenSeti();
    return Object.keys(cache || {}).filter(sym => aktif.has(String(sym))).length;
}

function renko1mBaseLimit() { return Math.max(80, Number(ayarlar.renkoOnayKaynakMumLimiti || 80)); }
function renko1mRepairLimit() { return Math.max(renko1mBaseLimit(), Number(ayarlar.renkoOnayDerinOnarimMumLimiti || 240)); }
function renko1mMaxRepairLimit() { return Math.max(renko1mRepairLimit(), Number(ayarlar.renkoOnayMaksOnarimMumLimiti || 480)); }
function renko1mAnaliz(mumlar) {
    const raw = Array.isArray(mumlar) ? mumlar : [];
    const atrPeriod = Math.max(1, Number(ayarlar.renkoOnayAtrPeriod || 14));
    const stPeriod = Math.max(1, Number(ayarlar.renkoOnaySuperTrendPeriod || 10));
    const minRaw = atrPeriod + 2;
    const minBricks = stPeriod + 2;
    if (raw.length < minRaw) return { ready:false, reason:'RAW_1M_YETERSIZ', rawCount:raw.length, minRaw, brickCount:0, minBricks, boxSize:0, trend:null, value:0, bricks:[] };
    const boxSize = renkoCore.atr(raw, atrPeriod);
    if (!(boxSize > 0)) return { ready:false, reason:'ATR_1M_GECERSIZ', rawCount:raw.length, minRaw, brickCount:0, minBricks, boxSize:0, trend:null, value:0, bricks:[] };
    const bricks = renkoCore.renkoUret(raw, boxSize);
    if (bricks.length < minBricks) return { ready:false, reason:'RENKO_1M_TUGLA_YETERSIZ', rawCount:raw.length, minRaw, brickCount:bricks.length, minBricks, boxSize, trend:null, value:0, bricks };
    const st = m.hesaplaSuperTrend(bricks, stPeriod, Number(ayarlar.renkoOnaySuperTrendMultiplier || 3));
    const trend = ['UP','DOWN'].includes(String(st?.trend || '').toUpperCase()) ? String(st.trend).toUpperCase() : null;
    if (!trend) return { ready:false, reason:'RENKO_1M_ST_YOK', rawCount:raw.length, minRaw, brickCount:bricks.length, minBricks, boxSize, trend:null, value:Number(st?.value||0), bricks };
    return { ready:true, reason:'READY', rawCount:raw.length, minRaw, brickCount:bricks.length, minBricks, boxSize, trend, value:Number(st?.value||0), bricks };
}
function renko1mHazirlikKaydet(sym, mumlar, sourceLimit = 0) {
    const analiz = renko1mAnaliz(mumlar);
    h.state.renko1mStHazirlik ||= {};
    h.state.renko1mStCache ||= {};
    h.state.renko1mStHazirlik[sym] = {
        ready: analiz.ready === true, reason: analiz.reason, rawCount: analiz.rawCount,
        brickCount: analiz.brickCount, minBricks: analiz.minBricks, boxSize: analiz.boxSize,
        trend: analiz.trend, sourceLimit: Math.max(Number(sourceLimit||0), analiz.rawCount),
        sourceCloseTime: Number((Array.isArray(mumlar) && mumlar.length ? mumlar.at(-1)?.closeTime : 0) || 0),
        updatedAt: Date.now()
    };
    if (analiz.ready) {
        h.state.renko1mStCache[sym] = {
            trend: analiz.trend, value: analiz.value, bricks: analiz.bricks, boxSize: analiz.boxSize,
            sourceCloseTime: Number((Array.isArray(mumlar) && mumlar.length ? mumlar.at(-1)?.closeTime : 0) || 0),
            updatedAt: Date.now()
        };
    } else {
        delete h.state.renko1mStCache[sym];
    }
    return analiz;
}
function renko1mHazirSayisi() {
    const aktif = aktifEvrenSeti();
    return Object.entries(h.state.renko1mStHazirlik || {}).filter(([sym,x]) => aktif.has(String(sym)) && x?.ready === true).length;
}
function renko1mYetersizSemboller(symbols = h.state.semboller || []) {
    return Array.from(symbols || []).filter(sym => h.state.renko1mStHazirlik?.[sym]?.ready !== true);
}
function overlapLog(kind, message) {
    const now = Date.now();
    const interval = Math.max(30000, Number(ayarlar.startupMarketGuardLogAralikMs || 60000));
    if (now - Number(overlapLogAt[kind] || 0) < interval) return;
    overlapLogAt[kind] = now;
    console.log(message);
}
function startupOnayHazirSayisi() {
    if (ayarlar.entryStrategyMode === 'ST2_RENKO') return renko1mHazirSayisi();
    return cacheHazirSayisi(h.state.trendSuperTrend);
}
function startupMarketDurumuGuncelle(source = 'REFRESH') {
    const total = Math.max(1, Number(h.state.semboller?.length || 0));
    const pusuHazir = cacheHazirSayisi(h.state.yerelPusuHafizasi);
    const onayHazir = startupOnayHazirSayisi();
    const threshold = readyRatioThreshold();
    const pusuRatio = pusuHazir / total;
    const onayRatio = onayHazir / total;
    const ratio = Math.min(pusuRatio, onayRatio);
    const ready = pusuRatio >= threshold && onayRatio >= threshold;
    const wasReady = h.state.startupMarketReady === true;
    const current = h.state.startupMarketWarmup || {};

    if (ready) h.state.startupMarketReady = true;
    h.state.startupMarketWarmup = {
        ...current,
        durum: ready ? 'READY' : (wasReady ? 'READY_CACHED' : (current.durum === 'CALISIYOR' ? 'CALISIYOR' : 'DEGRADED')),
        tamamlanma: ready ? (current.tamamlanma || new Date().toISOString()) : current.tamamlanma,
        pusuHazir,
        trendHazir: onayHazir,
        sniperHazir: cacheHazirSayisi(h.state.sniperMumlar),
        renko1mStHazir: ayarlar.entryStrategyMode === 'ST2_RENKO' ? onayHazir : undefined,
        renko1mStYetersiz: ayarlar.entryStrategyMode === 'ST2_RENKO' ? Math.max(0, total - onayHazir) : undefined,
        oran: ratio,
        sonKontrol: new Date().toISOString(),
        sonKaynak: source
    };
    if (ready && !wasReady) {
        const onayEtiketi = ayarlar.entryStrategyMode === 'ST2_RENKO' ? '1m Renko ST' : 'ST1 trend';
        console.log(`✅ [STARTUP ENTRY GATE] AÇILDI | Kaynak ${source} | 15m Mum ${pusuHazir}/${total} | ${onayEtiketi} ${onayHazir}/${total} | Eşik %${(threshold * 100).toFixed(0)}`);
    }
    return { ready: h.state.startupMarketReady === true, currentReady: ready, pusuHazir, trendHazir: onayHazir, onayHazir, total, ratio, threshold };
}
function periyodikTazelemeyiBaslat() {
    if (!pusuTimerRef) {
        pusuTimerRef = setInterval(() => {
            pusuVerileriniTazele().catch(e => console.error('❌ Pusu tazeleme üst hata:', e.message));
        }, ayarlar.pusuVeriTazelemeMs || 30000);
        pusuTimerRef.unref?.();
    }
    if (!stTimerRef) {
        stTimerRef = setInterval(() => {
            superTrendHesapla(false).catch(e => console.error('❌ SuperTrend üst hata:', e.message));
        }, ayarlar.superTrendTazelemeMs || 15000);
        stTimerRef.unref?.();
    }
}

function mumDonustur(x) {
    return { openTime:Number(x.openTime), closeTime:Number(x.closeTime), open:parseFloat(x.open), high:parseFloat(x.high), low:parseFloat(x.low), close:parseFloat(x.close), volume:parseFloat(x.volume || 0) };
}
function sadeceKapanmisMumlar(mumlar) { const now=Date.now(); return (mumlar||[]).filter(x=>Number(x.closeTime)<=now).map(mumDonustur); }
function superTrendOnayPeriyodu() { return ayarlar.superTrendPeriyodu || ayarlar.trendPeriyodu || ayarlar.sniperPeriyodu || '5m'; }
function pusuKaynakPeriyodu() { return ayarlar.entryStrategyMode === 'ST2_RENKO' ? (ayarlar.renkoKaynakPeriyodu || ayarlar.pusuPeriyodu || '15m') : (ayarlar.pusuPeriyodu || '5m'); }
function pusuMumLimiti() {
    const normal = (ayarlar.bollingerperiod || 20) + 5;
    if (ayarlar.entryStrategyMode !== 'ST2_RENKO') return normal;
    return Math.max(normal, Number(ayarlar.renkoKaynakMumLimiti || 250));
}
function intervalMs(interval) {
    const match = String(interval || '').trim().toLowerCase().match(/^(\d+)([mhdw])$/);
    if (!match) return 60_000;
    const value = Math.max(1, Number(match[1]) || 1);
    const unit = { m:60_000, h:3_600_000, d:86_400_000, w:604_800_000 }[match[2]];
    return value * unit;
}
function closedCandleBucket(interval, now = Date.now()) {
    const lag = Math.max(1_000, Number(ayarlar.kapanmisMumYayinGecikmesiMs || 3_000));
    return Math.floor(Math.max(0, Number(now) - lag) / intervalMs(interval));
}
function refreshDue(currentBucket, successBucket, attemptBucket, attemptAt, now = Date.now()) {
    if (successBucket == null || currentBucket > successBucket) {
        const retryMs = Math.max(30_000, Number(ayarlar.binanceTopluVeriRetryMs || 90_000));
        if (attemptBucket === currentBucket && Number(now) - Number(attemptAt || 0) < retryMs) return false;
        return true;
    }
    return false;
}
function agAyar(label, priority = 'LOW') {
    return {
        timeoutMs: ayarlar.binanceAgTimeoutMs || 15000,
        retries: ayarlar.binanceAgRetry ?? 2,
        baseDelayMs: ayarlar.binanceAgRetryTabanMs || 900,
        priority,
        label
    };
}
async function mumCek(sym, interval, limit, label, priority = 'LOW') {
    return ag.binanceMumlariCek(sym, interval, limit, agAyar(label, priority));
}
async function sembolHavuzu(worker, options = {}) {
    const concurrency = Math.max(1, Number(options.concurrency || ayarlar.binanceAgEszamanlilik || 3));
    const workers = Math.max(concurrency, Number(options.workers || ayarlar.binanceAgIsciSayisi || 8));
    ag.configure({ concurrency });
    return ag.havuzdaCalistir(Array.from(options.symbols || h.state.semboller || []), worker, workers);
}

async function derinGecmisiInsaEt(options = {}) {
    const baslangic = Date.now();
    const startupConcurrency = Math.max(1, Number(options.concurrency || ayarlar.binanceStartupAgEszamanlilik || 8));
    const startupWorkers = Math.max(startupConcurrency, Number(options.workers || ayarlar.binanceStartupAgIsciSayisi || 16));
    const threshold = readyRatioThreshold();
    const tumSemboller = [...(h.state.semboller || [])];
    const toplam = Math.max(1, tumSemboller.length);
    const pusuTf = pusuKaynakPeriyodu();
    const sniperTf = ayarlar.sniperPeriyodu || ayarlar.renkoOnayPeriyodu || '1m';
    const trendTf = superTrendOnayPeriyodu();

    h.state.startupMarketReady = false;
    h.state.startupMarketWarmup = {
        durum: 'CALISIYOR', asama: 'CORE_15M_1M_RENKO', baslangic: new Date().toISOString(), tamamlanma: null,
        pusuHazir: 0, trendHazir: 0, sniperHazir: 0, islenen: 0, toplam,
        oran: 0, hata: 0, sonIlerleme: new Date().toISOString()
    };
    console.log(`📥 [AŞAMALI BAŞLANGIÇ] Golden Renko çekirdeği hazırlanıyor | ${pusuTf} ATR-Renko + ${sniperTf} Renko ST verisi | Eşzamanlılık ${startupConcurrency} | ${trendTf} ST1 yalnız shadow sonra.`);

    h.state.yerelPusuHafizasi={}; h.state.canliFiyatlar={}; h.state.sniperMumlar={}; h.state.sniperCanliMumlar={}; h.state.sniperSuperTrend={}; h.state.sniperSuperTrendCanli={}; h.state.trendMumlar={}; h.state.trendCanliMumlar={}; h.state.trendSuperTrend={}; h.state.trendSuperTrendCanli={}; h.state.sonPusuMumZamani={}; h.state.renko1mStHazirlik={}; h.state.renko1mStCache={};

    let islenen=0, pusuHata=0, sniperHata=0;
    try {
        await sembolHavuzu(async sym => {
            const [pusuSonuc, sniperSonuc] = await Promise.allSettled([
                mumCek(sym, pusuTf, pusuMumLimiti(), `START_CANDLE:${sym}`, 'HIGH'),
                mumCek(sym, sniperTf, renko1mBaseLimit(), `START_SNIPER:${sym}`, 'HIGH')
            ]);

            if (pusuSonuc.status === 'fulfilled') {
                const kapanmis = sadeceKapanmisMumlar(pusuSonuc.value);
                if (kapanmis.length >= (ayarlar.bollingerperiod || 20)) {
                    h.state.yerelPusuHafizasi[sym] = kapanmis;
                    h.state.sonPusuMumZamani[sym] = kapanmis.at(-1).closeTime;
                } else pusuHata++;
            } else pusuHata++;

            if (sniperSonuc.status === 'fulfilled') {
                const sniper = sadeceKapanmisMumlar(sniperSonuc.value);
                if (sniper.length >= Math.max(5, Number(ayarlar.renkoOnayAtrPeriod || 14) + 2)) {
                    h.state.sniperMumlar[sym] = sniper;
                    const stAnaliz = renko1mHazirlikKaydet(sym, sniper, renko1mBaseLimit());
                    if (!stAnaliz.ready) sniperHata++;
                } else {
                    renko1mHazirlikKaydet(sym, sniper, renko1mBaseLimit());
                    sniperHata++;
                }
            } else sniperHata++;

            islenen++;
            const pusuHazir = cacheHazirSayisi(h.state.yerelPusuHafizasi);
            const sniperHazir = cacheHazirSayisi(h.state.sniperMumlar);
            const renkoStHazir = renko1mHazirSayisi();
            const ratio = Math.min(pusuHazir / toplam, renkoStHazir / toplam);
            h.state.startupMarketWarmup = {
                ...(h.state.startupMarketWarmup || {}), durum: h.state.startupMarketReady === true ? 'READY' : 'CALISIYOR',
                asama: 'CORE_15M_1M_RENKO', islenen, toplam, pusuHazir, trendHazir: renkoStHazir, sniperHazir, renko1mStHazir: renkoStHazir,
                oran: ratio, hata: pusuHata + sniperHata, sonIlerleme: new Date().toISOString()
            };
            h.state.sembolVeriSagligi = {
                ...(h.state.sembolVeriSagligi || {}),
                durum: ratio >= threshold ? 'HEALTHY' : 'CALISIYOR',
                istenen: Number(ayarlar.taranacakCoinSayisi || 200), secilen: toplam,
                mumHazir: pusuHazir, mumHata: pusuHata,
                sniperHazir, renko1mVeriHazir: sniperHazir, renko1mStHazir: renkoStHazir, renko1mStYetersiz: Math.max(0, toplam-renkoStHazir), superTrendHazir: renkoStHazir, superTrendHata: sniperHata,
                sonGuncelleme: new Date().toISOString()
            };
            startupMarketDurumuGuncelle('INITIAL_GOLDEN_RENKO_PROGRESS');
            if (islenen === toplam || islenen % 25 === 0) {
                console.log(`⏳ [AŞAMALI BAŞLANGIÇ İLERLEME] İşlenen ${islenen}/${toplam} | ${pusuTf} Mum ${pusuHazir}/${toplam} | ${sniperTf} Renko ST veri ${sniperHazir}/${toplam} | Hata ${pusuHata + sniperHata}`);
            }
        }, { concurrency: startupConcurrency, workers: startupWorkers, symbols: tumSemboller });

        let derinOnarimToplam = 0;
        const derinOnar = async (limit, etiket) => {
            const eksikler = renko1mYetersizSemboller(tumSemboller);
            if (!eksikler.length) return 0;
            derinOnarimToplam += eksikler.length;
            console.log(`🔧 [1m RENKO ST DERİN ONARIM] ${etiket} | ${eksikler.length} sembol | ${limit} kapanmış 1m mum deneniyor.`);
            await sembolHavuzu(async sym => {
                try {
                    const ham = await mumCek(sym, sniperTf, limit, `${etiket}:${sym}`, 'HIGH');
                    const sniper = sadeceKapanmisMumlar(ham);
                    if (sniper.length >= Math.max(5, Number(ayarlar.renkoOnayAtrPeriod || 14) + 2)) {
                        h.state.sniperMumlar[sym] = sniper;
                        renko1mHazirlikKaydet(sym, sniper, limit);
                    }
                } catch (_) {}
            }, { concurrency: Math.min(4, startupConcurrency), workers: Math.min(8, startupWorkers), symbols: eksikler });
            return eksikler.length;
        };
        await derinOnar(renko1mRepairLimit(), 'START_RENKO_ST_REPAIR_1');
        await derinOnar(renko1mMaxRepairLimit(), 'START_RENKO_ST_REPAIR_2');

        h.state.semboller = tumSemboller;
        const pusuHazir = cacheHazirSayisi(h.state.yerelPusuHafizasi);
        const sniperHazir = cacheHazirSayisi(h.state.sniperMumlar);
        const renkoStHazir = renko1mHazirSayisi();
        const pusuRatio = pusuHazir / toplam;
        const sniperRatio = renkoStHazir / toplam;
        const now = Date.now();
        sonPusuDenemeBucket = closedCandleBucket(pusuTf, now);
        sonPusuDenemeZamani = now;
        sonSniperDenemeBucket = closedCandleBucket(sniperTf, now);
        sonSuperTrendDenemeZamani = now;
        if (pusuRatio >= threshold) sonPusuBasariliBucket = sonPusuDenemeBucket;
        if (sniperRatio >= threshold) sonSniperBasariliBucket = sonSniperDenemeBucket;
        h.state.sonSniperGuncellemeZamani = now;

        const gate = startupMarketDurumuGuncelle('INITIAL_GOLDEN_RENKO_COMPLETE');
        h.state.sembolVeriSagligi = {
            ...(h.state.sembolVeriSagligi || {}),
            durum: gate.currentReady ? 'HEALTHY' : 'DEGRADED',
            mumHazir: pusuHazir, mumHata: pusuHata,
            sniperHazir, renko1mVeriHazir: sniperHazir, renko1mStHazir: renkoStHazir, renko1mStYetersiz: Math.max(0, toplam-renkoStHazir), renko1mStDerinOnarim: derinOnarimToplam, superTrendHazir: renkoStHazir, superTrendHata: Math.max(0, toplam-renkoStHazir),
            baslangicMumMs: now - baslangic, superTrendTazelemeMs: now - baslangic,
            sonGuncelleme: new Date().toISOString()
        };
        h.state.startupMarketWarmup = {
            ...(h.state.startupMarketWarmup || {}),
            durum: gate.currentReady ? 'READY' : 'DEGRADED', asama: 'GOLDEN_RENKO_CORE_COMPLETE',
            islenen: toplam, toplam, pusuHazir, trendHazir: renkoStHazir, sniperHazir, renko1mStHazir: renkoStHazir,
            tamamlanma: new Date().toISOString(), hata: pusuHata + sniperHata, sureMs: now - baslangic
        };
        console.log(`${gate.currentReady ? '✅' : '⚠️'} [AŞAMALI BAŞLANGIÇ] GOLDEN RENKO ${gate.currentReady ? 'TAMAM' : 'DEGRADED'} | ${pusuTf} Mum ${pusuHazir}/${toplam} | ${sniperTf} Renko ST veri ${sniperHazir}/${toplam} | Eşik %${(threshold * 100).toFixed(0)} | Süre ${now - baslangic} ms.`);

        // ST1 3m yalnız shadow etki etiketi olarak arkada hazırlanır; giriş kapısını bekletmez.
        setImmediate(() => {
            superTrendHesapla(true, {
                concurrency: ayarlar.binanceAgEszamanlilik || 3,
                workers: ayarlar.binanceAgIsciSayisi || 8,
                skipSniper: true,
                priority: 'LOW',
                backgroundTrend: true
            }).then(x => {
                if (x?.skipped) return;
                console.log(`✅ [ST1 SHADOW ISINMA] ${trendTf} ${Number(x?.trendGuncellenen || 0)}/${toplam} | Hata ${Number(x?.hata || 0)} | Giriş yetkisine etkisi YOK`);
            }).catch(e => console.error(`⚠️ [ST1 SHADOW ISINMA] ${e.message} | Golden Renko giriş yetkisi etkilenmedi.`));
        });

        return {
            ready: gate.currentReady, pusuHazir, trendHazir: sniperHazir, sniperHazir, total: toplam,
            ratio: gate.ratio, hata: pusuHata + sniperHata, durationMs: now - baslangic,
            coreRequests: toplam * 2, deferredTrendRequests: toplam
        };
    } finally {
        ag.configure({ concurrency: ayarlar.binanceAgEszamanlilik || 3 });
        periyodikTazelemeyiBaslat();
    }
}


async function pusuVerileriniTazele(options={}) {
    const baslangic=Date.now();
    const tf=pusuKaynakPeriyodu();
    const bucket=closedCandleBucket(tf,baslangic);
    if(options.force!==true&&!refreshDue(bucket,sonPusuBasariliBucket,sonPusuDenemeBucket,sonPusuDenemeZamani,baslangic)) return {skipped:true,reason:'CLOSED_CANDLE_NOT_DUE',interval:tf,bucket};
    if (pusuTazelemeCalisiyor) { overlapLog('pusu','⏭️ [NETWORK GUARD] Önceki 15m tazeleme sürüyor; çakışan tur atlandı.'); return {skipped:true,reason:'OVERLAP'}; }
    pusuTazelemeCalisiyor=true;
    sonPusuDenemeBucket=bucket; sonPusuDenemeZamani=baslangic;
    try {
        h.state.sembolVeriSagligi={
            ...(h.state.sembolVeriSagligi||{}),
            pusuTazelemeCalisiyor:true,
            pusuTurBaslangic:new Date(baslangic).toISOString()
        };
        let guncellenen=0, yeniMum=0;
        const sonuclar=await sembolHavuzu(async sym=>{
            const ham=await mumCek(sym, tf, pusuMumLimiti(), `PUSU_CANDLE:${sym}`, 'LOW');
            const kapanmis=sadeceKapanmisMumlar(ham);
            if(kapanmis.length >= (ayarlar.bollingerperiod||20)) { const onceki=h.state.sonPusuMumZamani[sym]; const yeni=kapanmis.at(-1).closeTime; h.state.yerelPusuHafizasi[sym]=kapanmis; h.state.sonPusuMumZamani[sym]=yeni; guncellenen++; if(onceki && yeni!==onceki) yeniMum++; }
        });
        const hata=sonuclar.filter(x=>!x.ok).length;
        if(guncellenen/Math.max(1,h.state.semboller.length)>=readyRatioThreshold()) sonPusuBasariliBucket=bucket;
        h.state.sonPusuTaramaZamani=Date.now();
        const aktifEvren=new Set((h.state.semboller||[]).map(String));
        const mumCacheHazir=Object.keys(h.state.yerelPusuHafizasi||{}).filter(sym=>aktifEvren.has(String(sym))).length;
        h.state.sembolVeriSagligi={
            ...(h.state.sembolVeriSagligi||{}),
            durum:mumCacheHazir/Math.max(1,h.state.semboller.length)>=readyRatioThreshold()?'HEALTHY':'DEGRADED',
            mumHazir:mumCacheHazir,
            mumSonTurGuncellenen:guncellenen,
            mumHata:hata,
            pusuTazelemeCalisiyor:false,
            pusuTazelemeMs:Date.now()-baslangic,
            sonGuncelleme:new Date().toISOString()
        };
        startupMarketDurumuGuncelle('PUSU_REFRESH');
        console.log(`📊 [${new Date().toLocaleTimeString()}] ${tf} veriler tazelendi: ${guncellenen} coin | yeni kapanan mum: ${yeniMum} | ağ hatası: ${hata} | süre ${Date.now()-baslangic} ms`);
        return {skipped:false,guncellenen,yeniMum,hata,durationMs:Date.now()-baslangic};
    } finally { pusuTazelemeCalisiyor=false; }
}

async function superTrendHesapla(baslangic=false, options={}) {
    const baslamaZamani=Date.now();
    const sniperTf=ayarlar.sniperPeriyodu || '5m';
    const trendTf=superTrendOnayPeriyodu();
    const sniperBucket=closedCandleBucket(sniperTf,baslamaZamani);
    const trendBucket=closedCandleBucket(trendTf,baslamaZamani);
    const sniperDue=options.skipSniper!==true && (baslangic||refreshDue(sniperBucket,sonSniperBasariliBucket,sonSniperDenemeBucket,sonSuperTrendDenemeZamani,baslamaZamani));
    const trendDue=options.skipTrend!==true && (baslangic||refreshDue(trendBucket,sonTrendBasariliBucket,sonTrendDenemeBucket,sonSuperTrendDenemeZamani,baslamaZamani));
    if(!sniperDue&&!trendDue) return {skipped:true,reason:'CLOSED_CANDLE_NOT_DUE'};
    if(superTrendCalisiyor) { overlapLog('superTrend','⏭️ [NETWORK GUARD] Önceki SuperTrend tazelemesi sürüyor; çakışan tur atlandı.'); return {skipped:true,reason:'OVERLAP'}; }
    superTrendCalisiyor=true;
    sonSuperTrendDenemeZamani=baslamaZamani;
    if(sniperDue) sonSniperDenemeBucket=sniperBucket;
    if(trendDue) sonTrendDenemeBucket=trendBucket;
    try {
        h.state.sembolVeriSagligi={
            ...(h.state.sembolVeriSagligi||{}),
            superTrendTazelemeCalisiyor:true,
            superTrendTurBaslangic:new Date(baslamaZamani).toISOString()
        };
        let sniperGuncellenen=0, trendGuncellenen=0, sniperHatali=0, trendHatali=0, islenen=0;
        const requestPriority=String(options.priority || (baslangic?'HIGH':'LOW')).toUpperCase();
        const sonuclar=await sembolHavuzu(async sym=>{
            try {
            if(sniperDue){
                try{
                    const oncekiLimit=Math.max(renko1mBaseLimit(), Number(h.state.renko1mStHazirlik?.[sym]?.sourceLimit || 0));
                    const fetchAndAnalyze=async (limit,label)=>{
                        const ham=await mumCek(sym, sniperTf, limit, label, requestPriority);
                        const sniper=sadeceKapanmisMumlar(ham);
                        if(sniper.length>=Math.max(5,Number(ayarlar.renkoOnayAtrPeriod||14)+2)) h.state.sniperMumlar[sym]=sniper;
                        return renko1mHazirlikKaydet(sym,sniper,limit);
                    };
                    let stAnaliz=await fetchAndAnalyze(oncekiLimit,`SNIPER_CANDLE:${sym}`);
                    if(!stAnaliz.ready && oncekiLimit<renko1mRepairLimit()) stAnaliz=await fetchAndAnalyze(renko1mRepairLimit(),`SNIPER_REPAIR_1:${sym}`);
                    if(!stAnaliz.ready && Number(h.state.renko1mStHazirlik?.[sym]?.sourceLimit||0)<renko1mMaxRepairLimit()) stAnaliz=await fetchAndAnalyze(renko1mMaxRepairLimit(),`SNIPER_REPAIR_2:${sym}`);
                    if(stAnaliz.ready) sniperGuncellenen++; else sniperHatali++;
                }catch(err){sniperHatali++;throw err;}
            }
            if(trendDue){
                try{
                    const trendHam=await mumCek(sym, trendTf, 80, `TREND_CANDLE:${sym}`, requestPriority);
                    const trend=sadeceKapanmisMumlar(trendHam);
                    if(trend.length >= (ayarlar.superTrendPeriod||10)+2){ h.state.trendMumlar[sym]=trend; const st=m.hesaplaSuperTrend(trend); if(st?.trend){ h.state.trendSuperTrend[sym]=st.trend; h.state.sniperSuperTrend[sym]=st.trend; trendGuncellenen++; } else trendHatali++; } else trendHatali++;
                }catch(err){trendHatali++;throw err;}
            }
            } finally {
                islenen++;
                if(baslangic){
                    const toplam=Math.max(1,Number(h.state.semboller?.length||0));
                    const asama=sniperDue?'RENKO_ST_1M':'ST1_3M_SHADOW';
                    h.state.startupMarketWarmup={
                        ...(h.state.startupMarketWarmup||{}),durum:h.state.startupMarketReady===true?'READY':'CALISIYOR',
                        asama,islenen,toplam,trendHazir:trendDue?trendGuncellenen:Object.keys(h.state.trendSuperTrend||{}).length,sniperHazir:sniperDue?sniperGuncellenen:Object.keys(h.state.sniperMumlar||{}).length,sonIlerleme:new Date().toISOString()
                    };
                    h.state.sembolVeriSagligi={
                        ...(h.state.sembolVeriSagligi||{}),
                        sniperHazir:sniperDue?sniperGuncellenen:Object.keys(h.state.sniperMumlar||{}).length,superTrendHazir:trendDue?trendGuncellenen:Object.keys(h.state.trendSuperTrend||{}).length,secilen:toplam,sonGuncelleme:new Date().toISOString()
                    };
                    if(sniperDue || trendDue) startupMarketDurumuGuncelle('INITIAL_MARKET_PROGRESS');
                    if(islenen===toplam || islenen%25===0){
                        console.log(`⏳ [AŞAMALI BAŞLANGIÇ İLERLEME] ${asama} | İşlenen ${islenen}/${toplam} | 1m Renko veri ${Object.keys(h.state.sniperMumlar||{}).length}/${toplam} | 3m ST1 shadow ${Object.keys(h.state.trendSuperTrend||{}).length}/${toplam}`);
                    }
                }
            }
        }, { concurrency: options.concurrency, workers: options.workers });
        const havuzHata=sonuclar.filter(x=>!x.ok).length;
        if(sniperDue&&sniperGuncellenen/Math.max(1,h.state.semboller.length)>=readyRatioThreshold()) sonSniperBasariliBucket=sniperBucket;
        if(trendDue&&trendGuncellenen/Math.max(1,h.state.semboller.length)>=readyRatioThreshold()) sonTrendBasariliBucket=trendBucket;
        if(sniperDue) h.state.sonSniperGuncellemeZamani=Date.now();
        if(trendDue) h.state.sonTrendGuncellemeZamani=Date.now();
        const toplamHatali=sniperHatali+trendHatali+havuzHata;
        const total=Math.max(1,h.state.semboller.length);
        const sniperHazir=cacheHazirSayisi(h.state.sniperMumlar);
        const renkoStHazir=renko1mHazirSayisi();
        const trendHazir=trendDue?trendGuncellenen:Object.keys(h.state.trendSuperTrend||{}).length;
        const aktifEvren=new Set((h.state.semboller||[]).map(String));
        const pusuHazir=Object.keys(h.state.yerelPusuHafizasi||{}).filter(sym=>aktifEvren.has(String(sym))).length;
        const coreOnayHazir=ayarlar.entryStrategyMode==='ST2_RENKO'?renkoStHazir:trendHazir;
        const coreHealthy=Math.min(pusuHazir/total,coreOnayHazir/total)>=readyRatioThreshold();
        const sniperCacheHazir=Object.keys(h.state.sniperMumlar||{}).filter(sym=>aktifEvren.has(String(sym))).length;
        const trendCacheHazir=Object.keys(h.state.trendSuperTrend||{}).filter(sym=>aktifEvren.has(String(sym))).length;
        const coreCacheHazir=ayarlar.entryStrategyMode==='ST2_RENKO'?renkoStHazir:trendCacheHazir;
        const cacheHealthy=Math.min(pusuHazir/total,coreCacheHazir/total)>=readyRatioThreshold();
        h.state.sembolVeriSagligi={
            ...(h.state.sembolVeriSagligi||{}),
            durum:cacheHealthy?'HEALTHY':'DEGRADED',
            sniperHazir:sniperCacheHazir,
            renko1mVeriHazir:sniperCacheHazir,
            renko1mStHazir:renkoStHazir,
            renko1mStYetersiz:Math.max(0,total-renkoStHazir),
            superTrendHazir:coreCacheHazir,
            st1ShadowHazir:trendCacheHazir,
            superTrendSonTurGuncellenen:sniperDue?sniperGuncellenen:0,
            st1ShadowSonTurGuncellenen:trendDue?trendGuncellenen:0,
            superTrendHata:toplamHatali,
            superTrendTazelemeCalisiyor:false,
            superTrendTazelemeMs:Date.now()-baslamaZamani,
            sonGuncelleme:new Date().toISOString()
        };
        if(sniperDue || trendDue) startupMarketDurumuGuncelle(baslangic ? 'INITIAL_MARKET_DATA' : 'MARKET_DATA_REFRESH');
        console.log(`📊 [${new Date().toLocaleTimeString()}] 1m Renko ST verisi (${sniperTf}): ${sniperDue?sniperGuncellenen:'ATLANDI'} coin | ST1 shadow (${trendTf}): ${trendDue?trendGuncellenen:'ATLANDI'} coin güncellendi, ${toplamHatali} hata | süre ${Date.now()-baslamaZamani} ms.`);
        return {skipped:false,sniperDue,trendDue,sniperGuncellenen,trendGuncellenen,hata:toplamHatali,durationMs:Date.now()-baslamaZamani};
    } finally { superTrendCalisiyor=false; }
}
function resetScheduleForTest(){
    pusuTazelemeCalisiyor=false;superTrendCalisiyor=false;
    sonPusuBasariliBucket=null;sonPusuDenemeBucket=null;sonPusuDenemeZamani=0;
    sonSniperBasariliBucket=null;sonTrendBasariliBucket=null;sonSniperDenemeBucket=null;sonTrendDenemeBucket=null;sonSuperTrendDenemeZamani=0; overlapLogAt.pusu=0; overlapLogAt.superTrend=0;
    if (pusuTimerRef) clearInterval(pusuTimerRef);
    if (stTimerRef) clearInterval(stTimerRef);
    pusuTimerRef=null; stTimerRef=null;
}
module.exports={ derinGecmisiInsaEt, pusuVerileriniTazele, superTrendHesapla, _startupMarketDurumuGuncelle:startupMarketDurumuGuncelle, _readyRatioThreshold:readyRatioThreshold, _intervalMs:intervalMs, _closedCandleBucket:closedCandleBucket, _refreshDue:refreshDue, _resetScheduleForTest:resetScheduleForTest };
