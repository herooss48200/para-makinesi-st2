const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const m = require('./motor.js');

const core = require('./72_st2_renko_core.js');

function tetikFiyati(pusu) { return core.tetikFiyati(pusu, ayarlar.renkoTetikYuzdesi ?? ayarlar.tetikYuzdesi ?? 0); }
function pusuOlustur(sym, yon, brick, scenario) { return core.pusuOlustur(sym, yon, brick, scenario); }

function yeniTuglayiIsle(sym, brick, bollinger, stTrend) {
    const store = h.state.st2Renko;
    let pusu = store.pusular[sym];
    if (pusu) {
        core.aktifPusudaTuglaIsle(pusu, brick, stTrend);
        // Üçüncü tuğla önce değerlendirilir; emir kontrolünden sonra iptal edilir.
        return pusu;
    }

    const longScenario = m.pusuSenaryosuTespit(brick, null, bollinger, 'LONG');
    if (brick.color === 'RED' && longScenario.senaryo) {
        store.pusular[sym] = pusuOlustur(sym, 'LONG', brick, longScenario);
        return store.pusular[sym];
    }
    const shortScenario = m.pusuSenaryosuTespit(brick, null, bollinger, 'SHORT');
    if (brick.color === 'GREEN' && shortScenario.senaryo) {
        store.pusular[sym] = pusuOlustur(sym, 'SHORT', brick, shortScenario);
        return store.pusular[sym];
    }
    return null;
}

async function pusuDegerlendir(sym) {
    const store = h.state.st2Renko;
    const pusu = store.pusular[sym];
    if (!pusu) return false;
    const price = Number(h.state.canliFiyatlar[sym]);
    const target = tetikFiyati(pusu);
    if (price > 0 && ((pusu.yon === 'LONG' && price >= target) || (pusu.yon === 'SHORT' && price <= target))) {
        pusu.fiyatTetigiGoruldu = true;
    }
    const series = store.seriler[sym] || [];
    const st = m.hesaplaSuperTrend(series);
    if ((pusu.yon === 'LONG' && st.trend === 'UP') || (pusu.yon === 'SHORT' && st.trend === 'DOWN')) pusu.superTrendOnayi = true;

    const valid = pusu.tuglaSayaci <= Number(ayarlar.maxPusuBeklemeTugla || 3);
    if (valid && pusu.donusTuglasiKapandi && pusu.fiyatTetigiGoruldu && pusu.superTrendOnayi) {
        const girisAnalizi = {
            entryStrategy: 'ST2_RENKO', pusuPeriyodu: ayarlar.renkoKaynakPeriyodu || '15m',
            sniperPeriyodu: 'LIVE_PRICE', trendPeriyodu: 'RENKO', hedefFiyati: pusu.referansSeviye,
            tetikFiyati: target, tetikYuzdesiAyar: Number(ayarlar.renkoTetikYuzdesi || 0),
            tetikModu: 'RENKO_REFERANS_BUFFER', girisFiyati: price, superTrendYonu: st.trend,
            stKaynak: 'RENKO', senaryo: pusu.senaryo, pusuSayaci: pusu.tuglaSayaci,
            maxPusuBeklemeMum: Number(ayarlar.maxPusuBeklemeTugla || 3),
            renkoBoxSize: store.boxSize?.[sym] || 0, pusuTuglasi: { ...pusu }
        };
        const ok = await m.pozisyonAc(sym, pusu.yon, price, girisAnalizi);
        if (ok) delete store.pusular[sym];
        return ok;
    }
    if (pusu.tuglaSayaci >= Number(ayarlar.maxPusuBeklemeTugla || 3)) delete store.pusular[sym];
    return false;
}

async function taraVeDegerlendir() {
    const store = h.state.st2Renko;
    if (!store.boxSize) store.boxSize = {};
    for (const sym of h.state.semboller) {
        if (h.state.alinanlar.includes(sym) || h.state.aktifShortlar.includes(sym)) continue;
        const candles = h.state.yerelPusuHafizasi[sym];
        const box = core.atr(candles, Number(ayarlar.renkoAtrPeriod || 14));
        if (!(box > 0)) continue;
        const bricks = core.renkoUret(candles, box);
        store.seriler[sym] = bricks;
        store.boxSize[sym] = box;
        const lastId = Number(store.sonIslenenTugla[sym] || 0);
        for (const brick of bricks.filter(x => x.id > lastId)) {
            const upto = bricks.filter(x => x.id <= brick.id);
            const bb = m.hesaplaBollinger(upto.map(x => x.close));
            if (bb.upper.length) yeniTuglayiIsle(sym, brick, bb, m.hesaplaSuperTrend(upto).trend);
            store.sonIslenenTugla[sym] = brick.id;
            await pusuDegerlendir(sym);
        }
        await pusuDegerlendir(sym); // canlı fiyat ve ST sıra bağımsız tekrar kontrolü
    }
}

module.exports = { ...core, tetikFiyati, pusuOlustur, yeniTuglayiIsle, pusuDegerlendir, taraVeDegerlendir };
