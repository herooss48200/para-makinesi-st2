'use strict';

/**
 * AGROS ST2 v6.12.0 — ST1 GATED RENKO ENTRY
 *
 * Bu katman emir açmaz. ST2 Renko pususu aktifken ST1'in güncel,
 * aynı yönlü normal mum kurulumunu ve 3m SuperTrend onayını değerlendirir.
 * Gerçek tetik seviyesi ST2 referans Renko tuğlasıdır.
 */
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const m = require('./motor.js');

const VERSION = 'v6.12.0-ST1-GATED-RENKO-ENTRY';

function n(v, d = 0) {
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
}

function periyotMs(periyot) {
    const yazi = String(periyot || '3m').trim().toLowerCase();
    const sayi = parseInt(yazi, 10);
    if (!Number.isFinite(sayi) || sayi <= 0) return 180000;
    if (yazi.endsWith('m')) return sayi * 60 * 1000;
    if (yazi.endsWith('h')) return sayi * 60 * 60 * 1000;
    if (yazi.endsWith('d')) return sayi * 24 * 60 * 60 * 1000;
    return sayi * 60 * 1000;
}

function superTrendOnayPeriyodu() {
    return ayarlar.superTrendPeriyodu || ayarlar.trendPeriyodu || ayarlar.sniperPeriyodu || '3m';
}

function mumKopyala(mum) {
    if (!mum) return null;
    return {
        openTime: n(mum.openTime),
        closeTime: n(mum.closeTime),
        open: n(mum.open),
        high: n(mum.high),
        low: n(mum.low),
        close: n(mum.close),
        volume: n(mum.volume)
    };
}

function pusuKurulumu(candles, yon, now = Date.now()) {
    const taraf = String(yon || '').toUpperCase();
    const min = Math.max(2, Number(ayarlar.bollingerperiod || 20));
    const maxBekleme = Math.max(1, Number(ayarlar.maxPusuBeklemeMum ?? 3));
    const kapali = (Array.isArray(candles) ? candles : [])
        .filter(mum => mum && n(mum.closeTime) > 0 && n(mum.closeTime) <= now);

    if (kapali.length < min) {
        return { uygun: false, reason: 'ST1_15M_VERI_YETERSIZ', taraf, maxBekleme };
    }

    const sonIndex = kapali.length - 1;
    const ilkAdayIndex = Math.max(min - 1, sonIndex - (maxBekleme - 1));
    let ayniYonKaydi = null;
    let karsiYonKaydi = null;

    // ST1'in özgün pusu ömrünü yan etkisiz biçimde yeniden üretir:
    // son 3 kapanmış 15m mum içindeki en güncel geçerli pusu aranır.
    // Bollinger her adayın kendi kapanış anındaki veriyle hesaplanır; gelecek mum sızıntısı yoktur.
    for (let i = sonIndex; i >= ilkAdayIndex; i--) {
        const sonMum = kapali[i];
        const oncekiMum = kapali[i - 1];
        if (!sonMum || !oncekiMum) continue;
        const pencere = kapali.slice(0, i + 1);
        const fiyatlar = pencere.map(x => n(x?.close)).filter(x => x > 0);
        const bollinger = m.hesaplaBollinger(fiyatlar);
        const ayniYon = m.pusuSenaryosuTespit(sonMum, oncekiMum, bollinger, taraf);
        const karsiYon = m.pusuSenaryosuTespit(sonMum, oncekiMum, bollinger, taraf === 'LONG' ? 'SHORT' : 'LONG');
        const ortak = {
            index: i,
            gecenMumSayisi: sonIndex - i,
            kaynakMumZamani: n(sonMum.closeTime),
            sonMum: mumKopyala(sonMum),
            oncekiMum: mumKopyala(oncekiMum)
        };
        if (!ayniYonKaydi && ayniYon?.senaryo) ayniYonKaydi = { ...ortak, sonuc: ayniYon };
        if (!karsiYonKaydi && karsiYon?.senaryo) karsiYonKaydi = { ...ortak, sonuc: karsiYon };
        if (ayniYonKaydi && karsiYonKaydi) break;
    }

    const karsiDahaYeni = Boolean(karsiYonKaydi && (!ayniYonKaydi || karsiYonKaydi.index > ayniYonKaydi.index));
    if (!ayniYonKaydi) {
        return {
            uygun: false,
            reason: karsiYonKaydi ? 'ST1_KARSI_YON_PUSU' : 'ST1_15M_PUSU_YOK',
            taraf,
            maxBekleme,
            karsiYonSenaryo: karsiYonKaydi?.sonuc?.senaryo || null,
            karsiYonTargetLevel: n(karsiYonKaydi?.sonuc?.targetLevel),
            karsiYonGecenMumSayisi: karsiYonKaydi?.gecenMumSayisi ?? null,
            karsiYonKaynakMumZamani: karsiYonKaydi?.kaynakMumZamani || null
        };
    }

    const secilen = ayniYonKaydi.sonuc;
    return {
        uygun: !karsiDahaYeni,
        reason: karsiDahaYeni ? 'ST1_KARSI_YON_PUSU' : 'ST1_15M_PUSU_UYGUN',
        taraf,
        senaryo: secilen.senaryo || null,
        targetLevel: n(secilen.targetLevel),
        bandLevel: n(secilen.bandLevel),
        altBand: n(secilen.altBand),
        ortaBand: n(secilen.ortaBand),
        ustBand: n(secilen.ustBand),
        bandFarkYuzde: n(secilen.bandFarkYuzde),
        bandGenisligiYuzde: n(secilen.bandGenisligiYuzde),
        govdeYuzde: n(secilen.govdeYuzde),
        gecenMumSayisi: ayniYonKaydi.gecenMumSayisi,
        maxBeklemeMum: maxBekleme,
        kaynakMumZamani: ayniYonKaydi.kaynakMumZamani,
        karsiYonSenaryo: karsiDahaYeni ? karsiYonKaydi?.sonuc?.senaryo || null : null,
        karsiYonTargetLevel: karsiDahaYeni ? n(karsiYonKaydi?.sonuc?.targetLevel) : 0,
        sonMum: ayniYonKaydi.sonMum,
        oncekiMum: ayniYonKaydi.oncekiMum
    };
}

function aktifSuperTrend(sym, canliFiyat, now = Date.now()) {
    const stPeriyodu = superTrendOnayPeriyodu();
    const kapaliMumlar = h.state.trendMumlar?.[sym] || h.state.sniperMumlar?.[sym];
    const fiyat = n(canliFiyat);
    const fallback = h.state.trendSuperTrend?.[sym] || h.state.sniperSuperTrend?.[sym] || null;

    if (!ayarlar.canliSniperTetikAktif || !Array.isArray(kapaliMumlar)
        || kapaliMumlar.length < Number(ayarlar.superTrendPeriod || 10) + 2 || !(fiyat > 0)) {
        return { trend: fallback, value: 0, kaynak: 'KAPANMIS', periyot: stPeriyodu };
    }

    const sonKapali = kapaliMumlar.at(-1);
    if (!sonKapali || !n(sonKapali.closeTime)) {
        return { trend: fallback, value: 0, kaynak: 'KAPANMIS', periyot: stPeriyodu };
    }

    const periyot = periyotMs(stPeriyodu);
    const canliOpenTime = n(sonKapali.closeTime) + 1;
    const canliCloseTime = canliOpenTime + periyot - 1;
    h.state.trendCanliMumlar ||= {};
    h.state.trendSuperTrendCanli ||= {};

    let canliMum = h.state.trendCanliMumlar[sym];
    if (!canliMum || n(canliMum.openTime) !== canliOpenTime || now > canliCloseTime + periyot) {
        const acilis = n(sonKapali.close);
        canliMum = {
            openTime: canliOpenTime,
            closeTime: canliCloseTime,
            open: acilis,
            high: Math.max(acilis, fiyat),
            low: Math.min(acilis, fiyat),
            close: fiyat,
            volume: 0,
            gecici: true
        };
    } else {
        canliMum.high = Math.max(n(canliMum.high), fiyat);
        canliMum.low = Math.min(n(canliMum.low), fiyat);
        canliMum.close = fiyat;
    }

    h.state.trendCanliMumlar[sym] = canliMum;
    const st = m.hesaplaSuperTrend(kapaliMumlar.concat([canliMum]));
    if (st?.trend) {
        h.state.trendSuperTrendCanli[sym] = st.trend;
        return { ...st, kaynak: 'CANLI', periyot: stPeriyodu, canliMum: mumKopyala(canliMum) };
    }
    return { trend: fallback, value: 0, kaynak: 'KAPANMIS', periyot: stPeriyodu, canliMum: mumKopyala(canliMum) };
}

function gecGirisKontrolu(yon, fiyat, tetik) {
    const taraf = String(yon || '').toUpperCase();
    const p = n(fiyat);
    const t = n(tetik);
    const maxSapma = Math.max(0, n(ayarlar.maxGirisSapmaYuzde));
    if (!(p > 0 && t > 0)) {
        return { uygun: false, reason: 'ST1_GEC_GIRIS_FIYAT_EKSIK', sapmaYuzde: 0, maxSapmaYuzde: maxSapma };
    }
    const sapmaYuzde = taraf === 'LONG' ? ((p - t) / t) * 100 : ((t - p) / t) * 100;
    const uygun = maxSapma <= 0 || sapmaYuzde <= maxSapma + 1e-12;
    return {
        uygun,
        reason: uygun ? 'ST1_GEC_GIRIS_UYGUN' : 'ST1_GEC_GIRIS_SINIRI_ASILDI',
        sapmaYuzde,
        maxSapmaYuzde: maxSapma
    };
}

function degerlendir(sym, yon, canliFiyat, renkoTetikFiyati, now = Date.now()) {
    const taraf = String(yon || '').toUpperCase();
    const fiyat = n(canliFiyat);
    const tetik = n(renkoTetikFiyati);
    if (!['LONG', 'SHORT'].includes(taraf)) {
        return { uygun: false, hardReject: true, reason: 'ST1_YON_GECERSIZ', taraf };
    }
    if (!(fiyat > 0 && tetik > 0)) {
        return { uygun: false, hardReject: false, reason: 'ST1_FIYAT_VEYA_TETIK_EKSIK', taraf };
    }

    const pusu = pusuKurulumu(h.state.yerelPusuHafizasi?.[sym], taraf, now);
    if (!pusu.uygun) {
        const karsiPusu = Boolean(pusu.karsiYonSenaryo);
        return {
            uygun: false,
            hardReject: karsiPusu && ayarlar.st2St1KarsiYonPusuIptal !== false,
            reason: karsiPusu ? 'ST1_KARSI_YON_PUSU' : pusu.reason,
            taraf,
            pusu
        };
    }

    const st = aktifSuperTrend(sym, fiyat, now);
    if (!st.trend) {
        return { uygun: false, hardReject: false, reason: 'ST1_SUPERTREND_YOK', taraf, pusu, superTrend: st };
    }
    const trendUygun = taraf === 'LONG' ? st.trend === 'UP' : st.trend === 'DOWN';
    if (!trendUygun) {
        return {
            uygun: false,
            hardReject: ayarlar.st2St1KarsiTrendPusuIptal !== false,
            reason: 'ST1_SUPERTREND_KARSI_YON',
            taraf,
            pusu,
            superTrend: st
        };
    }

    let ortaBandUygun = true;
    let sniperOrtaBand = 0;
    if (ayarlar.sniperOrtaBandFiltresi) {
        sniperOrtaBand = n(h.state.sniperBollinger?.[sym]?.mid);
        if (!(sniperOrtaBand > 0)) {
            return { uygun: false, hardReject: false, reason: 'ST1_SNIPER_ORTA_BAND_YOK', taraf, pusu, superTrend: st };
        }
        ortaBandUygun = taraf === 'LONG' ? fiyat < sniperOrtaBand : fiyat > sniperOrtaBand;
        if (!ortaBandUygun) {
            return {
                uygun: false,
                hardReject: false,
                reason: 'ST1_SNIPER_ORTA_BAND_UYGUN_DEGIL',
                taraf,
                pusu,
                superTrend: st,
                sniperOrtaBand
            };
        }
    }

    const gecGiris = gecGirisKontrolu(taraf, fiyat, tetik);
    if (!gecGiris.uygun) {
        return {
            uygun: false,
            hardReject: ayarlar.gecGirisPusuyuIptalEt !== false,
            reason: gecGiris.reason,
            taraf,
            pusu,
            superTrend: st,
            gecGiris,
            sniperOrtaBand,
            ortaBandUygun
        };
    }

    const st1KendiTetigiKirildi = pusu.targetLevel > 0
        ? (taraf === 'LONG' ? fiyat >= pusu.targetLevel : fiyat <= pusu.targetLevel)
        : false;
    if (!st1KendiTetigiKirildi) {
        return {
            uygun: false,
            hardReject: false,
            reason: 'ST1_KENDI_TETIGI_BEKLENIYOR',
            taraf,
            pusu,
            superTrend: st,
            superTrendYonu: st.trend,
            trendPeriyodu: st.periyot,
            stKaynak: st.kaynak,
            gecGiris,
            sniperOrtaBand,
            ortaBandUygun,
            st1KendiTetigiKirildi,
            renkoTetikFiyati: tetik,
            canliFiyat: fiyat,
            evaluatedAt: new Date(now).toISOString()
        };
    }

    return {
        uygun: true,
        hardReject: false,
        reason: 'ST1_15M_PUSU_TETIK_VE_3M_ST_UYGUN',
        taraf,
        pusu,
        superTrend: st,
        superTrendYonu: st.trend,
        trendPeriyodu: st.periyot,
        stKaynak: st.kaynak,
        gecGiris,
        sniperOrtaBand,
        ortaBandUygun,
        st1KendiTetigiKirildi,
        renkoTetikFiyati: tetik,
        canliFiyat: fiyat,
        evaluatedAt: new Date(now).toISOString()
    };
}

module.exports = {
    VERSION,
    periyotMs,
    superTrendOnayPeriyodu,
    pusuKurulumu,
    aktifSuperTrend,
    gecGirisKontrolu,
    degerlendir
};
