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


function periyotMs(periyot) {
    const yazi = String(periyot || '5m').trim();
    const sayi = parseInt(yazi, 10);
    if (!Number.isFinite(sayi) || sayi <= 0) return 5 * 60 * 1000;
    if (yazi.endsWith('m')) return sayi * 60 * 1000;
    if (yazi.endsWith('h')) return sayi * 60 * 60 * 1000;
    if (yazi.endsWith('d')) return sayi * 24 * 60 * 60 * 1000;
    return sayi * 60 * 1000;
}

function otomatikTazelemeMs(periyot, tip) {
    const ms = periyotMs(periyot);
    // Uzun pusu periyotlarında yeni kapanan mumu kaçırmamak için makul aralıklarla kontrol eder.
    // Sniper tarafı daha hızlı kontrol edilir ama REST yükü aşırı artmasın diye alt sınır vardır.
    if (tip === 'PUSU') return Math.max(30000, Math.min(ms / 10, 5 * 60 * 1000));
    return Math.max(10000, Math.min(ms / 5, 60 * 1000));
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
    h.state.sniperBollinger = {};
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

    const pusuTazelemeMs = ayarlar.pusuVeriTazelemeMs || otomatikTazelemeMs(ayarlar.pusuPeriyodu || '5m', 'PUSU');
    const sniperTazelemeMs = ayarlar.superTrendTazelemeMs || otomatikTazelemeMs(ayarlar.sniperPeriyodu || '1m', 'SNIPER');

    console.log(`⏱️ Pusu Periyodu: ${ayarlar.pusuPeriyodu} | Sniper Periyodu: ${ayarlar.sniperPeriyodu}`);
    console.log(`⏱️ Pusu veri kontrolü: ${Math.round(pusuTazelemeMs / 1000)} sn | Sniper kontrolü: ${Math.round(sniperTazelemeMs / 1000)} sn`);

    setInterval(async () => {
        await pusuVerileriniTazele();
    }, pusuTazelemeMs);

    setInterval(async () => {
        await superTrendHesapla(false);
    }, sniperTazelemeMs);
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
                    const sniperFiyatlar = kapanmis.map(x => x.close);
                    h.state.sniperBollinger[sym] = m.hesaplaBollinger(sniperFiyatlar);
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
        console.log(`📊 [${new Date().toLocaleTimeString()}] ${ayarlar.sniperPeriyodu} SuperTrend+Bollinger: ${guncellenen} coin güncellendi, ${hatali} coin hatalı.`);
    }
}

module.exports = {
    derinGecmisiInsaEt,
    pusuVerileriniTazele,
    superTrendHesapla
};
