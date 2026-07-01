delete require.cache[require.resolve('./ayarlar.js')];
const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const m = require('./motor.js');

function mumDonustur(x) {
    return {
        openTime: Number(x.openTime),
        closeTime: Number(x.closeTime),
        open: parseFloat(x.open),
        high: parseFloat(x.high),
        low: parseFloat(x.low),
        close: parseFloat(x.close),
        volume: parseFloat(x.volume || 0)
    };
}

function sadeceKapanmisMumlar(mumlar) {
    const now = Date.now();
    return (mumlar || []).filter(x => Number(x.closeTime) <= now).map(mumDonustur);
}

function superTrendOnayPeriyodu() {
    return ayarlar.superTrendPeriyodu || ayarlar.trendPeriyodu || ayarlar.sniperPeriyodu || '5m';
}

async function derinGecmisiInsaEt() {
    console.log('📥 Başlangıç verileri çekiliyor...');
    h.state.yerelPusuHafizasi = {};
    h.state.canliFiyatlar = {};
    h.state.sniperMumlar = {};
    h.state.sniperCanliMumlar = {};
    h.state.sniperSuperTrend = {};
    h.state.sniperSuperTrendCanli = {};
    h.state.trendMumlar = {};
    h.state.trendCanliMumlar = {};
    h.state.trendSuperTrend = {};
    h.state.trendSuperTrendCanli = {};
    h.state.sonPusuMumZamani = {};

    const PARALEL = 15;
    const gecerliSemboller = [];

    for (let i = 0; i < h.state.semboller.length; i += PARALEL) {
        const batch = h.state.semboller.slice(i, i + PARALEL);
        await Promise.all(batch.map(async (sym) => {
            try {
                const ham = await h.client.futuresCandles({
                    symbol: sym,
                    interval: ayarlar.pusuPeriyodu || '5m',
                    limit: (ayarlar.bollingerperiod || 20) + 5
                });

                const kapanmis = sadeceKapanmisMumlar(ham);
                if (kapanmis.length >= (ayarlar.bollingerperiod || 20)) {
                    h.state.yerelPusuHafizasi[sym] = kapanmis;
                    h.state.sonPusuMumZamani[sym] = kapanmis[kapanmis.length - 1].closeTime;
                    gecerliSemboller.push(sym);
                }
            } catch (e) {
                console.error(`❌ ${sym} geçmiş veri hatası:`, e.message);
            }
        }));
    }

    h.state.semboller = gecerliSemboller;
    console.log(`✅ ${h.state.semboller.length} coin için kapanmış ${ayarlar.pusuPeriyodu} verileri çekildi.`);

    await superTrendHesapla(true);

    setInterval(async () => {
        await pusuVerileriniTazele();
    }, ayarlar.pusuVeriTazelemeMs || 30000);

    setInterval(async () => {
        await superTrendHesapla(false);
    }, ayarlar.superTrendTazelemeMs || 10000);
}

async function pusuVerileriniTazele() {
    const PARALEL = 15;
    let guncellenen = 0;
    let yeniMum = 0;

    for (let i = 0; i < h.state.semboller.length; i += PARALEL) {
        const batch = h.state.semboller.slice(i, i + PARALEL);
        await Promise.all(batch.map(async (sym) => {
            try {
                const ham = await h.client.futuresCandles({
                    symbol: sym,
                    interval: ayarlar.pusuPeriyodu || '5m',
                    limit: (ayarlar.bollingerperiod || 20) + 5
                });

                const kapanmis = sadeceKapanmisMumlar(ham);
                if (kapanmis.length >= (ayarlar.bollingerperiod || 20)) {
                    const oncekiSon = h.state.sonPusuMumZamani[sym];
                    const yeniSon = kapanmis[kapanmis.length - 1].closeTime;
                    h.state.yerelPusuHafizasi[sym] = kapanmis;
                    h.state.sonPusuMumZamani[sym] = yeniSon;
                    guncellenen++;
                    if (oncekiSon && yeniSon !== oncekiSon) yeniMum++;
                }
            } catch (e) {
                console.error(`❌ ${sym} ${ayarlar.pusuPeriyodu} tazeleme hatası:`, e.message);
            }
        }));
    }

    h.state.sonPusuTaramaZamani = Date.now();
    if (guncellenen > 0) {
        console.log(`📊 [${new Date().toLocaleTimeString()}] ${ayarlar.pusuPeriyodu} veriler tazelendi: ${guncellenen} coin | yeni kapanan mum: ${yeniMum}`);
    }
}

async function superTrendHesapla(baslangic = false) {
    let sniperGuncellenen = 0;
    let trendGuncellenen = 0;
    let hatali = 0;
    const PARALEL = 15;
    const stPeriyodu = superTrendOnayPeriyodu();

    for (let i = 0; i < h.state.semboller.length; i += PARALEL) {
        const batch = h.state.semboller.slice(i, i + PARALEL);
        await Promise.all(batch.map(async (sym) => {
            try {
                const sniperHam = await h.client.futuresCandles({
                    symbol: sym,
                    interval: ayarlar.sniperPeriyodu || '5m',
                    limit: 80
                });
                const sniperKapanmis = sadeceKapanmisMumlar(sniperHam);
                if (sniperKapanmis.length >= 5) {
                    h.state.sniperMumlar[sym] = sniperKapanmis;
                    sniperGuncellenen++;
                }

                const trendHam = await h.client.futuresCandles({
                    symbol: sym,
                    interval: stPeriyodu,
                    limit: 80
                });
                const trendKapanmis = sadeceKapanmisMumlar(trendHam);
                if (trendKapanmis.length >= (ayarlar.superTrendPeriod || 10) + 2) {
                    h.state.trendMumlar[sym] = trendKapanmis;
                    const st = m.hesaplaSuperTrend(trendKapanmis);
                    if (st && st.trend) {
                        h.state.trendSuperTrend[sym] = st.trend;
                        h.state.sniperSuperTrend[sym] = st.trend; // Eski rapor/log uyumluluğu için alias.
                        trendGuncellenen++;
                    } else {
                        hatali++;
                    }
                } else {
                    hatali++;
                }
            } catch (e) {
                hatali++;
            }
        }));
    }

    h.state.sonSniperGuncellemeZamani = Date.now();
    h.state.sonTrendGuncellemeZamani = Date.now();
    if (baslangic || trendGuncellenen > 0 || hatali > 0) {
        console.log(`📊 [${new Date().toLocaleTimeString()}] Sniper veri (${ayarlar.sniperPeriyodu}): ${sniperGuncellenen} coin | SuperTrend trend/onay (${stPeriyodu}): ${trendGuncellenen} coin güncellendi, ${hatali} coin hatalı.`);
    }
}

module.exports = {
    derinGecmisiInsaEt,
    pusuVerileriniTazele,
    superTrendHesapla
};
