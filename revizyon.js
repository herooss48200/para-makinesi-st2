delete require.cache[require.resolve('./ayarlar.js')];
const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const m = require('./motor.js');
const ag = require('./64_binance_network_resilience.js');

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
let st1ShadowTimerRef = null;
let st1ShadowWarmupTimerRef = null;
let marketBulkRefreshOwner = null;
function readyRatioThreshold() { return Math.max(0.80, Math.min(1, Number(ayarlar.startupMarketReadyOrani || 0.95))); }
function overlapLog(kind, message) {
    const now = Date.now();
    const interval = Math.max(30000, Number(ayarlar.startupMarketGuardLogAralikMs || 60000));
    if (now - Number(overlapLogAt[kind] || 0) < interval) return;
    overlapLogAt[kind] = now;
    console.log(message);
}

function aktifEvrenSeti() { return new Set((h.state.semboller || []).map(String)); }
function cacheHazirSayisi(cache) {
    const aktif = aktifEvrenSeti();
    return Object.keys(cache || {}).filter(sym => aktif.has(String(sym))).length;
}
function mumlariBirlestir(eski, yeni, limit) {
    const rows = [...(Array.isArray(eski) ? eski : []), ...(Array.isArray(yeni) ? yeni : [])];
    const byOpen = new Map();
    for (const row of rows) {
        const key = Number(row?.openTime);
        if (!Number.isFinite(key)) continue;
        byOpen.set(key, row);
    }
    const out = [...byOpen.values()].sort((a, b) => Number(a.openTime) - Number(b.openTime));
    const max = Math.max(2, Number(limit) || out.length || 2);
    return out.slice(-max);
}
function bulkKilitAl(owner) {
    if (marketBulkRefreshOwner && marketBulkRefreshOwner !== owner) return false;
    marketBulkRefreshOwner = owner;
    return true;
}
function bulkKilitBirak(owner) {
    if (marketBulkRefreshOwner === owner) marketBulkRefreshOwner = null;
}
function startupAgOverrides({ repair = false } = {}) {
    return {
        timeoutMs: Math.max(3000, Number(ayarlar.binanceStartupTimeoutMs || 8000) + (repair ? 2000 : 0)),
        retries: repair ? 1 : Math.max(0, Number(ayarlar.binanceStartupRetry ?? 0)),
        queueTimeoutMs: Math.max(5000, Number(ayarlar.binanceStartupQueueTimeoutMs || 30000)),
        requestSpacingMs: Math.max(0, Number(ayarlar.binanceStartupRequestSpacingMs ?? 15))
    };
}
function bulkAgOverrides() {
    return {
        timeoutMs: Math.max(3000, Number(ayarlar.binanceBulkRefreshTimeoutMs || 8000)),
        retries: Math.max(0, Number(ayarlar.binanceBulkRefreshRetry ?? 0)),
        queueTimeoutMs: Math.max(5000, Number(ayarlar.binanceBulkRefreshQueueTimeoutMs || 15000)),
        requestSpacingMs: Math.max(0, Number(ayarlar.binanceBulkRefreshRequestSpacingMs ?? 20))
    };
}
function startupOnayHazirSayisi() {
    if (ayarlar.entryStrategyMode === 'ST2_RENKO') return cacheHazirSayisi(h.state.sniperMumlar);
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
        oran: ratio,
        sonKontrol: new Date().toISOString(),
        sonKaynak: source
    };
    if (ready && !wasReady) {
        const onayEtiketi = ayarlar.entryStrategyMode === 'ST2_RENKO' ? '1m Renko veri' : 'ST1 trend';
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
            const opts = ayarlar.entryStrategyMode === 'ST2_RENKO' ? { skipTrend: true, priority: 'LOW' } : {};
            superTrendHesapla(false, opts).catch(e => console.error('❌ SuperTrend üst hata:', e.message));
        }, ayarlar.superTrendTazelemeMs || 15000);
        stTimerRef.unref?.();
    }
    // ST1 yalnız shadow olduğundan core 1m Renko hattıyla aynı 15 sn timerına bindirilmez.
    if (ayarlar.entryStrategyMode === 'ST2_RENKO' && !st1ShadowTimerRef) {
        st1ShadowTimerRef = setInterval(() => {
            superTrendHesapla(false, { skipSniper: true, priority: 'LOW', maxTurMs: 45000 })
                .catch(e => console.error('⚠️ ST1 shadow tazeleme üst hata:', e.message));
        }, Math.max(60000, Number(ayarlar.st1ShadowTazelemeMs || 180000)));
        st1ShadowTimerRef.unref?.();
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
function agAyar(label, priority = 'LOW', overrides = {}) {
    return {
        timeoutMs: Number(overrides.timeoutMs ?? ayarlar.binanceAgTimeoutMs ?? 15000),
        retries: Number(overrides.retries ?? ayarlar.binanceAgRetry ?? 2),
        baseDelayMs: Number(overrides.baseDelayMs ?? ayarlar.binanceAgRetryTabanMs ?? 900),
        queueTimeoutMs: Number(overrides.queueTimeoutMs ?? 45000),
        requestSpacingMs: Number(overrides.requestSpacingMs ?? 35),
        priority,
        label
    };
}
async function mumCek(sym, interval, limit, label, priority = 'LOW', overrides = {}) {
    return ag.binanceMumlariCek(sym, interval, limit, agAyar(label, priority, overrides));
}
async function sembolHavuzu(worker, options = {}) {
    const concurrency = Math.max(1, Number(options.concurrency || ayarlar.binanceAgEszamanlilik || 3));
    const workers = Math.max(concurrency, Number(options.workers || ayarlar.binanceAgIsciSayisi || 8));
    const symbols = Array.from(options.symbols || h.state.semboller || []);
    ag.configure({ concurrency });
    return ag.havuzdaCalistir(symbols, worker, workers);
}

async function derinGecmisiInsaEt(options = {}) {
    const baslangic = Date.now();
    const startupConcurrency = Math.max(1, Number(options.concurrency || ayarlar.binanceStartupAgEszamanlilik || 10));
    const startupWorkers = Math.max(startupConcurrency, Number(options.workers || ayarlar.binanceStartupAgIsciSayisi || 20));
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
    console.log(`📥 [AŞAMALI BAŞLANGIÇ] Golden Renko çekirdeği hazırlanıyor | ${pusuTf} ATR-Renko + ${sniperTf} Renko ST verisi | Eşzamanlılık ${startupConcurrency} | fail-fast | ${trendTf} ST1 yalnız shadow sonra.`);

    h.state.yerelPusuHafizasi={}; h.state.canliFiyatlar={}; h.state.sniperMumlar={}; h.state.sniperCanliMumlar={}; h.state.sniperSuperTrend={}; h.state.sniperSuperTrendCanli={}; h.state.trendMumlar={}; h.state.trendCanliMumlar={}; h.state.trendSuperTrend={}; h.state.trendSuperTrendCanli={}; h.state.sonPusuMumZamani={};

    let islenen=0, pusuDenemeHata=0, sniperDenemeHata=0;
    const pusuMin = Number(ayarlar.bollingerperiod || 20);
    const sniperMin = Math.max(5, Number(ayarlar.renkoOnayAtrPeriod || 14) + 2);

    const sembolYukle = async (sym, { repair = false, progress = true } = {}) => {
        const istekler = [];
        const turler = [];
        if (!repair || !Array.isArray(h.state.yerelPusuHafizasi?.[sym]) || h.state.yerelPusuHafizasi[sym].length < pusuMin) {
            turler.push('pusu');
            istekler.push(mumCek(sym, pusuTf, pusuMumLimiti(), `${repair ? 'START_REPAIR' : 'START'}_CANDLE:${sym}`, 'HIGH', startupAgOverrides({ repair })));
        }
        if (!repair || !Array.isArray(h.state.sniperMumlar?.[sym]) || h.state.sniperMumlar[sym].length < sniperMin) {
            turler.push('sniper');
            istekler.push(mumCek(sym, sniperTf, 80, `${repair ? 'START_REPAIR' : 'START'}_SNIPER:${sym}`, 'HIGH', startupAgOverrides({ repair })));
        }
        const sonuclar = await Promise.allSettled(istekler);
        for (let i=0; i<sonuclar.length; i++) {
            const kind = turler[i];
            const sonuc = sonuclar[i];
            if (kind === 'pusu') {
                if (sonuc.status === 'fulfilled') {
                    const kapanmis = sadeceKapanmisMumlar(sonuc.value);
                    if (kapanmis.length >= pusuMin) {
                        h.state.yerelPusuHafizasi[sym] = kapanmis.slice(-pusuMumLimiti());
                        h.state.sonPusuMumZamani[sym] = kapanmis.at(-1).closeTime;
                    } else pusuDenemeHata++;
                } else pusuDenemeHata++;
            } else if (kind === 'sniper') {
                if (sonuc.status === 'fulfilled') {
                    const sniper = sadeceKapanmisMumlar(sonuc.value);
                    if (sniper.length >= sniperMin) h.state.sniperMumlar[sym] = sniper.slice(-80);
                    else sniperDenemeHata++;
                } else sniperDenemeHata++;
            }
        }

        if (!progress) return;
        islenen++;
        const pusuHazir = cacheHazirSayisi(h.state.yerelPusuHafizasi);
        const sniperHazir = cacheHazirSayisi(h.state.sniperMumlar);
        const ratio = Math.min(pusuHazir / toplam, sniperHazir / toplam);
        h.state.startupMarketWarmup = {
            ...(h.state.startupMarketWarmup || {}), durum: h.state.startupMarketReady === true ? 'READY' : 'CALISIYOR',
            asama: 'CORE_15M_1M_RENKO', islenen, toplam, pusuHazir, trendHazir: sniperHazir, sniperHazir,
            oran: ratio, hata: pusuDenemeHata + sniperDenemeHata, sonIlerleme: new Date().toISOString()
        };
        h.state.sembolVeriSagligi = {
            ...(h.state.sembolVeriSagligi || {}),
            durum: ratio >= threshold ? 'HEALTHY' : 'CALISIYOR',
            istenen: Number(ayarlar.taranacakCoinSayisi || 200), secilen: toplam,
            mumHazir: pusuHazir, mumHata: Math.max(0, toplam - pusuHazir),
            sniperHazir, renko1mVeriHazir: sniperHazir, superTrendHazir: sniperHazir,
            superTrendHata: Math.max(0, toplam - sniperHazir),
            sonGuncelleme: new Date().toISOString()
        };
        startupMarketDurumuGuncelle('INITIAL_GOLDEN_RENKO_PROGRESS');
        if (islenen === toplam || islenen % 25 === 0) {
            console.log(`⏳ [AŞAMALI BAŞLANGIÇ İLERLEME] İşlenen ${islenen}/${toplam} | ${pusuTf} Mum ${pusuHazir}/${toplam} | ${sniperTf} Renko veri ${sniperHazir}/${toplam} | Hata ${Math.max(0,toplam-pusuHazir)+Math.max(0,toplam-sniperHazir)}`);
        }
    };

    try {
        await sembolHavuzu(sym => sembolYukle(sym, { repair:false, progress:true }), {
            concurrency: startupConcurrency, workers: startupWorkers, symbols: tumSemboller
        });

        let pusuHazir = cacheHazirSayisi(h.state.yerelPusuHafizasi);
        let sniperHazir = cacheHazirSayisi(h.state.sniperMumlar);
        if ((pusuHazir / toplam < threshold || sniperHazir / toplam < threshold)) {
            const eksikler = tumSemboller.filter(sym =>
                !Array.isArray(h.state.yerelPusuHafizasi?.[sym]) || h.state.yerelPusuHafizasi[sym].length < pusuMin ||
                !Array.isArray(h.state.sniperMumlar?.[sym]) || h.state.sniperMumlar[sym].length < sniperMin
            );
            if (eksikler.length) {
                console.log(`🔁 [AŞAMALI BAŞLANGIÇ ONARIM] Eşik altı cache için yalnız ${eksikler.length} eksik sembol tekrar deneniyor.`);
                await sembolHavuzu(sym => sembolYukle(sym, { repair:true, progress:false }), {
                    concurrency: Math.min(6, startupConcurrency), workers: Math.min(12, startupWorkers), symbols: eksikler
                });
            }
        }

        h.state.semboller = tumSemboller;
        pusuHazir = cacheHazirSayisi(h.state.yerelPusuHafizasi);
        sniperHazir = cacheHazirSayisi(h.state.sniperMumlar);
        const pusuEksik = Math.max(0, toplam - pusuHazir);
        const sniperEksik = Math.max(0, toplam - sniperHazir);
        const pusuRatio = pusuHazir / toplam;
        const sniperRatio = sniperHazir / toplam;
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
            mumHazir: pusuHazir, mumHata: pusuEksik,
            sniperHazir, renko1mVeriHazir: sniperHazir, superTrendHazir: sniperHazir, superTrendHata: sniperEksik,
            baslangicMumMs: now - baslangic, superTrendTazelemeMs: now - baslangic,
            sonGuncelleme: new Date().toISOString()
        };
        h.state.startupMarketWarmup = {
            ...(h.state.startupMarketWarmup || {}),
            durum: gate.currentReady ? 'READY' : 'DEGRADED', asama: 'GOLDEN_RENKO_CORE_COMPLETE',
            islenen: toplam, toplam, pusuHazir, trendHazir: sniperHazir, sniperHazir,
            tamamlanma: new Date().toISOString(), hata: pusuEksik + sniperEksik, sureMs: now - baslangic
        };
        console.log(`${gate.currentReady ? '✅' : '⚠️'} [AŞAMALI BAŞLANGIÇ] GOLDEN RENKO ${gate.currentReady ? 'TAMAM' : 'DEGRADED'} | ${pusuTf} Mum ${pusuHazir}/${toplam} | ${sniperTf} Renko veri ${sniperHazir}/${toplam} | Eşik %${(threshold * 100).toFixed(0)} | Süre ${now - baslangic} ms.`);

        // ST1 yalnız shadow: Golden giriş kapısını bekletmez, core 1m refresh'e öncelik verir.
        // İlk shadow ısınması kısa gecikmeyle ve fail-fast bulk profiliyle çalışır.
        if (st1ShadowWarmupTimerRef) clearTimeout(st1ShadowWarmupTimerRef);
        st1ShadowWarmupTimerRef = setTimeout(() => {
            st1ShadowWarmupTimerRef = null;
            superTrendHesapla(false, {
                concurrency: ayarlar.binanceAgEszamanlilik || 3,
                workers: ayarlar.binanceAgIsciSayisi || 8,
                skipSniper: true,
                priority: 'LOW',
                maxTurMs: 45000,
                backgroundTrend: true
            }).then(x => {
                if (x?.skipped) return;
                console.log(`✅ [ST1 SHADOW ISINMA] ${trendTf} ${Number(x?.trendGuncellenen || 0)}/${toplam} | Hata ${Number(x?.hata || 0)} | Giriş yetkisine etkisi YOK`);
            }).catch(e => console.error(`⚠️ [ST1 SHADOW ISINMA] ${e.message} | Golden Renko giriş yetkisi etkilenmedi.`));
        }, Math.max(15000, Number(ayarlar.st1ShadowStartupGecikmeMs || 60000)));
        st1ShadowWarmupTimerRef.unref?.();

        return {
            ready: gate.currentReady, pusuHazir, trendHazir: sniperHazir, sniperHazir, total: toplam,
            ratio: gate.ratio, hata: pusuEksik + sniperEksik, durationMs: now - baslangic,
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
    if (!bulkKilitAl('PUSU_15M')) { overlapLog('pusu',`⏭️ [NETWORK GUARD] ${marketBulkRefreshOwner} veri turu aktif; 15m tazeleme sonraki turda denenecek.`); return {skipped:true,reason:'BULK_BUSY',owner:marketBulkRefreshOwner}; }
    pusuTazelemeCalisiyor=true;
    sonPusuDenemeBucket=bucket; sonPusuDenemeZamani=baslangic;
    const maxTurMs=Math.max(30000,Number(ayarlar.pusuRefreshMaxTurMs||120000));
    const deltaLimit=Math.max(2,Number(ayarlar.pusuDeltaMumLimiti||3));
    let deadlineSkipped=0;
    try {
        h.state.sembolVeriSagligi={
            ...(h.state.sembolVeriSagligi||{}),
            pusuTazelemeCalisiyor:true,
            pusuTurBaslangic:new Date(baslangic).toISOString()
        };
        let guncellenen=0, yeniMum=0;
        const symbols=Array.from(options.symbols||h.state.semboller||[]);
        const sonuclar=await sembolHavuzu(async sym=>{
            if(Date.now()-baslangic>maxTurMs){deadlineSkipped++;return;}
            const eski=Array.isArray(h.state.yerelPusuHafizasi?.[sym])?h.state.yerelPusuHafizasi[sym]:[];
            const fullGerekli=eski.length<(ayarlar.bollingerperiod||20);
            const limit=fullGerekli?pusuMumLimiti():deltaLimit;
            const ham=await mumCek(sym, tf, limit, `PUSU_CANDLE:${sym}`, 'LOW', bulkAgOverrides());
            const delta=sadeceKapanmisMumlar(ham);
            const kapanmis=mumlariBirlestir(eski,delta,pusuMumLimiti());
            if(kapanmis.length >= (ayarlar.bollingerperiod||20)) {
                const onceki=h.state.sonPusuMumZamani[sym];
                const yeni=kapanmis.at(-1).closeTime;
                h.state.yerelPusuHafizasi[sym]=kapanmis;
                h.state.sonPusuMumZamani[sym]=yeni;
                guncellenen++;
                if(onceki && yeni!==onceki) yeniMum++;
            }
        },{symbols});
        const hata=sonuclar.filter(x=>!x.ok).length+deadlineSkipped;
        if(guncellenen/Math.max(1,symbols.length)>=readyRatioThreshold()) sonPusuBasariliBucket=bucket;
        h.state.sonPusuTaramaZamani=Date.now();
        const mumCacheHazir=cacheHazirSayisi(h.state.yerelPusuHafizasi);
        h.state.sembolVeriSagligi={
            ...(h.state.sembolVeriSagligi||{}),
            durum:mumCacheHazir/Math.max(1,h.state.semboller.length)>=readyRatioThreshold()?'HEALTHY':'DEGRADED',
            mumHazir:mumCacheHazir,
            mumSonTurGuncellenen:guncellenen,
            mumHata:hata,
            pusuTazelemeCalisiyor:false,
            pusuTazelemeMs:Date.now()-baslangic,
            pusuWatchdogKesilen:deadlineSkipped,
            sonGuncelleme:new Date().toISOString()
        };
        startupMarketDurumuGuncelle('PUSU_REFRESH');
        console.log(`📊 [${new Date().toLocaleTimeString()}] ${tf} delta tazelendi: ${guncellenen} coin | yeni kapanan mum: ${yeniMum} | ağ/deadline hata: ${hata} | limit ${deltaLimit} | süre ${Date.now()-baslangic} ms`);
        return {skipped:false,guncellenen,yeniMum,hata,deadlineSkipped,durationMs:Date.now()-baslangic};
    } finally {
        pusuTazelemeCalisiyor=false;
        bulkKilitBirak('PUSU_15M');
        h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),pusuTazelemeCalisiyor:false};
    }
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
    if(!bulkKilitAl('RENKO_ST')) { overlapLog('superTrend',`⏭️ [NETWORK GUARD] ${marketBulkRefreshOwner} veri turu aktif; SuperTrend tazeleme sonraki turda denenecek.`); return {skipped:true,reason:'BULK_BUSY',owner:marketBulkRefreshOwner}; }
    superTrendCalisiyor=true;
    sonSuperTrendDenemeZamani=baslamaZamani;
    if(sniperDue) sonSniperDenemeBucket=sniperBucket;
    if(trendDue) sonTrendDenemeBucket=trendBucket;
    const maxTurMs=Math.max(30000,Number(options.maxTurMs||(baslangic?120000:(ayarlar.superTrendRefreshMaxTurMs||55000))));
    const deltaLimit=Math.max(2,Number(ayarlar.superTrendDeltaMumLimiti||3));
    let deadlineSkipped=0;
    try {
        h.state.sembolVeriSagligi={
            ...(h.state.sembolVeriSagligi||{}),
            superTrendTazelemeCalisiyor:true,
            superTrendTurBaslangic:new Date(baslamaZamani).toISOString()
        };
        let sniperGuncellenen=0, trendGuncellenen=0, sniperHatali=0, trendHatali=0, islenen=0;
        const requestPriority=String(options.priority || (baslangic?'HIGH':'LOW')).toUpperCase();
        const symbols=Array.from(options.symbols||h.state.semboller||[]);
        const sonuclar=await sembolHavuzu(async sym=>{
            try {
                if(Date.now()-baslamaZamani>maxTurMs){deadlineSkipped++;return;}
                if(sniperDue){
                    try{
                        const eski=Array.isArray(h.state.sniperMumlar?.[sym])?h.state.sniperMumlar[sym]:[];
                        const min=Math.max(5,Number(ayarlar.renkoOnayAtrPeriod||14)+2);
                        const fullGerekli=baslangic||eski.length<min;
                        const limit=fullGerekli?80:deltaLimit;
                        const sniperHam=await mumCek(sym, sniperTf, limit, `SNIPER_CANDLE:${sym}`, requestPriority, baslangic?startupAgOverrides():bulkAgOverrides());
                        const delta=sadeceKapanmisMumlar(sniperHam);
                        const sniper=mumlariBirlestir(eski,delta,80);
                        if(sniper.length>=min){ h.state.sniperMumlar[sym]=sniper; sniperGuncellenen++; } else sniperHatali++;
                    }catch(err){sniperHatali++;}
                }
                if(trendDue){
                    try{
                        const eski=Array.isArray(h.state.trendMumlar?.[sym])?h.state.trendMumlar[sym]:[];
                        const min=(ayarlar.superTrendPeriod||10)+2;
                        const fullGerekli=baslangic||eski.length<min;
                        const limit=fullGerekli?80:deltaLimit;
                        const trendHam=await mumCek(sym, trendTf, limit, `TREND_CANDLE:${sym}`, requestPriority, baslangic?startupAgOverrides():bulkAgOverrides());
                        const delta=sadeceKapanmisMumlar(trendHam);
                        const trend=mumlariBirlestir(eski,delta,80);
                        if(trend.length>=min){
                            h.state.trendMumlar[sym]=trend;
                            const st=m.hesaplaSuperTrend(trend);
                            if(st?.trend){ h.state.trendSuperTrend[sym]=st.trend; h.state.sniperSuperTrend[sym]=st.trend; trendGuncellenen++; } else trendHatali++;
                        } else trendHatali++;
                    }catch(err){trendHatali++;}
                }
            } finally {
                islenen++;
                if(baslangic){
                    const toplam=Math.max(1,Number(symbols.length||0));
                    const asama=sniperDue?'RENKO_ST_1M':'ST1_3M_SHADOW';
                    const sniperCacheNow=cacheHazirSayisi(h.state.sniperMumlar);
                    const trendCacheNow=cacheHazirSayisi(h.state.trendSuperTrend);
                    h.state.startupMarketWarmup={
                        ...(h.state.startupMarketWarmup||{}),durum:h.state.startupMarketReady===true?'READY':'CALISIYOR',
                        asama,islenen,toplam,trendHazir:ayarlar.entryStrategyMode==='ST2_RENKO'?sniperCacheNow:trendCacheNow,sniperHazir:sniperCacheNow,sonIlerleme:new Date().toISOString()
                    };
                    h.state.sembolVeriSagligi={
                        ...(h.state.sembolVeriSagligi||{}),
                        sniperHazir:sniperCacheNow,renko1mVeriHazir:sniperCacheNow,
                        superTrendHazir:ayarlar.entryStrategyMode==='ST2_RENKO'?sniperCacheNow:trendCacheNow,
                        st1ShadowHazir:trendCacheNow,secilen:Math.max(1,Number(h.state.semboller?.length||symbols.length)),sonGuncelleme:new Date().toISOString()
                    };
                    if(sniperDue || trendDue) startupMarketDurumuGuncelle('INITIAL_MARKET_PROGRESS');
                    if(islenen===toplam || islenen%25===0){
                        console.log(`⏳ [AŞAMALI BAŞLANGIÇ İLERLEME] ${asama} | İşlenen ${islenen}/${toplam} | 1m Renko veri ${sniperCacheNow}/${toplam} | 3m ST1 shadow ${trendCacheNow}/${toplam}`);
                    }
                }
            }
        }, { concurrency: options.concurrency, workers: options.workers, symbols });
        const havuzHata=sonuclar.filter(x=>!x.ok).length;
        if(sniperDue&&sniperGuncellenen/Math.max(1,symbols.length)>=readyRatioThreshold()) sonSniperBasariliBucket=sniperBucket;
        if(trendDue&&trendGuncellenen/Math.max(1,symbols.length)>=readyRatioThreshold()) sonTrendBasariliBucket=trendBucket;
        if(sniperDue) h.state.sonSniperGuncellemeZamani=Date.now();
        if(trendDue) h.state.sonTrendGuncellemeZamani=Date.now();
        const toplamHatali=sniperHatali+trendHatali+havuzHata+deadlineSkipped;
        const coreHatali=ayarlar.entryStrategyMode==='ST2_RENKO'
            ? (sniperDue ? sniperHatali+havuzHata+deadlineSkipped : 0)
            : toplamHatali;
        const shadowHatali=trendHatali+(trendDue?deadlineSkipped:0);
        const total=Math.max(1,h.state.semboller.length);
        const sniperCacheHazir=cacheHazirSayisi(h.state.sniperMumlar);
        const trendCacheHazir=cacheHazirSayisi(h.state.trendSuperTrend);
        const pusuHazir=cacheHazirSayisi(h.state.yerelPusuHafizasi);
        const coreCacheHazir=ayarlar.entryStrategyMode==='ST2_RENKO'?sniperCacheHazir:trendCacheHazir;
        const cacheHealthy=Math.min(pusuHazir/total,coreCacheHazir/total)>=readyRatioThreshold();
        h.state.sembolVeriSagligi={
            ...(h.state.sembolVeriSagligi||{}),
            durum:cacheHealthy?'HEALTHY':'DEGRADED',
            sniperHazir:sniperCacheHazir,
            renko1mVeriHazir:sniperCacheHazir,
            superTrendHazir:coreCacheHazir,
            st1ShadowHazir:trendCacheHazir,
            superTrendSonTurGuncellenen:sniperDue?sniperGuncellenen:0,
            st1ShadowSonTurGuncellenen:trendDue?trendGuncellenen:0,
            superTrendHata:coreHatali,
            st1ShadowHata:shadowHatali,
            superTrendTazelemeCalisiyor:false,
            superTrendTazelemeMs:Date.now()-baslamaZamani,
            superTrendWatchdogKesilen:deadlineSkipped,
            sonGuncelleme:new Date().toISOString()
        };
        if(sniperDue || trendDue) startupMarketDurumuGuncelle(baslangic ? 'INITIAL_MARKET_DATA' : 'MARKET_DATA_REFRESH');
        console.log(`📊 [${new Date().toLocaleTimeString()}] 1m Renko delta (${sniperTf}): ${sniperDue?sniperGuncellenen:'ATLANDI'} coin | ST1 shadow (${trendTf}): ${trendDue?trendGuncellenen:'ATLANDI'} | hata ${toplamHatali} | delta limit ${deltaLimit} | süre ${Date.now()-baslamaZamani} ms.`);
        return {skipped:false,sniperDue,trendDue,sniperGuncellenen,trendGuncellenen,hata:toplamHatali,deadlineSkipped,durationMs:Date.now()-baslamaZamani};
    } finally {
        superTrendCalisiyor=false;
        bulkKilitBirak('RENKO_ST');
        h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),superTrendTazelemeCalisiyor:false};
    }
}
function resetScheduleForTest(){
    pusuTazelemeCalisiyor=false;superTrendCalisiyor=false;marketBulkRefreshOwner=null;
    sonPusuBasariliBucket=null;sonPusuDenemeBucket=null;sonPusuDenemeZamani=0;
    sonSniperBasariliBucket=null;sonTrendBasariliBucket=null;sonSniperDenemeBucket=null;sonTrendDenemeBucket=null;sonSuperTrendDenemeZamani=0; overlapLogAt.pusu=0; overlapLogAt.superTrend=0;
    if (pusuTimerRef) clearInterval(pusuTimerRef);
    if (stTimerRef) clearInterval(stTimerRef);
    if (st1ShadowTimerRef) clearInterval(st1ShadowTimerRef);
    if (st1ShadowWarmupTimerRef) clearTimeout(st1ShadowWarmupTimerRef);
    pusuTimerRef=null; stTimerRef=null; st1ShadowTimerRef=null; st1ShadowWarmupTimerRef=null;
}
module.exports={ derinGecmisiInsaEt, pusuVerileriniTazele, superTrendHesapla, _startupMarketDurumuGuncelle:startupMarketDurumuGuncelle, _readyRatioThreshold:readyRatioThreshold, _intervalMs:intervalMs, _closedCandleBucket:closedCandleBucket, _refreshDue:refreshDue, _mumlariBirlestir:mumlariBirlestir, _resetScheduleForTest:resetScheduleForTest };
