delete require.cache[require.resolve('./ayarlar.js')];
const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const m = require('./motor.js');
const ag = require('./64_binance_network_resilience.js');

let pusuTazelemeCalisiyor = false;
let superTrendCalisiyor = false;

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
function agAyar(label) { return { timeoutMs: ayarlar.binanceAgTimeoutMs || 15000, retries: ayarlar.binanceAgRetry ?? 2, baseDelayMs: ayarlar.binanceAgRetryTabanMs || 900, label }; }
async function mumCek(sym, interval, limit, label) {
    return ag.binanceMumlariCek(sym, interval, limit, agAyar(label));
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
    const sonuclar=await sembolHavuzu(async sym=>{
        const ham=await mumCek(sym, pusuKaynakPeriyodu(), pusuMumLimiti(), `START_CANDLE:${sym}`);
        const kapanmis=sadeceKapanmisMumlar(ham);
        if(kapanmis.length >= (ayarlar.bollingerperiod||20)) { h.state.yerelPusuHafizasi[sym]=kapanmis; h.state.sonPusuMumZamani[sym]=kapanmis.at(-1).closeTime; gecerli.push(sym); }
    });
    const hata=sonuclar.filter(x=>!x.ok).length;
    // Geçici ağ hatası yaşayan sembolleri kalıcı olarak takip listesinden çıkarmıyoruz.
    h.state.semboller=tumSemboller;
    h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),durum:hata===0&&gecerli.length===h.state.semboller.length?'HEALTHY':'DEGRADED',istenen:Number(ayarlar.taranacakCoinSayisi||200),secilen:h.state.semboller.length,mumHazir:gecerli.length,mumHata:hata,baslangicMumMs:Date.now()-baslangic,sonGuncelleme:new Date().toISOString()};
    console.log(`✅ Başlangıç mum verisi: ${gecerli.length}/${h.state.semboller.length} coin hazır${hata ? ` | sonraki turda tekrar denenecek: ${hata}` : ''} | Süre ${Date.now()-baslangic} ms.`);
    await superTrendHesapla(true);
    setInterval(()=>{ pusuVerileriniTazele().catch(e=>console.error('❌ Pusu tazeleme üst hata:',e.message)); }, ayarlar.pusuVeriTazelemeMs || 30000);
    setInterval(()=>{ superTrendHesapla(false).catch(e=>console.error('❌ SuperTrend üst hata:',e.message)); }, ayarlar.superTrendTazelemeMs || 10000);
}

async function pusuVerileriniTazele() {
    const baslangic=Date.now();
    if (pusuTazelemeCalisiyor) { console.log('⏭️ [NETWORK GUARD] Önceki 15m tazeleme sürüyor; çakışan tur atlandı.'); return; }
    pusuTazelemeCalisiyor=true;
    try {
        let guncellenen=0, yeniMum=0;
        const sonuclar=await sembolHavuzu(async sym=>{
            const ham=await mumCek(sym, pusuKaynakPeriyodu(), pusuMumLimiti(), `PUSU_CANDLE:${sym}`);
            const kapanmis=sadeceKapanmisMumlar(ham);
            if(kapanmis.length >= (ayarlar.bollingerperiod||20)) { const onceki=h.state.sonPusuMumZamani[sym]; const yeni=kapanmis.at(-1).closeTime; h.state.yerelPusuHafizasi[sym]=kapanmis; h.state.sonPusuMumZamani[sym]=yeni; guncellenen++; if(onceki && yeni!==onceki) yeniMum++; }
        });
        const hata=sonuclar.filter(x=>!x.ok).length;
        h.state.sonPusuTaramaZamani=Date.now();
        h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),durum:hata===0&&guncellenen===h.state.semboller.length?'HEALTHY':'DEGRADED',mumHazir:guncellenen,mumHata:hata,pusuTazelemeMs:Date.now()-baslangic,sonGuncelleme:new Date().toISOString()};
        if(guncellenen>0 || hata>0) console.log(`📊 [${new Date().toLocaleTimeString()}] ${ayarlar.pusuPeriyodu} veriler tazelendi: ${guncellenen} coin | yeni kapanan mum: ${yeniMum} | ağ hatası: ${hata} | süre ${Date.now()-baslangic} ms`);
    } finally { pusuTazelemeCalisiyor=false; }
}

async function superTrendHesapla(baslangic=false) {
    const baslamaZamani=Date.now();
    if(superTrendCalisiyor && !baslangic) { console.log('⏭️ [NETWORK GUARD] Önceki SuperTrend tazelemesi sürüyor; çakışan tur atlandı.'); return; }
    superTrendCalisiyor=true;
    try {
        let sniperGuncellenen=0, trendGuncellenen=0, hatali=0;
        const stPeriyodu=superTrendOnayPeriyodu();
        const sonuclar=await sembolHavuzu(async sym=>{
            const sniperHam=await mumCek(sym, ayarlar.sniperPeriyodu || '5m', 80, `SNIPER_CANDLE:${sym}`);
            const sniper=sadeceKapanmisMumlar(sniperHam);
            if(sniper.length>=5){ h.state.sniperMumlar[sym]=sniper; sniperGuncellenen++; }
            const trendHam=await mumCek(sym, stPeriyodu, 80, `TREND_CANDLE:${sym}`);
            const trend=sadeceKapanmisMumlar(trendHam);
            if(trend.length >= (ayarlar.superTrendPeriod||10)+2){ h.state.trendMumlar[sym]=trend; const st=m.hesaplaSuperTrend(trend); if(st?.trend){ h.state.trendSuperTrend[sym]=st.trend; h.state.sniperSuperTrend[sym]=st.trend; trendGuncellenen++; } else hatali++; } else hatali++;
        });
        hatali += sonuclar.filter(x=>!x.ok).length;
        h.state.sonSniperGuncellemeZamani=Date.now(); h.state.sonTrendGuncellemeZamani=Date.now();
        h.state.sembolVeriSagligi={...(h.state.sembolVeriSagligi||{}),durum:hatali===0&&trendGuncellenen===h.state.semboller.length?'HEALTHY':'DEGRADED',sniperHazir:sniperGuncellenen,superTrendHazir:trendGuncellenen,superTrendHata:hatali,superTrendTazelemeMs:Date.now()-baslamaZamani,sonGuncelleme:new Date().toISOString()};
        if(baslangic || trendGuncellenen>0 || hatali>0) console.log(`📊 [${new Date().toLocaleTimeString()}] Sniper veri (${ayarlar.sniperPeriyodu}): ${sniperGuncellenen} coin | SuperTrend trend/onay (${stPeriyodu}): ${trendGuncellenen} coin güncellendi, ${hatali} coin hatalı | süre ${Date.now()-baslamaZamani} ms.`);
    } finally { superTrendCalisiyor=false; }
}
module.exports={ derinGecmisiInsaEt, pusuVerileriniTazele, superTrendHesapla };
