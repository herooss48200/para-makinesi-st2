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
async function sembolHavuzu(worker) {
    ag.configure({ concurrency: ayarlar.binanceAgEszamanlilik || 3 });
    return ag.havuzdaCalistir(h.state.semboller, worker, Math.max(3, ayarlar.binanceAgIsciSayisi || 8));
}

async function derinGecmisiInsaEt() {
    const baslangic=Date.now();
    console.log('📥 Başlangıç verileri çekiliyor...');
    h.state.yerelPusuHafizasi={}; h.state.canliFiyatlar={}; h.state.sniperMumlar={}; h.state.sniperCanliMumlar={}; h.state.sniperSuperTrend={}; h.state.sniperSuperTrendCanli={}; h.state.trendMumlar={}; h.state.trendCanliMumlar={}; h.state.trendSuperTrend={}; h.state.trendSuperTrendCanli={}; h.state.sonPusuMumZamani={};
    const tumSemboller=[...(h.state.semboller || [])];
    const gecerli=[];
    const pusuTf=pusuKaynakPeriyodu();
    const sonuclar=await sembolHavuzu(async sym=>{
        const ham=await mumCek(sym, pusuTf, pusuMumLimiti(), `START_CANDLE:${sym}`, 'HIGH');
        const kapanmis=sadeceKapanmisMumlar(ham);
        if(kapanmis.length >= (ayarlar.bollingerperiod||20)) { h.state.yerelPusuHafizasi[sym]=kapanmis; h.state.sonPusuMumZamani[sym]=kapanmis.at(-1).closeTime; gecerli.push(sym); }
    });
    const hata=sonuclar.filter(x=>!x.ok).length;
    h.state.semboller=tumSemboller;
    sonPusuDenemeBucket=closedCandleBucket(pusuTf);
    sonPusuDenemeZamani=Date.now();
    if(hata===0&&gecerli.length===h.state.semboller.length) sonPusuBasariliBucket=sonPusuDenemeBucket;
    h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),durum:hata===0&&gecerli.length===h.state.semboller.length?'HEALTHY':'DEGRADED',istenen:Number(ayarlar.taranacakCoinSayisi||200),secilen:h.state.semboller.length,mumHazir:gecerli.length,mumHata:hata,baslangicMumMs:Date.now()-baslangic,sonGuncelleme:new Date().toISOString()};
    console.log(`✅ Başlangıç mum verisi: ${gecerli.length}/${h.state.semboller.length} coin hazır${hata ? ` | sonraki turda tekrar denenecek: ${hata}` : ''} | Süre ${Date.now()-baslangic} ms.`);
    await superTrendHesapla(true);
    const pusuTimer=setInterval(()=>{ pusuVerileriniTazele().catch(e=>console.error('❌ Pusu tazeleme üst hata:',e.message)); }, ayarlar.pusuVeriTazelemeMs || 30000);
    const stTimer=setInterval(()=>{ superTrendHesapla(false).catch(e=>console.error('❌ SuperTrend üst hata:',e.message)); }, ayarlar.superTrendTazelemeMs || 10000);
    pusuTimer.unref?.(); stTimer.unref?.();
}

async function pusuVerileriniTazele(options={}) {
    const baslangic=Date.now();
    const tf=pusuKaynakPeriyodu();
    const bucket=closedCandleBucket(tf,baslangic);
    if(options.force!==true&&!refreshDue(bucket,sonPusuBasariliBucket,sonPusuDenemeBucket,sonPusuDenemeZamani,baslangic)) return {skipped:true,reason:'CLOSED_CANDLE_NOT_DUE',interval:tf,bucket};
    if (pusuTazelemeCalisiyor) { console.log('⏭️ [NETWORK GUARD] Önceki 15m tazeleme sürüyor; çakışan tur atlandı.'); return {skipped:true,reason:'OVERLAP'}; }
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
        if(hata===0&&guncellenen===h.state.semboller.length) sonPusuBasariliBucket=bucket;
        h.state.sonPusuTaramaZamani=Date.now();
        h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),durum:hata===0&&guncellenen===h.state.semboller.length?'HEALTHY':'DEGRADED',mumHazir:guncellenen,mumHata:hata,pusuTazelemeMs:Date.now()-baslangic,sonGuncelleme:new Date().toISOString()};
        console.log(`📊 [${new Date().toLocaleTimeString()}] ${tf} veriler tazelendi: ${guncellenen} coin | yeni kapanan mum: ${yeniMum} | ağ hatası: ${hata} | süre ${Date.now()-baslangic} ms`);
        return {skipped:false,guncellenen,yeniMum,hata,durationMs:Date.now()-baslangic};
    } finally { pusuTazelemeCalisiyor=false; }
}

async function superTrendHesapla(baslangic=false) {
    const baslamaZamani=Date.now();
    const sniperTf=ayarlar.sniperPeriyodu || '5m';
    const trendTf=superTrendOnayPeriyodu();
    const sniperBucket=closedCandleBucket(sniperTf,baslamaZamani);
    const trendBucket=closedCandleBucket(trendTf,baslamaZamani);
    const sniperDue=baslangic||refreshDue(sniperBucket,sonSniperBasariliBucket,sonSniperDenemeBucket,sonSuperTrendDenemeZamani,baslamaZamani);
    const trendDue=baslangic||refreshDue(trendBucket,sonTrendBasariliBucket,sonTrendDenemeBucket,sonSuperTrendDenemeZamani,baslamaZamani);
    if(!sniperDue&&!trendDue) return {skipped:true,reason:'CLOSED_CANDLE_NOT_DUE'};
    if(superTrendCalisiyor && !baslangic) { console.log('⏭️ [NETWORK GUARD] Önceki SuperTrend tazelemesi sürüyor; çakışan tur atlandı.'); return {skipped:true,reason:'OVERLAP'}; }
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
        });
        const havuzHata=sonuclar.filter(x=>!x.ok).length;
        if(sniperDue&&sniperHatali===0&&sniperGuncellenen===h.state.semboller.length) sonSniperBasariliBucket=sniperBucket;
        if(trendDue&&trendHatali===0&&trendGuncellenen===h.state.semboller.length) sonTrendBasariliBucket=trendBucket;
        if(sniperDue) h.state.sonSniperGuncellemeZamani=Date.now();
        if(trendDue) h.state.sonTrendGuncellemeZamani=Date.now();
        const toplamHatali=sniperHatali+trendHatali+havuzHata;
        h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),durum:toplamHatali===0?'HEALTHY':'DEGRADED',sniperHazir:sniperDue?sniperGuncellenen:Object.keys(h.state.sniperMumlar||{}).length,superTrendHazir:trendDue?trendGuncellenen:Object.keys(h.state.trendSuperTrend||{}).length,superTrendHata:toplamHatali,superTrendTazelemeMs:Date.now()-baslamaZamani,sonGuncelleme:new Date().toISOString()};
        console.log(`📊 [${new Date().toLocaleTimeString()}] Sniper veri (${sniperTf}): ${sniperDue?sniperGuncellenen:'ATLANDI'} coin | SuperTrend trend/onay (${trendTf}): ${trendDue?trendGuncellenen:'ATLANDI'} coin güncellendi, ${toplamHatali} hata | süre ${Date.now()-baslamaZamani} ms.`);
        return {skipped:false,sniperDue,trendDue,sniperGuncellenen,trendGuncellenen,hata:toplamHatali,durationMs:Date.now()-baslamaZamani};
    } finally { superTrendCalisiyor=false; }
}
function resetScheduleForTest(){
    pusuTazelemeCalisiyor=false;superTrendCalisiyor=false;
    sonPusuBasariliBucket=null;sonPusuDenemeBucket=null;sonPusuDenemeZamani=0;
    sonSniperBasariliBucket=null;sonTrendBasariliBucket=null;sonSniperDenemeBucket=null;sonTrendDenemeBucket=null;sonSuperTrendDenemeZamani=0;
}
module.exports={ derinGecmisiInsaEt, pusuVerileriniTazele, superTrendHesapla, _intervalMs:intervalMs, _closedCandleBucket:closedCandleBucket, _refreshDue:refreshDue, _resetScheduleForTest:resetScheduleForTest };
