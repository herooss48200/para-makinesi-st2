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
function readyRatioThreshold() { return Math.max(0.80, Math.min(1, Number(ayarlar.startupMarketReadyOrani || 0.95))); }
function overlapLog(kind, message) {
    const now = Date.now();
    const interval = Math.max(30000, Number(ayarlar.startupMarketGuardLogAralikMs || 60000));
    if (now - Number(overlapLogAt[kind] || 0) < interval) return;
    overlapLogAt[kind] = now;
    console.log(message);
}
function startupMarketDurumuGuncelle(source = 'REFRESH') {
    const total = Math.max(1, Number(h.state.semboller?.length || 0));
    const pusuHazir = Object.keys(h.state.yerelPusuHafizasi || {}).length;
    const trendHazir = Object.keys(h.state.trendSuperTrend || {}).length;
    const threshold = readyRatioThreshold();
    const pusuRatio = pusuHazir / total;
    const trendRatio = trendHazir / total;
    const ratio = Math.min(pusuRatio, trendRatio);
    const ready = pusuRatio >= threshold && trendRatio >= threshold;
    const wasReady = h.state.startupMarketReady === true;
    const current = h.state.startupMarketWarmup || {};

    if (ready) h.state.startupMarketReady = true;
    h.state.startupMarketWarmup = {
        ...current,
        durum: ready ? 'READY' : (wasReady ? 'READY_CACHED' : (current.durum === 'CALISIYOR' ? 'CALISIYOR' : 'DEGRADED')),
        tamamlanma: ready ? (current.tamamlanma || new Date().toISOString()) : current.tamamlanma,
        pusuHazir,
        trendHazir,
        oran: ratio,
        sonKontrol: new Date().toISOString(),
        sonKaynak: source
    };
    if (ready && !wasReady) {
        console.log(`✅ [STARTUP ENTRY GATE] AÇILDI | Kaynak ${source} | Mum ${pusuHazir}/${total} | ST ${trendHazir}/${total} | Eşik %${(threshold * 100).toFixed(0)}`);
    }
    return { ready: h.state.startupMarketReady === true, currentReady: ready, pusuHazir, trendHazir, total, ratio, threshold };
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
    return ag.havuzdaCalistir(h.state.semboller, worker, workers);
}

async function derinGecmisiInsaEt(options = {}) {
    const baslangic = Date.now();
    const startupConcurrency = Math.max(1, Number(options.concurrency || ayarlar.binanceStartupAgEszamanlilik || 5));
    const startupWorkers = Math.max(startupConcurrency, Number(options.workers || ayarlar.binanceStartupAgIsciSayisi || 10));
    const threshold = readyRatioThreshold();
    h.state.startupMarketReady = false;
    h.state.startupMarketWarmup = { durum: 'CALISIYOR', baslangic: new Date().toISOString(), tamamlanma: null, pusuHazir: 0, trendHazir: 0, oran: 0, hata: 0 };
    console.log(`📥 [AŞAMALI BAŞLANGIÇ] Piyasa verisi arka planda hazırlanıyor | Eşzamanlılık ${startupConcurrency} | Yeni giriş kapalı, pozisyon koruma aktif.`);
    h.state.yerelPusuHafizasi={}; h.state.canliFiyatlar={}; h.state.sniperMumlar={}; h.state.sniperCanliMumlar={}; h.state.sniperSuperTrend={}; h.state.sniperSuperTrendCanli={}; h.state.trendMumlar={}; h.state.trendCanliMumlar={}; h.state.trendSuperTrend={}; h.state.trendSuperTrendCanli={}; h.state.sonPusuMumZamani={};

    const tumSemboller=[...(h.state.semboller || [])];
    const gecerli=[];
    const pusuTf=pusuKaynakPeriyodu();
    let hata=0;
    let st={ hata: 0 };
    try {
        const sonuclar=await sembolHavuzu(async sym=>{
            const ham=await mumCek(sym, pusuTf, pusuMumLimiti(), `START_CANDLE:${sym}`, 'HIGH');
            const kapanmis=sadeceKapanmisMumlar(ham);
            if(kapanmis.length >= (ayarlar.bollingerperiod||20)) { h.state.yerelPusuHafizasi[sym]=kapanmis; h.state.sonPusuMumZamani[sym]=kapanmis.at(-1).closeTime; gecerli.push(sym); }
        }, { concurrency: startupConcurrency, workers: startupWorkers });
        hata=sonuclar.filter(x=>!x.ok).length;
        h.state.semboller=tumSemboller;
        const total=Math.max(1,h.state.semboller.length);
        const pusuRatio=gecerli.length/total;
        sonPusuDenemeBucket=closedCandleBucket(pusuTf);
        sonPusuDenemeZamani=Date.now();
        if(pusuRatio>=threshold) sonPusuBasariliBucket=sonPusuDenemeBucket;
        h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),durum:pusuRatio>=threshold?'HEALTHY':'DEGRADED',istenen:Number(ayarlar.taranacakCoinSayisi||200),secilen:h.state.semboller.length,mumHazir:gecerli.length,mumHata:hata,baslangicMumMs:Date.now()-baslangic,sonGuncelleme:new Date().toISOString()};
        h.state.startupMarketWarmup={...(h.state.startupMarketWarmup||{}),pusuHazir:gecerli.length,oran:Math.min(pusuRatio,Number(h.state.startupMarketWarmup?.oran||0))};
        console.log(`✅ Başlangıç mum verisi: ${gecerli.length}/${h.state.semboller.length} coin hazır | Hata ${hata} | Süre ${Date.now()-baslangic} ms.`);

        st = await superTrendHesapla(true, { concurrency: startupConcurrency, workers: startupWorkers });
        const gate = startupMarketDurumuGuncelle('INITIAL_WARMUP');
        h.state.startupMarketWarmup={...(h.state.startupMarketWarmup||{}),durum:gate.currentReady?'READY':'DEGRADED',tamamlanma:new Date().toISOString(),hata:hata+Number(st?.hata||0),sureMs:Date.now()-baslangic};
        console.log(`${gate.currentReady?'✅':'⚠️'} [AŞAMALI BAŞLANGIÇ] Piyasa hazırlığı ${gate.currentReady?'TAMAM':'DEGRADED'} | Pusu ${gate.pusuHazir}/${gate.total} | ST ${gate.trendHazir}/${gate.total} | Eşik %${(threshold*100).toFixed(0)} | Süre ${Date.now()-baslangic} ms.`);
        return { ready:gate.currentReady, pusuHazir:gate.pusuHazir, trendHazir:gate.trendHazir, total:gate.total, ratio:gate.ratio, hata:hata+Number(st?.hata||0), durationMs:Date.now()-baslangic };
    } finally {
        // Başlangıç isteği hata verse dahi canlı ağ kotası düşük/kararlı seviyeye döner
        // ve periyodik iyileştirme tek kopya olarak devreye girer. Isınma sırasında timer
        // başlatılmaz; aynı 200 coin için iki paralel ST dalgası oluşmaz.
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
        let guncellenen=0, yeniMum=0;
        const sonuclar=await sembolHavuzu(async sym=>{
            const ham=await mumCek(sym, tf, pusuMumLimiti(), `PUSU_CANDLE:${sym}`, 'LOW');
            const kapanmis=sadeceKapanmisMumlar(ham);
            if(kapanmis.length >= (ayarlar.bollingerperiod||20)) { const onceki=h.state.sonPusuMumZamani[sym]; const yeni=kapanmis.at(-1).closeTime; h.state.yerelPusuHafizasi[sym]=kapanmis; h.state.sonPusuMumZamani[sym]=yeni; guncellenen++; if(onceki && yeni!==onceki) yeniMum++; }
        });
        const hata=sonuclar.filter(x=>!x.ok).length;
        if(guncellenen/Math.max(1,h.state.semboller.length)>=readyRatioThreshold()) sonPusuBasariliBucket=bucket;
        h.state.sonPusuTaramaZamani=Date.now();
        h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),durum:guncellenen/Math.max(1,h.state.semboller.length)>=readyRatioThreshold()?'HEALTHY':'DEGRADED',mumHazir:guncellenen,mumHata:hata,pusuTazelemeMs:Date.now()-baslangic,sonGuncelleme:new Date().toISOString()};
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
    const sniperDue=baslangic||refreshDue(sniperBucket,sonSniperBasariliBucket,sonSniperDenemeBucket,sonSuperTrendDenemeZamani,baslamaZamani);
    const trendDue=baslangic||refreshDue(trendBucket,sonTrendBasariliBucket,sonTrendDenemeBucket,sonSuperTrendDenemeZamani,baslamaZamani);
    if(!sniperDue&&!trendDue) return {skipped:true,reason:'CLOSED_CANDLE_NOT_DUE'};
    if(superTrendCalisiyor && !baslangic) { overlapLog('superTrend','⏭️ [NETWORK GUARD] Önceki SuperTrend tazelemesi sürüyor; çakışan tur atlandı.'); return {skipped:true,reason:'OVERLAP'}; }
    superTrendCalisiyor=true;
    sonSuperTrendDenemeZamani=baslamaZamani;
    if(sniperDue) sonSniperDenemeBucket=sniperBucket;
    if(trendDue) sonTrendDenemeBucket=trendBucket;
    try {
        let sniperGuncellenen=0, trendGuncellenen=0, sniperHatali=0, trendHatali=0;
        const sonuclar=await sembolHavuzu(async sym=>{
            if(sniperDue){
                try{
                    const sniperHam=await mumCek(sym, sniperTf, 80, `SNIPER_CANDLE:${sym}`, baslangic?'HIGH':'LOW');
                    const sniper=sadeceKapanmisMumlar(sniperHam);
                    if(sniper.length>=5){ h.state.sniperMumlar[sym]=sniper; sniperGuncellenen++; } else sniperHatali++;
                }catch(err){sniperHatali++;throw err;}
            }
            if(trendDue){
                try{
                    const trendHam=await mumCek(sym, trendTf, 80, `TREND_CANDLE:${sym}`, baslangic?'HIGH':'LOW');
                    const trend=sadeceKapanmisMumlar(trendHam);
                    if(trend.length >= (ayarlar.superTrendPeriod||10)+2){ h.state.trendMumlar[sym]=trend; const st=m.hesaplaSuperTrend(trend); if(st?.trend){ h.state.trendSuperTrend[sym]=st.trend; h.state.sniperSuperTrend[sym]=st.trend; trendGuncellenen++; } else trendHatali++; } else trendHatali++;
                }catch(err){trendHatali++;throw err;}
            }
        }, { concurrency: options.concurrency, workers: options.workers });
        const havuzHata=sonuclar.filter(x=>!x.ok).length;
        if(sniperDue&&sniperGuncellenen/Math.max(1,h.state.semboller.length)>=readyRatioThreshold()) sonSniperBasariliBucket=sniperBucket;
        if(trendDue&&trendGuncellenen/Math.max(1,h.state.semboller.length)>=readyRatioThreshold()) sonTrendBasariliBucket=trendBucket;
        if(sniperDue) h.state.sonSniperGuncellemeZamani=Date.now();
        if(trendDue) h.state.sonTrendGuncellemeZamani=Date.now();
        const toplamHatali=sniperHatali+trendHatali+havuzHata;
        h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),durum:Math.min((sniperDue?sniperGuncellenen:Object.keys(h.state.sniperMumlar||{}).length)/Math.max(1,h.state.semboller.length),(trendDue?trendGuncellenen:Object.keys(h.state.trendSuperTrend||{}).length)/Math.max(1,h.state.semboller.length))>=readyRatioThreshold()?'HEALTHY':'DEGRADED',sniperHazir:sniperDue?sniperGuncellenen:Object.keys(h.state.sniperMumlar||{}).length,superTrendHazir:trendDue?trendGuncellenen:Object.keys(h.state.trendSuperTrend||{}).length,superTrendHata:toplamHatali,superTrendTazelemeMs:Date.now()-baslamaZamani,sonGuncelleme:new Date().toISOString()};
        startupMarketDurumuGuncelle(baslangic ? 'INITIAL_SUPERTREND' : 'SUPERTREND_REFRESH');
        console.log(`📊 [${new Date().toLocaleTimeString()}] Sniper veri (${sniperTf}): ${sniperDue?sniperGuncellenen:'ATLANDI'} coin | SuperTrend trend/onay (${trendTf}): ${trendDue?trendGuncellenen:'ATLANDI'} coin güncellendi, ${toplamHatali} hata | süre ${Date.now()-baslamaZamani} ms.`);
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
