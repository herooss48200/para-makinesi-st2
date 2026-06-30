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

async function derinGecmisiInsaEt() {
    console.log('📥 Başlangıç verileri çekiliyor...');
    h.state.yerelPusuHafizasi = {};
    h.state.canliFiyatlar = {};
    h.state.sniperMumlar = {};
    h.state.sniperSuperTrend = {};
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
    let guncellenen = 0;
    let hatali = 0;
    const PARALEL = 15;

    for (let i = 0; i < h.state.semboller.length; i += PARALEL) {
        const batch = h.state.semboller.slice(i, i + PARALEL);
        await Promise.all(batch.map(async (sym) => {
            try {
                const ham = await h.client.futuresCandles({
                    symbol: sym,
                    interval: ayarlar.sniperPeriyodu || '1m',
                    limit: 80
                });

                const kapanmis = sadeceKapanmisMumlar(ham);
                if (kapanmis.length >= (ayarlar.superTrendPeriod || 10) + 2) {
                    h.state.sniperMumlar[sym] = kapanmis;
                    const st = m.hesaplaSuperTrend(kapanmis);
                    if (st && st.trend) {
                        h.state.sniperSuperTrend[sym] = st.trend;
                        guncellenen++;
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
    if (baslangic || guncellenen > 0 || hatali > 0) {
        console.log(`📊 [${new Date().toLocaleTimeString()}] SuperTrend: ${guncellenen} coin güncellendi, ${hatali} coin hatalı.`);
    }
}

module.exports = {
    derinGecmisiInsaEt,
    pusuVerileriniTazele,
    superTrendHesapla
};
