const h = require('./1_hafiza.js');
const m = require('./motor.js');
const ayarlar = require('./ayarlar.js');
const labLifecycle = require('./68_lab_lifecycle_evolution.js');
const renkoEntryEvolution = require('./73_st2_renko_entry_evolution.js');
const williamsCycleShadow = require('./88_st2_williams_cycle_shadow_lab.js');
const renkoEntryConfirmationShadow = require('./89_st2_renko_entry_confirmation_shadow_lab.js');
const renko15mConfirmedEvidence = require('./94_st2_15m_confirmed_evidence.js');
const renkoExitEvolution = require('./74_st2_renko_exit_evolution.js');
const rapor = require('./2_rapor.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');
const exitOptimizer = require('./15_exit_optimizer_foundation.js');
const exitReplay = require('./22_exit_replay_engine.js');
const restartGap = require('./23_restart_gap_protection.js');
const pusuKaliteMotoru = require('./6_pusu_kalite_motoru.js');
const analizMerkezi = require('./7_analiz_merkezi.js');
const blackbox = require('./8_blackbox.js');
const premierObservation = require('./48_premier_observation_engine.js');
const labChampion = require('./61_lab_champion_engine.js');
const labPremier = require('./62_lab_premier_league.js');
const sanalDynamicExit = require('./51_sanal_dynamic_exit_executor.js');
const exitMethodScoreboard = require('./52_exit_method_scoreboard.js');
const hierarchyIdentity = require('./60_hierarchical_dna_identity_registry.js');
const accountingContinuity = require('./65_accounting_continuity.js');
const operationTransparency = require('./82_st2_operation_transparency.js');
const realExecution = require('./85_st2_real_order_execution.js');
const closeLifecycle = require('./86_st2_close_lifecycle.js');
const postClosePricePath = require('./95_st2_post_close_price_path.js');
const liveCohortEconomy = require('./96_st2_live_cohort_economy.js');

let pusuRaporu = [];
let sonRaporZamani = 0;
let pusuRaporuBaslangicGonderildi = false;
const RAPOR_ARALIGI = 300000;

// Aynı pozisyonun aynı kapanışını ikinci kez işlemeyi engeller.
// Telegram gönderimi veya BlackBox tarafında hata olsa bile kapanan pozisyon tekrar sayılmamalı.
const kapananPozisyonAnahtarlari = new Set();

function kapanisRaporKimligi(pos, restartGapIslemi) {
    const rawKey = pos?.realOrderReadiness?.key
        || pos?.dnaLeagueProfile?.key
        || pos?.premierObservation?.key
        || pos?.blackboxAcilis?.strategySignature?.key
        || '';

    try {
        const familyMissing = !pos?.dnaLabel || pos.dnaLabel === 'DNA #YOK';
        const labMissing = !pos?.labDnaLabel || pos.labDnaLabel === 'LAB #YOK';
        const fullMissing = !pos?.fullDnaLabel || pos.fullDnaLabel === 'FULL #YOK';
        if (rawKey && (familyMissing || labMissing || fullMissing)) {
            hierarchyIdentity.decoratePosition(pos, { source: 'CLOSE_REPORT_IDENTITY_RECOVERY' });
        }
    } catch (err) {
        console.log(`⚠️ [KAPANIŞ KİMLİK GERİ KAZANIMI] ${pos?.sym || 'YOK'} ${pos?.yon || 'YOK'} | ${err.message}`);
    }

    const frozen = pos?.labPremierDecision || null;
    const upper = frozen?.upperLayerIncluded === true || pos?.labPremierObservation?.upperLayerIncluded === true;
    const shadow = pos?.leagueShadowOnly === true || frozen?.virtualShadowOnly === true;
    let title;
    let league;
    let proof;
    let track;

    if (restartGapIslemi) {
        title = '[RESTART GAP SANAL POZİSYON KAPANDI]';
        league = frozen?.labLeague || pos?.labLeagueAtOpen || 'ESKİ_KAYIT';
        proof = frozen?.proofLevel || pos?.labProofLevelAtOpen || 'MUHASEBE_ONLY';
        track = 'ÖĞRENME HARİÇ';
    } else if (pos?.sanal === false) {
        title = '[GERÇEK POZİSYON KAPANDI]';
        league = frozen?.labLeague || pos?.labLeagueAtOpen || 'GERÇEK';
        proof = frozen?.proofLevel || pos?.labProofLevelAtOpen || 'REAL';
        track = 'GERÇEK';
    } else if (pos?.renkoPremierDecision?.premier === true) {
        title = '[EXACT-CONTEXT PREMIER SANAL POZİSYON KAPANDI]';
        league = frozen?.labLeague || pos?.labLeagueAtOpen || 'PREMIER';
        proof = frozen?.proofLevel || pos?.labProofLevelAtOpen || 'PREMIER';
        track = 'ÜST KASA';
    } else if (pos?.renkoPremierDecision && pos?.renkoPremierDecision?.premier !== true) {
        title = '[EXACT-CONTEXT SHADOW ÖĞRENME KAPANDI]';
        league = frozen?.labLeague || pos?.labLeagueAtOpen || 'DEVELOPMENT';
        proof = frozen?.proofLevel || pos?.labProofLevelAtOpen || 'LEARNING';
        track = 'GÖLGE';
    } else {
        title = '[ESKİ SANAL POZİSYON KAPANDI]';
        league = frozen?.labLeague || pos?.labLeagueAtOpen || 'ESKİ_KAYIT';
        proof = frozen?.proofLevel || pos?.labProofLevelAtOpen || 'KİMLİK_DONDURULMAMIŞ';
        track = 'ESKİ KAYIT';
    }

    return {
        title,
        league,
        proof,
        track,
        dnaLabel: (pos?.dnaLabel && pos.dnaLabel !== 'DNA #YOK') ? pos.dnaLabel : 'DNA: ESKİ KAYIT / ANAHTAR YOK',
        labDnaLabel: (pos?.labDnaLabel && pos.labDnaLabel !== 'LAB #YOK') ? pos.labDnaLabel : 'LAB: ESKİ KAYIT',
        fullDnaLabel: (pos?.fullDnaLabel && pos.fullDnaLabel !== 'FULL #YOK') ? pos.fullDnaLabel : 'FULL: ESKİ KAYIT',
        rawKey: rawKey || 'ESKİ KAYIT / ANAHTAR YOK'
    };
}

function pozisyonKapanisAnahtari(pos) {
    return String(pos?.id || pos?.orderId || `${pos?.sym || 'YOK'}-${pos?.yon || 'YOK'}-${pos?.acilisZamani || pos?.zaman || '0'}-${pos?.girisFiyati || '0'}`);
}

function dinamikBasamak(sym, deger, tip = 'fiyat') {
    const kural = h.state.basamaklar[sym];
    if (!kural) return Number(deger).toFixed(4);
    const hassasiyet = tip === 'fiyat' ? kural.pricePrecision : kural.quantityPrecision;
    return Number(deger).toFixed(hassasiyet);
}


function superTrendOnayPeriyodu() {
    return ayarlar.superTrendPeriyodu || ayarlar.trendPeriyodu || ayarlar.sniperPeriyodu || '5m';
}

function durumLogla(sym, mesaj, zorla = false) {
    const now = Date.now();
    const eski = h.state.sonDurumLoglari[sym] || { zaman: 0, mesaj: '' };
    const aralik = ayarlar.durumLogAraligiMs || 5000;
    if (zorla || eski.mesaj !== mesaj || now - eski.zaman >= aralik) {
        console.log(mesaj);
        h.state.sonDurumLoglari[sym] = { zaman: now, mesaj };
    }
}

function kaliteIsareti(uygun) {
    return uygun ? '✅' : '❌';
}

function pusuKaliteMetni(pusu) {
    const bandGen = Number(pusu.bandGenisligiYuzde || 0);
    const govde = Number(pusu.govdeYuzde || 0);
    const orta = Number(pusu.ortaBand || 0);
    const hedef = Number(pusu.targetLevel || 0);
    const minBand = ayarlar.minimumBandGenisligiYuzde || 0;
    const minGovde = ayarlar.minimumPusuMumGovdesiYuzde || 0;
    const bandUygun = minBand <= 0 || bandGen >= minBand;
    const govdeUygun = minGovde <= 0 || govde >= minGovde;
    const ortaUygun = !ayarlar.pusuOrtaBandFiltresi || !orta || (pusu.yon === 'LONG' ? hedef < orta : hedef > orta);

    const kalite = pusu.pusuKalite ? ` | Kalite ${pusu.pusuKalite.puan}/100 ${pusu.pusuKalite.sinif}` : '';
    return `PusuKalite: BandGenişliği %${bandGen.toFixed(2)} ${kaliteIsareti(bandUygun)} | Gövde %${govde.toFixed(2)} ${kaliteIsareti(govdeUygun)} | ${ayarlar.pusuPeriyodu} OrtaBand ${orta ? dinamikBasamak(pusu.sym || '', orta) : 'YOK'} ${kaliteIsareti(ortaUygun)}${kalite}`;
}



function sniperMumKopyala(sym) {
    const canli = h.state.sniperCanliMumlar?.[sym];
    const kapali = h.state.sniperMumlar?.[sym];
    const sonKapali = kapali && kapali.length ? kapali[kapali.length - 1] : null;
    const mum = canli || sonKapali;
    if (!mum) return null;
    return {
        kaynak: canli ? 'CANLI' : 'KAPANMIS',
        openTime: mum.openTime || null,
        closeTime: mum.closeTime || null,
        open: Number(mum.open),
        high: Number(mum.high),
        low: Number(mum.low),
        close: Number(mum.close),
        gecici: !!mum.gecici
    };
}

function sniperMumKarsilastirma(mum, tetikFiyati) {
    const tetik = Number(tetikFiyati);
    if (!mum || !Number.isFinite(tetik)) {
        return {
            longHighTetik: false,
            longCloseTetik: false,
            shortLowTetik: false,
            shortCloseTetik: false
        };
    }
    return {
        longHighTetik: Number(mum.high) >= tetik,
        longCloseTetik: Number(mum.close) >= tetik,
        shortLowTetik: Number(mum.low) <= tetik,
        shortCloseTetik: Number(mum.close) <= tetik
    };
}

function evetHayir(deger) {
    return deger ? '✅ EVET' : '❌ HAYIR';
}

function mumRengi(mum) {
    if (!mum) return 'YOK';
    if (Number(mum.close) > Number(mum.open)) return 'YESIL';
    if (Number(mum.close) < Number(mum.open)) return 'KIRMIZI';
    return 'NÖTR';
}


function sinirla(n, min = 0, max = 100) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
}

function pusuKaliteHesapla(mum, yon, senaryo = '') {
    if (!mum) {
        return { puan: 0, sinif: 'YOK', metin: 'YOK', detay: 'Pusu mumu yok' };
    }

    const open = Number(mum.open);
    const high = Number(mum.high);
    const low = Number(mum.low);
    const close = Number(mum.close);
    const range = high - low;

    if (!Number.isFinite(range) || range <= 0) {
        return { puan: 0, sinif: 'D', metin: '0/100 D', detay: 'Mum aralığı yok' };
    }

    const govde = Math.abs(open - close);
    const ustFitil = high - Math.max(open, close);
    const altFitil = Math.min(open, close) - low;

    const govdePct = sinirla((govde / range) * 100);
    const ustFitilPct = sinirla((ustFitil / range) * 100);
    const altFitilPct = sinirla((altFitil / range) * 100);
    const kapanisKonumu = sinirla(((close - low) / range) * 100); // 100 = aralığın tepesinde kapanış
    const acilisKonumu = sinirla(((open - low) / range) * 100);

    let puan = 0;
    const arti = [];
    const eksi = [];

    if (yon === 'LONG') {
        // LONG dönüşünde aradığımız şey: alt fitilde tepki ve kapanışın dipten uzaklaşması.
        puan += altFitilPct * 0.42;
        puan += kapanisKonumu * 0.42;
        puan += Math.min(ustFitilPct, 20) * 0.20; // küçük üst fitil, alıcının yukarı denediğini gösterir; aşırısı kovalama sayılmaz.
        puan -= Math.max(govdePct - 55, 0) * 0.35;

        if (altFitilPct >= 45) arti.push('alt fitil güçlü'); else eksi.push('alt fitil zayıf');
        if (kapanisKonumu >= 55) arti.push('kapanış dipten uzak'); else eksi.push('kapanış dibe yakın');
        if (govdePct <= 55) arti.push('gövde kontrollü'); else eksi.push('gövde baskın');
        if (ustFitilPct > 0) arti.push('üst fitil var'); else eksi.push('üst fitil yok');
    } else {
        // SHORT dönüşünde ayna mantık: üst fitilde tepki ve kapanışın tepeden uzaklaşması.
        const shortKapanisGucu = sinirla(((high - close) / range) * 100); // 100 = aralığın dibinde kapanış
        puan += ustFitilPct * 0.42;
        puan += shortKapanisGucu * 0.42;
        puan += Math.min(altFitilPct, 20) * 0.20;
        puan -= Math.max(govdePct - 55, 0) * 0.35;

        if (ustFitilPct >= 45) arti.push('üst fitil güçlü'); else eksi.push('üst fitil zayıf');
        if (shortKapanisGucu >= 55) arti.push('kapanış tepeden uzak'); else eksi.push('kapanış tepeye yakın');
        if (govdePct <= 55) arti.push('gövde kontrollü'); else eksi.push('gövde baskın');
        if (altFitilPct > 0) arti.push('alt fitil var'); else eksi.push('alt fitil yok');
    }

    puan = Math.round(sinirla(puan));
    const sinif = puan >= 75 ? 'A' : (puan >= 55 ? 'B' : (puan >= 35 ? 'C' : 'D'));

    return {
        puan,
        sinif,
        metin: `${puan}/100 ${sinif}`,
        govdePct,
        ustFitilPct,
        altFitilPct,
        kapanisKonumu,
        acilisKonumu,
        arti,
        eksi,
        senaryo,
        detay: `ÜstFitil %${ustFitilPct.toFixed(1)} | AltFitil %${altFitilPct.toFixed(1)} | Gövde %${govdePct.toFixed(1)} | KapanışGücü %${kapanisKonumu.toFixed(1)}`
    };
}

function pusuKaliteDebugMesaji(kalite) {
    if (!kalite) return '';
    return `\n🧪 Pusu Kalitesi\n` +
        `🏅 Puan: ${kalite.puan}/100 | Sınıf: ${kalite.sinif}\n` +
        `🕯️ Üst Fitil: %${Number(kalite.ustFitilPct || 0).toFixed(1)} | Alt Fitil: %${Number(kalite.altFitilPct || 0).toFixed(1)} | Gövde: %${Number(kalite.govdePct || 0).toFixed(1)}\n` +
        `📍 Kapanış Gücü: %${Number(kalite.kapanisGucu ?? kalite.kapanisKonumu ?? 0).toFixed(1)} | Band Temas: %${Number(kalite.bandTemasKalitesi || 0).toFixed(1)} | Orta Uzaklık: %${Number(kalite.ortaBandUzaklikYuzde || 0).toFixed(2)}\n` +
        `✅ Artılar: ${(kalite.arti || []).join(', ') || 'YOK'}\n` +
        `⚠️ Eksiler: ${(kalite.eksi || []).join(', ') || 'YOK'}`;
}

function pusuMumKopyala(mum, kaynak = 'KAPANMIS') {
    if (!mum) return null;
    return {
        kaynak,
        openTime: Number(mum.openTime || 0),
        closeTime: Number(mum.closeTime || 0),
        open: Number(mum.open),
        high: Number(mum.high),
        low: Number(mum.low),
        close: Number(mum.close),
        renk: mumRengi(mum),
        kapandiMi: Number(mum.closeTime || 0) <= Date.now()
    };
}

function pusuDebugMesaji(sym, pusu) {
    if (!ayarlar.debugPusuMum) return '';
    const mum = pusu?.pusuMumu || null;
    const onceki = pusu?.oncekiPusuMumu || null;
    if (!mum) return `🧪 Pusu Mum Teşhisi (${ayarlar.pusuPeriyodu}): YOK`;

    const fmt = (v) => dinamikBasamak(sym, Number(v || 0));
    const zaman = (ts) => ts ? new Date(Number(ts)).toLocaleString('tr-TR') : 'YOK';
    const kapanisDurumu = mum.kapandiMi ? '✅ KAPANMIŞ' : '❌ CANLI / ÇALIŞAN';
    const indexBilgi = pusu?.pusuMumIndex || 'SON KAPANMIŞ';

    let metin = `🧪 Pusu Mum Teşhisi (${ayarlar.pusuPeriyodu})\n` +
        `📌 Kaynak: ${mum.kaynak || 'YOK'} | Durum: ${kapanisDurumu} | Index: ${indexBilgi}\n` +
        `🕒 Açılış: ${zaman(mum.openTime)}\n` +
        `🕒 Kapanış: ${zaman(mum.closeTime)}\n` +
        `O: ${fmt(mum.open)} | H: ${fmt(mum.high)} | L: ${fmt(mum.low)} | C: ${fmt(mum.close)}\n` +
        `🕯️ Pusu Mumu Rengi: ${mum.renk}\n` +
        `🎯 Pusu Hedefi: ${fmt(pusu.targetLevel)} | Senaryo: ${pusu.senaryo || 'YOK'}\n`;

    if (onceki) {
        metin += `↩️ Önceki ${ayarlar.pusuPeriyodu} Mum: ${onceki.renk} | O:${fmt(onceki.open)} H:${fmt(onceki.high)} L:${fmt(onceki.low)} C:${fmt(onceki.close)} | Kapanış: ${zaman(onceki.closeTime)}`;
    }

    if (pusu?.pusuKalite) {
        metin += pusuKaliteDebugMesaji(pusu.pusuKalite);
    }

    return metin;
}


function emirSnapshotOlustur(sym, yon, hedef, tetikFiyati, canliFiyat, aktifTrend, pusu, emirMumu = null) {
    const fiyat = Number(canliFiyat);
    const tetik = Number(tetikFiyati);
    const hedefF = Number(hedef);
    const maxSapma = Number(ayarlar.maxGirisSapmaYuzde || 0);
    const minShortFiyat = tetik * (1 - maxSapma / 100);
    const maxLongFiyat = tetik * (1 + maxSapma / 100);
    const kirilim = yon === 'LONG' ? fiyat >= tetik : fiyat <= tetik;
    const gecGirisUygun = maxSapma <= 0 ? true : (yon === 'LONG' ? fiyat <= maxLongFiyat : fiyat >= minShortFiyat);
    const tetikSapmaYuzde = yon === 'LONG'
        ? ((fiyat - tetik) / tetik) * 100
        : ((tetik - fiyat) / tetik) * 100;

    return {
        id: `SNAP-${Date.now()}-${sym}`,
        zaman: Date.now(),
        symbol: sym,
        yon,
        hedefRaw: hedefF,
        tetikRaw: tetik,
        canliFiyatRaw: fiyat,
        farkRaw: fiyat - tetik,
        tetikSapmaYuzde: Number(tetikSapmaYuzde.toFixed(8)),
        compareOperator: yon === 'LONG' ? '>=' : '<=',
        // Telegram HTML parse hatası olmaması için mesaj metninde < karakteri kullanmıyoruz.
        // SHORT açılış mesajlarının gitmemesinin ana nedeni: 'canliFiyat <= tetik' metnindeki < karakterinin
        // Telegram parse_mode=HTML tarafından etiket başlangıcı sanılmasıydı.
        compareText: `canliFiyat ${yon === 'LONG' ? '≥' : '≤'} tetik`,
        compareResult: kirilim,
        maxGirisSapmaYuzde: maxSapma,
        gecGirisUygun,
        minShortFiyatRaw: Number(minShortFiyat.toFixed(12)),
        maxLongFiyatRaw: Number(maxLongFiyat.toFixed(12)),
        stTrend: aktifTrend?.trend || null,
        stKaynak: aktifTrend?.kaynak || null,
        pusuSayaci: pusu?.gecenMumSayisi || 0,
        pusuOlusanMumZamani: pusu?.olusanMumZamani || null,
        sniperMum: emirMumu || null
    };
}

function emirSnapshotDebugMesaji(sym, snapshot) {
    if (!snapshot || ayarlar.emirSnapshotAktif === false) return '';
    const p = h.state.basamaklar[sym]?.pricePrecision ?? 8;
    const fmtRaw = (v) => Number(v || 0).toFixed(Math.min(Math.max(p + 4, 8), 12));
    const sinirMetni = snapshot.yon === 'LONG'
        ? `LONG gec giris siniri: ${fmtRaw(snapshot.maxLongFiyatRaw)} ustu YASAK`
        : `SHORT gec giris siniri: ${fmtRaw(snapshot.minShortFiyatRaw)} alti YASAK`;

    return `\n🧊 Emir Anı Snapshot\n` +
        `🆔 ${snapshot.id}\n` +
        `RAW Canlı: ${fmtRaw(snapshot.canliFiyatRaw)}\n` +
        `RAW Tetik: ${fmtRaw(snapshot.tetikRaw)}\n` +
        `RAW Fark: ${fmtRaw(snapshot.farkRaw)}\n` +
        `Compare: ${snapshot.compareText} = ${snapshot.compareResult ? 'TRUE ✅' : 'FALSE ❌'}\n` +
        `Geç Giriş: ${snapshot.gecGirisUygun ? 'UYGUN ✅' : 'GEÇ KALMIŞ ❌'} | Max Sapma: %${Number(snapshot.maxGirisSapmaYuzde || 0).toFixed(2)}\n` +
        `Sınır: ${sinirMetni}`;
}

function sniperDebugMesaji(sym, yon, tetikFiyati, canliFiyat, kirilimMumu, emirMumu, snapshot = null) {
    if (!ayarlar.debugSniperMum) return '';
    const aktifMum = emirMumu || kirilimMumu;
    if (!aktifMum) return '🧪 Sniper Mum: YOK';

    const kirilimK = sniperMumKarsilastirma(kirilimMumu, tetikFiyati);
    const emirK = sniperMumKarsilastirma(emirMumu, tetikFiyati);
    const fiyatKirildi = yon === 'LONG'
        ? Number(canliFiyat) >= Number(tetikFiyati)
        : Number(canliFiyat) <= Number(tetikFiyati);

    const zaman = aktifMum.closeTime ? new Date(aktifMum.closeTime).toLocaleString('tr-TR') : 'YOK';
    const fmt = (v) => dinamikBasamak(sym, Number(v || 0));

    const emirYonMetni = yon === 'LONG'
        ? `📌 Emir Anı LONG High≥Tetik: ${evetHayir(emirK.longHighTetik)} | LONG CanlıClose≥Tetik: ${evetHayir(emirK.longCloseTetik)}`
        : `📌 Emir Anı SHORT Low≤Tetik: ${evetHayir(emirK.shortLowTetik)} | SHORT CanlıClose≤Tetik: ${evetHayir(emirK.shortCloseTetik)}`;
    const kirilimYonMetni = yon === 'LONG'
        ? `📍 İlk Kırılım Mumu LONG High≥Tetik: ${evetHayir(kirilimK.longHighTetik)} | LONG CanlıClose≥Tetik: ${evetHayir(kirilimK.longCloseTetik)}`
        : `📍 İlk Kırılım Mumu SHORT Low≤Tetik: ${evetHayir(kirilimK.shortLowTetik)} | SHORT CanlıClose≤Tetik: ${evetHayir(kirilimK.shortCloseTetik)}`;

    return `\n🧪 Sniper Mum Teşhisi\n` +
        `🕒 Mum: ${zaman} | Kaynak: ${aktifMum.kaynak || 'YOK'}${aktifMum.gecici ? ' / CANLI ÇALIŞAN MUM' : ''}\n` +
        `O: ${fmt(aktifMum.open)} | H: ${fmt(aktifMum.high)} | L: ${fmt(aktifMum.low)} | C: ${fmt(aktifMum.close)}\n` +
        `🎯 Tetik: ${fmt(tetikFiyati)} | Anlık/Giriş Fiyatı: ${fmt(canliFiyat)}\n` +
        `⚡ Kırılım Kaynağı: CANLI_FIYAT ${yon === 'LONG' ? '≥' : '≤'} TETIK = ${evetHayir(fiyatKirildi)}\n` +
        emirYonMetni + `\n` + kirilimYonMetni + emirSnapshotDebugMesaji(sym, snapshot);
}

function periyotMs(periyot) {
    const yazi = String(periyot || '5m').trim();
    const sayi = parseInt(yazi, 10);
    if (!Number.isFinite(sayi) || sayi <= 0) return 300000;
    if (yazi.endsWith('m')) return sayi * 60 * 1000;
    if (yazi.endsWith('h')) return sayi * 60 * 60 * 1000;
    if (yazi.endsWith('d')) return sayi * 24 * 60 * 60 * 1000;
    return sayi * 60 * 1000;
}

function pusuSayaclariniGuncelle() {
    const anaPeriyotMs = periyotMs(ayarlar.pusuPeriyodu || '5m');
    const maxBekleme = ayarlar.maxPusuBeklemeMum ?? 3;

    for (const [sym, pusu] of Object.entries(h.state.pusuListesi)) {
        const mumlar = h.state.yerelPusuHafizasi[sym];
        if (!mumlar || mumlar.length === 0) continue;

        const sonMum = mumlar[mumlar.length - 1];
        if (!sonMum.closeTime || !pusu.olusanMumZamani) continue;

        const gecenMumSayisi = Math.max(0, Math.floor((sonMum.closeTime - pusu.olusanMumZamani) / anaPeriyotMs));

        if (gecenMumSayisi !== (pusu.gecenMumSayisi || 0)) {
            pusu.gecenMumSayisi = gecenMumSayisi;
            pusu.sonSayacMumZamani = sonMum.closeTime;
            console.log(`⏱️ [PUSU SAYACI] ${sym} ${pusu.yon} | ${pusu.gecenMumSayisi}/${maxBekleme} kapanmış ${ayarlar.pusuPeriyodu} mum geçti.`);
        }

        if (gecenMumSayisi >= maxBekleme) {
            console.log(`⏰ [PUSU İPTAL] ${sym} ${pusu.yon} | ${maxBekleme} kapanmış ${ayarlar.pusuPeriyodu} mum geçti, hedef zamanında kırılmadı.`);
            delete h.state.pusuListesi[sym];
        }
    }
}

async function piyasayiTaraVePusuKur() {
    pusuSayaclariniGuncelle();

    const now = Date.now();
    for (const sym of h.state.semboller) {
        if (h.state.pusuListesi[sym]) continue;
        if (h.state.alinanlar.includes(sym) || h.state.aktifShortlar.includes(sym)) continue;

        const pusuMumlari = h.state.yerelPusuHafizasi[sym];
        if (!pusuMumlari || pusuMumlari.length < ayarlar.bollingerperiod) continue;

        const sonMum = pusuMumlari[pusuMumlari.length - 1];
        const oncekiMum = pusuMumlari[pusuMumlari.length - 2];

        if (!sonMum || !sonMum.closeTime) continue;
        // Kritik güvenlik: Pusu sadece KAPANMIŞ pusu periyodu mumundan kurulur.
        // Binance'in döndürdüğü son mum canlı/çalışan ise burada kesinlikle pusu kurulmaz.
        if (Number(sonMum.closeTime) > Date.now()) {
            durumLogla(`pusuCanli_${sym}`, `⏳ [PUSU BEKLEME] ${sym} | ${ayarlar.pusuPeriyodu} son mum henüz kapanmadı. Pusu kurulmadı. Mum kapanışı: ${new Date(Number(sonMum.closeTime)).toLocaleString('tr-TR')}`);
            continue;
        }

        const sonPusuAnahtari = `${sonMum.closeTime}`;
        const kontrolAnahtari = `${sym}_${sonPusuAnahtari}`;
        if (h.state.sonDurumLoglari[`pusuKontrol_${kontrolAnahtari}`]) continue;

        const fiyatlar = pusuMumlari.map(x => x.close);
        const bollinger = m.hesaplaBollinger(fiyatlar);

        const longSenaryo = m.pusuSenaryosuTespit(sonMum, oncekiMum, bollinger, 'LONG');
        if (!longSenaryo.senaryo && longSenaryo.aday && longSenaryo.redSebep) {
            console.log(`🚫 [PUSU RED] ${sym} LONG | ${longSenaryo.redSebep} | Band genişliği: %${Number(longSenaryo.bandGenisligiYuzde || 0).toFixed(2)} | Gövde: %${Number(longSenaryo.govdeYuzde || 0).toFixed(2)} | Mum: ${new Date(sonMum.closeTime).toLocaleString()}`);
        }

        if (longSenaryo.senaryo) {
            const longPusuKalite = pusuKaliteMotoru.hesapla(sonMum, 'LONG', longSenaryo);
            h.state.pusuListesi[sym] = {
                sym,
                yon: 'LONG',
                targetLevel: longSenaryo.targetLevel,
                gecenMumSayisi: 0,
                sonSayacMumZamani: sonMum.closeTime,
                olusanMumZamani: sonMum.closeTime,
                senaryo: longSenaryo.senaryo,
                bandLevel: longSenaryo.bandLevel,
                bandFarkYuzde: longSenaryo.bandFarkYuzde,
                altBand: longSenaryo.altBand,
                ortaBand: longSenaryo.ortaBand,
                ustBand: longSenaryo.ustBand,
                bandGenisligiYuzde: longSenaryo.bandGenisligiYuzde,
                govdeYuzde: longSenaryo.govdeYuzde,
                olusumZamani: now,
                kirilimGordu: false,
                kirilimZamani: 0,
                kirilimFiyati: 0,
                trendOnayiGordu: false,
                trendOnayiZamani: 0,
                pusuMumu: pusuMumKopyala(sonMum, 'KAPANMIS'),
                oncekiPusuMumu: pusuMumKopyala(oncekiMum, 'KAPANMIS'),
                pusuMumIndex: 'son kapanmış (-1 / hafıza sadece kapanmış mum içerir)',
                pusuKalite: longPusuKalite
            };
            pusuRaporu.push({ sym, yon: 'LONG', senaryo: longSenaryo.senaryo, bandFarkYuzde: longSenaryo.bandFarkYuzde, kalite: longPusuKalite });
            console.log(`🔔 [YENİ PUSU] ${sym} LONG | Hedef: ${dinamikBasamak(sym, longSenaryo.targetLevel)} | AltBand: ${dinamikBasamak(sym, longSenaryo.bandLevel)} | OrtaBand: ${dinamikBasamak(sym, longSenaryo.ortaBand)} | Band farkı: %${Number(longSenaryo.bandFarkYuzde || 0).toFixed(2)} | Band genişliği: %${Number(longSenaryo.bandGenisligiYuzde || 0).toFixed(2)} | Gövde: %${Number(longSenaryo.govdeYuzde || 0).toFixed(2)} | Kalite: ${longPusuKalite.puan}/100 ${longPusuKalite.sinif} | Mum: ${new Date(sonMum.closeTime).toLocaleString()}`);
        }

        const shortSenaryo = m.pusuSenaryosuTespit(sonMum, oncekiMum, bollinger, 'SHORT');
        if (!shortSenaryo.senaryo && shortSenaryo.aday && shortSenaryo.redSebep) {
            console.log(`🚫 [PUSU RED] ${sym} SHORT | ${shortSenaryo.redSebep} | Band genişliği: %${Number(shortSenaryo.bandGenisligiYuzde || 0).toFixed(2)} | Gövde: %${Number(shortSenaryo.govdeYuzde || 0).toFixed(2)} | Mum: ${new Date(sonMum.closeTime).toLocaleString()}`);
        }

        if (shortSenaryo.senaryo && !h.state.pusuListesi[sym]) {
            const shortPusuKalite = pusuKaliteMotoru.hesapla(sonMum, 'SHORT', shortSenaryo);
            h.state.pusuListesi[sym] = {
                sym,
                yon: 'SHORT',
                targetLevel: shortSenaryo.targetLevel,
                gecenMumSayisi: 0,
                sonSayacMumZamani: sonMum.closeTime,
                olusanMumZamani: sonMum.closeTime,
                senaryo: shortSenaryo.senaryo,
                bandLevel: shortSenaryo.bandLevel,
                bandFarkYuzde: shortSenaryo.bandFarkYuzde,
                altBand: shortSenaryo.altBand,
                ortaBand: shortSenaryo.ortaBand,
                ustBand: shortSenaryo.ustBand,
                bandGenisligiYuzde: shortSenaryo.bandGenisligiYuzde,
                govdeYuzde: shortSenaryo.govdeYuzde,
                olusumZamani: now,
                kirilimGordu: false,
                kirilimZamani: 0,
                kirilimFiyati: 0,
                trendOnayiGordu: false,
                trendOnayiZamani: 0,
                pusuMumu: pusuMumKopyala(sonMum, 'KAPANMIS'),
                oncekiPusuMumu: pusuMumKopyala(oncekiMum, 'KAPANMIS'),
                pusuMumIndex: 'son kapanmış (-1 / hafıza sadece kapanmış mum içerir)',
                pusuKalite: shortPusuKalite
            };
            pusuRaporu.push({ sym, yon: 'SHORT', senaryo: shortSenaryo.senaryo, bandFarkYuzde: shortSenaryo.bandFarkYuzde, kalite: shortPusuKalite });
            console.log(`🔔 [YENİ PUSU] ${sym} SHORT | Hedef: ${dinamikBasamak(sym, shortSenaryo.targetLevel)} | ÜstBand: ${dinamikBasamak(sym, shortSenaryo.bandLevel)} | OrtaBand: ${dinamikBasamak(sym, shortSenaryo.ortaBand)} | Band farkı: %${Number(shortSenaryo.bandFarkYuzde || 0).toFixed(2)} | Band genişliği: %${Number(shortSenaryo.bandGenisligiYuzde || 0).toFixed(2)} | Gövde: %${Number(shortSenaryo.govdeYuzde || 0).toFixed(2)} | Kalite: ${shortPusuKalite.puan}/100 ${shortPusuKalite.sinif} | Mum: ${new Date(sonMum.closeTime).toLocaleString()}`);
        }

        h.state.sonDurumLoglari[`pusuKontrol_${kontrolAnahtari}`] = { zaman: now, mesaj: 'kontrol edildi' };
    }
}


function aktifSniperSuperTrend(sym, canliFiyat) {
    const stPeriyodu = superTrendOnayPeriyodu();
    const kapaliMumlar = h.state.trendMumlar?.[sym] || h.state.sniperMumlar?.[sym];
    const fiyat = Number(canliFiyat);

    if (!ayarlar.canliSniperTetikAktif || !kapaliMumlar || kapaliMumlar.length < (ayarlar.superTrendPeriod || 10) + 2 || !fiyat) {
        return {
            trend: h.state.trendSuperTrend?.[sym] || h.state.sniperSuperTrend[sym],
            value: 0,
            kaynak: 'KAPANMIS'
        };
    }

    const periyot = periyotMs(stPeriyodu);
    const sonKapali = kapaliMumlar[kapaliMumlar.length - 1];
    if (!sonKapali || !sonKapali.closeTime) {
        return {
            trend: h.state.trendSuperTrend?.[sym] || h.state.sniperSuperTrend[sym],
            value: 0,
            kaynak: 'KAPANMIS'
        };
    }

    const now = Date.now();
    const canliOpenTime = sonKapali.closeTime + 1;
    const canliCloseTime = canliOpenTime + periyot - 1;

    let canliMum = h.state.trendCanliMumlar?.[sym];
    if (!h.state.trendCanliMumlar) h.state.trendCanliMumlar = {};
    if (!h.state.trendSuperTrendCanli) h.state.trendSuperTrendCanli = {};

    if (!canliMum || canliMum.openTime !== canliOpenTime || now > canliCloseTime + periyot) {
        const acilis = Number(sonKapali.close);
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
        canliMum.high = Math.max(Number(canliMum.high), fiyat);
        canliMum.low = Math.min(Number(canliMum.low), fiyat);
        canliMum.close = fiyat;
    }

    h.state.trendCanliMumlar[sym] = canliMum;

    const mumlar = kapaliMumlar.concat([canliMum]);
    const st = m.hesaplaSuperTrend(mumlar);
    if (st && st.trend) {
        h.state.trendSuperTrendCanli[sym] = st.trend;
        return {
            trend: st.trend,
            value: Number(st.value || 0),
            kaynak: 'CANLI'
        };
    }

    return {
        trend: h.state.trendSuperTrend?.[sym] || h.state.sniperSuperTrend[sym],
        value: 0,
        kaynak: 'KAPANMIS'
    };
}

function superTrendEtkiAnalizi(sym, yon, canliFiyat, aktifTrend = {}) {
    if (ayarlar.superTrendEtkiAnaliziAktif === false) return null;

    const beklenenTrend = yon === 'LONG' ? 'UP' : 'DOWN';
    const trend = aktifTrend.trend || h.state.sniperSuperTrend?.[sym] || null;
    const uyumlu = trend === beklenenTrend;
    const kapaliMumlar = h.state.trendMumlar?.[sym] || h.state.sniperMumlar?.[sym] || [];

    let stValue = Number(aktifTrend.value || 0);
    if (!stValue && kapaliMumlar.length >= (ayarlar.superTrendPeriod || 10) + 2) {
        const sonSt = m.hesaplaSuperTrend(kapaliMumlar);
        stValue = Number(sonSt?.value || 0);
    }

    let yasMum = 0;
    const maxGeri = Math.min(20, kapaliMumlar.length);
    for (let i = kapaliMumlar.length - 1; i >= 0 && yasMum < maxGeri; i--) {
        const parca = kapaliMumlar.slice(0, i + 1);
        if (parca.length < (ayarlar.superTrendPeriod || 10) + 2) break;
        const st = m.hesaplaSuperTrend(parca);
        if (!st?.trend || st.trend !== trend) break;
        yasMum++;
    }

    const fiyat = Number(canliFiyat || 0);
    const mesafeYuzde = fiyat > 0 && stValue > 0 ? Math.abs((fiyat - stValue) / fiyat) * 100 : 0;
    const yeniDonus = yasMum > 0 && yasMum <= 1;
    const oturmus = yasMum >= 3;
    const durum = !trend ? 'YOK' : (yeniDonus ? 'YENI_DONUS' : (oturmus ? 'OTURMUS_TREND' : 'GECIS_BOLGESI'));

    let puan = 0;
    if (uyumlu) puan += 8;
    if (yasMum >= 3) puan += 5;
    else if (yasMum >= 1) puan += 3;
    if (mesafeYuzde > 0) {
        if (mesafeYuzde <= 0.8) puan += 4;
        else if (mesafeYuzde <= 1.8) puan += 3;
        else if (mesafeYuzde <= 3.0) puan += 1;
    }
    if (aktifTrend.kaynak === 'KAPANMIS') puan += 3;
    else if (aktifTrend.kaynak === 'CANLI') puan += 2;

    return {
        trend,
        beklenenTrend,
        uyumlu,
        yasMum,
        mesafeYuzde: Number(mesafeYuzde.toFixed(4)),
        kaynak: aktifTrend.kaynak || 'YOK',
        value: stValue ? Number(stValue.toFixed(8)) : 0,
        durum,
        puan: Math.max(0, Math.min(20, Math.round(puan)))
    };
}

function superTrendEtkiMetni(stEtki) {
    if (!stEtki) return '';
    return ` | ST Etki: ${stEtki.puan}/20 | Uyum: ${stEtki.uyumlu ? 'EVET' : 'HAYIR'} | Yaş: ${stEtki.yasMum} mum | Mesafe: %${Number(stEtki.mesafeYuzde || 0).toFixed(2)} | Durum: ${stEtki.durum}`;
}

async function pusulariDenetleVeIslemAc() {
    if (h.state.aktifPozisyonlar.length >= ayarlar.maxPozisyonSayisi) return;

    let buDongudeAcilanEmir = 0;
    const maxYeniEmirDongu = ayarlar.maxYeniEmirDonguBasina || 1;

    for (const [sym, pusu] of Object.entries(h.state.pusuListesi)) {
        if (buDongudeAcilanEmir >= maxYeniEmirDongu) {
            console.log(`🧯 [DÖNGÜ EMİR LİMİTİ] Bu döngüde ${buDongudeAcilanEmir}/${maxYeniEmirDongu} yeni emir açıldı. Kalan tetikler sonraki döngüye bırakıldı.`);
            break;
        }

        if (kaliciHafiza.acikPozisyonVarMi(sym)) {
            console.log(`🛡️ [PUSU TEMİZLENDİ] ${sym} için zaten aktif pozisyon var. Yeni emir engellendi.`);
            delete h.state.pusuListesi[sym];
            continue;
        }
        const canliFiyat = h.state.canliFiyatlar[sym];
        const aktifTrend = aktifSniperSuperTrend(sym, canliFiyat);
        const superTrendYonu = aktifTrend.trend;
        const hedef = Number(pusu.targetLevel);
        const tetikYuzdesiAyar = Number(ayarlar.tetikYuzdesi || 0);
        const tetikEsneklik = tetikYuzdesiAyar / 100;

        if (!canliFiyat) {
            durumLogla(sym, `⚠️ ${sym} için canlı fiyat yok, tetik bekliyor.`);
            continue;
        }

        if (!superTrendYonu) {
            durumLogla(sym, `⚠️ ${sym} için ${superTrendOnayPeriyodu()} SuperTrend/trend yönü yok, tetik bekliyor.`);
            continue;
        }

        const stEtki = superTrendEtkiAnalizi(sym, pusu.yon, canliFiyat, aktifTrend);

        let kirilim = false;
        let trendUygun = false;
        let gerekenFiyat;

        if (pusu.yon === 'LONG') {
            gerekenFiyat = hedef * (1 + tetikEsneklik);
            kirilim = canliFiyat >= gerekenFiyat;
            trendUygun = superTrendYonu === 'UP';
        } else {
            gerekenFiyat = hedef * (1 - tetikEsneklik);
            kirilim = canliFiyat <= gerekenFiyat;
            trendUygun = superTrendYonu === 'DOWN';
        }

        const now = Date.now();
        if (kirilim && !pusu.kirilimGordu) {
            pusu.kirilimGordu = true;
            pusu.kirilimZamani = now;
            pusu.kirilimFiyati = canliFiyat;
            pusu.kirilimSniperMum = sniperMumKopyala(sym);
            pusu.kirilimSnapshot = emirSnapshotOlustur(sym, pusu.yon, hedef, gerekenFiyat, canliFiyat, aktifTrend, pusu, pusu.kirilimSniperMum);
            console.log(`✅ [KIRILIM KAYDEDİLDİ] ${sym} ${pusu.yon} | Fiyat: ${dinamikBasamak(sym, canliFiyat)} | Tetik: ${dinamikBasamak(sym, gerekenFiyat)} | RAW: ${pusu.kirilimSnapshot.canliFiyatRaw} ${pusu.kirilimSnapshot.compareOperator} ${pusu.kirilimSnapshot.tetikRaw} = ${pusu.kirilimSnapshot.compareResult}`);
        }

        if (trendUygun && !pusu.trendOnayiGordu) {
            pusu.trendOnayiGordu = true;
            pusu.trendOnayiZamani = now;
            console.log(`✅ [TREND/SUPERTREND ONAYI KAYDEDİLDİ] ${sym} ${pusu.yon} | ${superTrendOnayPeriyodu()} ST: ${superTrendYonu} | Kaynak: ${aktifTrend.kaynak}`);
        }

        const tetikTamam = ayarlar.pusuTetikSirasiSerbest !== false
            ? (pusu.kirilimGordu && pusu.trendOnayiGordu)
            : (kirilim && trendUygun);

        let ortaBandUygun = true;
        let sniperOrtaBand = null;
        if (ayarlar.sniperOrtaBandFiltresi) {
            const sniperBollinger = h.state.sniperBollinger[sym];
            sniperOrtaBand = Number(sniperBollinger?.mid || 0);
            if (!sniperOrtaBand) {
                durumLogla(sym, `⚠️ ${sym} için ${ayarlar.sniperPeriyodu} Bollinger orta band yok, tetik bekliyor.`);
                continue;
            }
            // LONG: fiyat sniper orta bandın altında kalmalı. SHORT: fiyat sniper orta bandın üstünde kalmalı.
            ortaBandUygun = pusu.yon === 'LONG' ? canliFiyat < sniperOrtaBand : canliFiyat > sniperOrtaBand;
        }

        const fark = ((canliFiyat - hedef) / hedef) * 100;
        const ortaBandMetni = ayarlar.sniperOrtaBandFiltresi
            ? ` | ${ayarlar.sniperPeriyodu} OrtaBand: ${dinamikBasamak(sym, sniperOrtaBand)} | OrtaBand Filtre: ${ortaBandUygun ? 'UYGUN' : 'BEKLENİYOR'}`
            : '';
        const kaliteMetni = pusuKaliteMetni(pusu);
        const tetikModu = tetikYuzdesiAyar === 0 ? 'HEDEF= TETIK' : `HEDEF + %${tetikYuzdesiAyar}`;
        const durumMesaji = `🔍 ${sym} | PUSU: ${pusu.yon} (${ayarlar.pusuPeriyodu}) | Sayaç: ${pusu.gecenMumSayisi || 0}/${ayarlar.maxPusuBeklemeMum ?? 3} | ST(${superTrendOnayPeriyodu()}/${aktifTrend.kaynak}): ${superTrendYonu} | Fiyat: ${dinamikBasamak(sym, canliFiyat)} | Hedef: ${dinamikBasamak(sym, hedef)} | Tetik: ${dinamikBasamak(sym, gerekenFiyat)} | TetikModu: ${tetikModu} | Fark: ${fark.toFixed(2)}% | Kırılım: ${pusu.kirilimGordu ? 'GÖRÜLDÜ' : 'BEKLENİYOR'} | Trend: ${pusu.trendOnayiGordu ? 'ONAYLANDI' : 'BEKLENİYOR'} | ${kaliteMetni}${superTrendEtkiMetni(stEtki)}${ortaBandMetni}`;
        durumLogla(sym, durumMesaji);

        if (!tetikTamam || !ortaBandUygun) continue;

        const finalEmirSniperMum = sniperMumKopyala(sym);
        const emirSnapshot = emirSnapshotOlustur(sym, pusu.yon, hedef, gerekenFiyat, canliFiyat, aktifTrend, pusu, finalEmirSniperMum);

        // v2.1.13 son güvenlik kapısı:
        // Emir açılmadan hemen önce ham fiyat gerçekten tetik seviyesini geçmiş mi ve çok geç kalmış mı tekrar kontrol edilir.
        if (!emirSnapshot.compareResult) {
            console.log(`🧊 [SNAPSHOT EMİR ENGELLENDİ] ${sym} ${pusu.yon} | RAW canlı fiyat tetik seviyesini geçmemiş. Canlı: ${emirSnapshot.canliFiyatRaw} | Tetik: ${emirSnapshot.tetikRaw}`);
            continue;
        }

        if (!emirSnapshot.gecGirisUygun) {
            console.log(`🚫 [GEÇ GİRİŞ ENGELLENDİ] ${sym} ${pusu.yon} | Sapma: %${Number(emirSnapshot.tetikSapmaYuzde || 0).toFixed(4)} | Max: %${Number(emirSnapshot.maxGirisSapmaYuzde || 0).toFixed(2)} | Canlı: ${emirSnapshot.canliFiyatRaw} | Tetik: ${emirSnapshot.tetikRaw}`);
            if (ayarlar.gecGirisPusuyuIptalEt !== false) {
                delete h.state.pusuListesi[sym];
                kaliciHafiza.kaydet('gec-giris-pusu-iptal');
            }
            continue;
        }

        const emirIzni = kaliciHafiza.emirAcilabilirMi(sym, pusu.yon, !ayarlar.sanalEmirModu ? { ignoreDailyLimit: true } : {});
        if (!emirIzni.uygun) {
            console.log(`🛡️ [TETİK ENGELLENDİ] ${sym} ${pusu.yon} | ${emirIzni.sebep}`);
            if (emirIzni.sebep.includes('zaten aktif pozisyon')) delete h.state.pusuListesi[sym];
            continue;
        }

        console.log(`🎯 [SNIPER TETİĞİ] ${sym} ${pusu.yon} | fiyat kırılımı + ${superTrendOnayPeriyodu()} trend/SuperTrend tamamlandı. | ST Kaynak: ${aktifTrend.kaynak} | ${pusuKaliteMetni(pusu)}${superTrendEtkiMetni(stEtki)}`);
        if (pusu.kirilimZamani && pusu.trendOnayiZamani) {
            const onceGelen = pusu.kirilimZamani <= pusu.trendOnayiZamani ? 'Önce kırılım, sonra SuperTrend' : 'Önce SuperTrend, sonra kırılım';
            console.log(`🧭 [TETİK SIRASI] ${sym} | ${onceGelen} | Pusu sayacı: ${pusu.gecenMumSayisi || 0}/${ayarlar.maxPusuBeklemeMum ?? 3}`);
        }
        const emirZamani = Date.now();
        const tetikSapmaYuzde = pusu.yon === 'LONG'
            ? ((canliFiyat - gerekenFiyat) / gerekenFiyat) * 100
            : ((gerekenFiyat - canliFiyat) / gerekenFiyat) * 100;
        const tetikSirasi = pusu.kirilimZamani && pusu.trendOnayiZamani
            ? (pusu.kirilimZamani <= pusu.trendOnayiZamani ? 'Önce kırılım, sonra SuperTrend' : 'Önce SuperTrend, sonra kırılım')
            : 'Eksik zaman damgası';
        const emirSniperMum = finalEmirSniperMum;
        const sniperDebug = sniperDebugMesaji(sym, pusu.yon, gerekenFiyat, canliFiyat, pusu.kirilimSniperMum, emirSniperMum, emirSnapshot);
        const pusuDebug = pusuDebugMesaji(sym, pusu);

        const girisAnalizi = {
            entryStrategy: 'ST1',
            symbol: sym,
            yon: pusu.yon,
            pusuPeriyodu: ayarlar.pusuPeriyodu,
            sniperPeriyodu: ayarlar.sniperPeriyodu,
            trendPeriyodu: superTrendOnayPeriyodu(),
            hedefFiyati: hedef,
            tetikFiyati: gerekenFiyat,
            tetikYuzdesiAyar,
            tetikModu,
            girisFiyati: canliFiyat,
            tetikSapmaYuzde,
            emirSnapshot,
            rawCanliFiyat: emirSnapshot.canliFiyatRaw,
            rawTetikFiyati: emirSnapshot.tetikRaw,
            rawCompareResult: emirSnapshot.compareResult,
            gecGirisUygun: emirSnapshot.gecGirisUygun,
            maxGirisSapmaYuzde: emirSnapshot.maxGirisSapmaYuzde,
            superTrendYonu,
            stKaynak: aktifTrend.kaynak,
            superTrendEtki: stEtki,
            kirilimZamani: pusu.kirilimZamani || null,
            trendOnayiZamani: pusu.trendOnayiZamani || null,
            emirZamani,
            kirilimdanEmreMs: pusu.kirilimZamani ? emirZamani - pusu.kirilimZamani : null,
            trenddenEmreMs: pusu.trendOnayiZamani ? emirZamani - pusu.trendOnayiZamani : null,
            tetikSirasi,
            senaryo: pusu.senaryo,
            pusuSayaci: pusu.gecenMumSayisi || 0,
            maxPusuBeklemeMum: ayarlar.maxPusuBeklemeMum ?? 3,
            debugSniperMum: !!ayarlar.debugSniperMum,
            sniperDebug,
            pusuDebug,
            debugPusuMum: !!ayarlar.debugPusuMum,
            pusuMumu: pusu.pusuMumu || null,
            oncekiPusuMumu: pusu.oncekiPusuMumu || null,
            pusuKalite: pusu.pusuKalite || null,
            kirilimSniperMum: pusu.kirilimSniperMum || null,
            emirSniperMum: emirSniperMum || null
        };

        console.log(`📊 [GİRİŞ TEŞHİSİ] ${sym} ${pusu.yon} | TF: ${ayarlar.pusuPeriyodu}/${ayarlar.sniperPeriyodu} | Giriş: ${dinamikBasamak(sym, canliFiyat)} | Hedef: ${dinamikBasamak(sym, hedef)} | Tetik: ${dinamikBasamak(sym, gerekenFiyat)} | TetikModu: ${tetikModu} | Sapma: %${tetikSapmaYuzde.toFixed(4)} | Kırılım→Emir: ${girisAnalizi.kirilimdanEmreMs ?? 'YOK'} ms | ST→Emir: ${girisAnalizi.trenddenEmreMs ?? 'YOK'} ms | ST(${superTrendOnayPeriyodu()}): ${superTrendYonu} (${aktifTrend.kaynak})${superTrendEtkiMetni(stEtki)} | ${tetikSirasi}${pusuDebug ? '\n' + pusuDebug : ''}${sniperDebug ? '\n' + sniperDebug : ''}`);
        console.log(`🚀 [POZİSYON AÇILIYOR] ${sym} ${pusu.yon}`);

        let basarili = false;
        try {
            basarili = await m.pozisyonAc(sym, pusu.yon, canliFiyat, girisAnalizi);
        } catch (e) {
            console.error(`❌ [ENTRY_ABORT:UNCAUGHT] ${sym} ${pusu.yon} | ${e.message || e}`);
        }
        if (!basarili) console.log(`⛔ [ENTRY_ABORT:POSITION_OPEN_RETURNED_FALSE] ${sym} ${pusu.yon}`);
        if (basarili) {
            pusuKaliteMotoru.islemAcilisKaydet(girisAnalizi, { sym, yon: pusu.yon, girisFiyati: canliFiyat });
            buDongudeAcilanEmir++;
            delete h.state.pusuListesi[sym];
            kaliciHafiza.kaydet('pusu-tetik-pozisyon-acildi');
            await rapor.raporGonder(true);
            if (buDongudeAcilanEmir >= maxYeniEmirDongu) break;
        }
    }
}

function pozisyonListelerindenSil(pos) {
    if (pos.yon === 'LONG') h.state.alinanlar = h.state.alinanlar.filter(x => x !== pos.sym);
    else h.state.aktifShortlar = h.state.aktifShortlar.filter(x => x !== pos.sym);
}

function pozisyonDegeriHesapla(pos) {
    const miktar = Number(pos.miktar || pos.quantity || 0);
    const giris = Number(pos.girisFiyati || 0);
    if (miktar > 0 && giris > 0) return miktar * giris;
    return (ayarlar.calisilmakIstenenUsdtMiktar || 0) * (ayarlar.mevcutKaldirac || 1);
}

function fiyatGecerliMi(fiyat) {
    const n = Number(fiyat);
    return Number.isFinite(n) && n > 0;
}

function pozisyonKorumaFiyatlariniOnar(pos, kaynak = 'kontrol') {
    const giris = Number(pos.girisFiyati || 0);
    if (!fiyatGecerliMi(giris)) return false;

    const slOrani = (ayarlar.sabitStopYuzdesi || 1.5) / 100;
    const tpYuzdesi = ayarlar.stopTakipModu === 'KADEME'
        ? (ayarlar.maxTpYuzdesi || 10)
        : (ayarlar.sabitTpYuzdesi || 0.4);
    const tpOrani = tpYuzdesi / 100;

    const slMantikli = fiyatGecerliMi(pos.sl);
    const tpMantikli = pos.yon === 'LONG'
        ? fiyatGecerliMi(pos.tp) && Number(pos.tp) > giris
        : fiyatGecerliMi(pos.tp) && Number(pos.tp) < giris;

    let onarildi = false;
    if (!slMantikli) {
        pos.sl = pos.yon === 'LONG' ? giris * (1 - slOrani) : giris * (1 + slOrani);
        onarildi = true;
    }
    if (!tpMantikli) {
        pos.tp = pos.yon === 'LONG' ? giris * (1 + tpOrani) : giris * (1 - tpOrani);
        onarildi = true;
    }

    if (onarildi) {
        console.log(`🛠️ [KORUMA FİYATI ONARILDI] ${pos.sym} ${pos.yon} | Kaynak: ${kaynak} | Giriş: ${giris} | SL: ${pos.sl} | TP: ${pos.tp}`);
    }
    return onarildi;
}

function kapanisSebebiDuzenle(pos, sebep, kapanisFiyati) {
    if (!sebep || !sebep.includes('SL')) return sebep;

    const giris = Number(pos.girisFiyati || 0);
    if (!giris || !kapanisFiyati) return sebep;

    const fiyatKarYuzde = pos.yon === 'LONG'
        ? ((kapanisFiyati - giris) / giris) * 100
        : ((giris - kapanisFiyati) / giris) * 100;

    if (fiyatKarYuzde > 0.05) {
        const kaynak = pos?.renkoExitLastStopSourceLabel || (pos?.renkoExitActivated ? 'Renko takip stopu' : null);
        return kaynak ? `${kaynak} ile Kâr Koruma` : 'İz Süren Stop / Kâr Koruma';
    }
    if (Math.abs(fiyatKarYuzde) <= 0.05) return 'Başabaş Stop / Komisyon';
    return sebep;
}

async function kapanisRaporla(pos, kapanisFiyati, sebep) {
    const kapanisAnahtari = pozisyonKapanisAnahtari(pos);
    if (kapananPozisyonAnahtarlari.has(kapanisAnahtari)) {
        console.log(`🧯 [TEKRAR KAPANIŞ ENGELLENDİ] ${pos.sym} ${pos.yon} | Anahtar: ${kapanisAnahtari}`);
        return false;
    }
    kapananPozisyonAnahtarlari.add(kapanisAnahtari);

    const komisyonOrani = ayarlar.sanalKomisyonOrani ?? 0.0005;
    const hamGercekMuhasebe = pos?.sanal === false ? pos?.realizedExecution : null;
    const gercekMuhasebe = hamGercekMuhasebe?.source === 'BINANCE_USER_TRADES'
        && Number(hamGercekMuhasebe?.exitPrice) > 0
        && Number.isFinite(Number(hamGercekMuhasebe?.realizedPnl));
    if (gercekMuhasebe) kapanisFiyati = Number(hamGercekMuhasebe.exitPrice);

    const pozisyonDegeri = gercekMuhasebe
        ? Math.abs(Number(hamGercekMuhasebe.entryPrice || pos.girisFiyati || 0) * Number(pos.miktar || 0))
        : pozisyonDegeriHesapla(pos);
    const toplamKomisyon = gercekMuhasebe
        ? Math.max(0, Number(hamGercekMuhasebe.commission || 0))
        : pozisyonDegeri * komisyonOrani * 2;
    const fiyatKarYuzdesi = pos.yon === 'LONG'
        ? ((kapanisFiyati - pos.girisFiyati) / pos.girisFiyati) * 100
        : ((pos.girisFiyati - kapanisFiyati) / pos.girisFiyati) * 100;
    const brutKarZarar = gercekMuhasebe
        ? Number(hamGercekMuhasebe.realizedPnl || 0)
        : pozisyonDegeri * (fiyatKarYuzdesi / 100);
    const netKarZarar = gercekMuhasebe
        ? Number(hamGercekMuhasebe.netPnl || (brutKarZarar - toplamKomisyon))
        : brutKarZarar - toplamKomisyon;
    const netPozisyonYuzdesi = pozisyonDegeri > 0 ? (netKarZarar / pozisyonDegeri) * 100 : 0;
    const gercekMarjinTabani = Number(pos.gerceklesenNotionalUsdt || pozisyonDegeri) / Math.max(1, Number(pos.kaldirac || 1));
    const marjinTabani = pos?.sanal === false ? gercekMarjinTabani : Number(ayarlar.calisilmakIstenenUsdtMiktar || 0);
    const netMarjinYuzdesi = marjinTabani > 0 ? (netKarZarar / marjinTabani) * 100 : 0;
    const duzeltilmisSebep = kapanisSebebiDuzenle(pos, sebep, kapanisFiyati);
    const manuelDisKapanis = pos?.manualExternalClose === true
        || pos?.scientificLearningExcluded === true
        || /MANUAL_EXTERNAL_CLOSE|MANUAL_OVERRIDE/i.test(String(sebep || duzeltilmisSebep || ''));

    const kararTrack = String(pos?.labPremierDecision?.premierTrack || pos?.premierTrackAtOpen || '').toUpperCase();
    const deneyTrack = ['REVERSE_PREMIER', 'BOTTOM_PREMIER_LONG', 'BOTTOM_PREMIER_SHORT'].includes(kararTrack);
    // v5.3'ten kalan açık Reverse kayıtları upperLayerIncluded=true taşısa bile ana Premier PNL'ine karışmaz.
    if (deneyTrack) {
        pos.leagueShadowOnly = true;
        pos.virtualAccountIncluded = false;
        if (pos.labPremierDecision) { pos.labPremierDecision.upperLayerIncluded = false; pos.labPremierDecision.virtualShadowOnly = true; }
    }
    const leagueShadowOnly = pos.leagueShadowOnly === true || deneyTrack;
    if (!leagueShadowOnly) {
        h.state.basariOzeti.toplamKomisyon += toplamKomisyon;
        h.state.basariOzeti.netKarZarar += netKarZarar;
    }

    const sebepText = String(duzeltilmisSebep || sebep || '').toUpperCase();
    const beBandYuzde = Math.max(0.03, ayarlar.breakevenSonucBandYuzde || 0.10);
    const komisyonBandUsdt = toplamKomisyon * 1.25;
    let kaliteSonuc = 'SL';

    if (sebepText.includes('TP')) {
        kaliteSonuc = 'TP';
    } else if (sebepText.includes('İZ SÜREN') || sebepText.includes('KÂR KORUMA') || sebepText.includes('KAR KORUMA')) {
        kaliteSonuc = netKarZarar > 0 ? 'TP' : 'BE';
    } else if (sebepText.includes('BAŞABAŞ') || sebepText.includes('KOMİSYON')) {
        kaliteSonuc = Math.abs(netKarZarar) <= komisyonBandUsdt ? 'BE' : (netKarZarar > 0 ? 'TP' : 'SL');
    } else if (Math.abs(fiyatKarYuzdesi) <= beBandYuzde && Math.abs(netKarZarar) <= komisyonBandUsdt) {
        kaliteSonuc = 'BE';
    } else if (netKarZarar > komisyonBandUsdt) {
        // Stop kâr bölgesine taşındıysa ve net sonuç gerçek kârsa başarı hanesine TP olarak yazılır.
        kaliteSonuc = 'TP';
    }

    // KRİTİK FIX:
    // Sadece pos.breakevenAktif=true diye sonuç BE sayılamaz.
    // Senin gördüğün "Max Kâr pozitif / Net -1.50 / Sonuç BE" çelişkisi buradan doğuyordu.
    // BE yalnızca kapanış fiyatı/net PNL gerçekten başabaş bandındaysa yazılır; büyük zarar SL'dir.

    // Premier gözlem sonucu, açılışta dondurulan lig kimliğiyle ayrı kasaya yazılır.
    if (!manuelDisKapanis) premierObservation.close(pos, {
        net: netKarZarar, commission: toplamKomisyon, outcome: kaliteSonuc,
        reason: duzeltilmisSebep, exitPrice: kapanisFiyati
    });
    if (!manuelDisKapanis) try { labLifecycle.close(pos, {
        net: netKarZarar, commission: toplamKomisyon, outcome: kaliteSonuc,
        reason: duzeltilmisSebep, exitPrice: kapanisFiyati, fiyatKarYuzdesi,
        restartGap: restartGap.isQuarantined(pos)
    }); } catch (e) { console.log(`⚠️ [LAB LIFECYCLE] ${e.message}`); }
    // ST2 kimliği eski/açık pozisyonlarda yalnız üst seviyede kalmış olabilir.
    // Kapanış köprüsünden önce kimliği tek kanonik girisAnalizi nesnesinde tamamla.
    const st2PusuSnapshot = pos?.girisAnalizi?.pusuTuglasi || pos?.pusuTuglasi || {};
    const st2EntryStrategy = pos?.girisAnalizi?.entryStrategy || pos?.entryStrategy
        || (ayarlar.entryStrategyMode === 'ST2_RENKO' ? 'ST2_RENKO' : 'ST1');
    pos.girisAnalizi = {
        ...(pos.girisAnalizi || {}),
        entryStrategy: st2EntryStrategy,
        patternId: pos?.girisAnalizi?.patternId || pos?.patternId || st2PusuSnapshot.patternId,
        patternKodu: pos?.girisAnalizi?.patternKodu || pos?.patternKodu || st2PusuSnapshot.patternKodu,
        referansSeviye: pos?.girisAnalizi?.referansSeviye || pos?.referansSeviye || st2PusuSnapshot.referansSeviye,
        renkoBoxSize: pos?.girisAnalizi?.renkoBoxSize || pos?.renkoBoxSize || st2PusuSnapshot.renkoBoxSize,
        renkoEntryBrickDistance: pos?.girisAnalizi?.renkoEntryBrickDistance || pos?.renkoEntryBrickDistance || Number(ayarlar.renkoGirisVarsayilanTugla || 0.75)
    };
    let renkoEntryConfirmationResult = null;
    if (!manuelDisKapanis) try { renkoEntryEvolution.close(pos, {
        net: netKarZarar, commission: toplamKomisyon, outcome: kaliteSonuc,
        reason: duzeltilmisSebep, exitPrice: kapanisFiyati, fiyatKarYuzdesi,
        restartGap: restartGap.isQuarantined(pos)
    }); } catch (e) { console.log(`⚠️ [ST2 ENTRY EVOLUTION] ${e.message}`); }
    if (!manuelDisKapanis) try { williamsCycleShadow.close(pos, {
        net: netKarZarar, commission: toplamKomisyon, outcome: kaliteSonuc,
        reason: duzeltilmisSebep, exitPrice: kapanisFiyati, fiyatKarYuzdesi,
        restartGap: restartGap.isQuarantined(pos),
        durationMs: Date.now() - Number(pos.acilisZamani || pos.zaman || Date.now()),
        mfeYuzde: Number(pos?.journey?.mfePct || pos?.execution?.mfePct || pos?.maxKarYuzde || 0),
        maeYuzde: Number(pos?.journey?.maePct || pos?.execution?.maePct || pos?.maxZararYuzde || 0)
    }); } catch (e) { console.log(`⚠️ [W%R CYCLE SHADOW] ${e.message}`); }
    if (!manuelDisKapanis) try {
        renkoEntryConfirmationResult = renkoEntryConfirmationShadow.close(pos, {
            net: netKarZarar,
            outcome: kaliteSonuc,
            reason: duzeltilmisSebep,
            exitPrice: kapanisFiyati,
            restartGap: restartGap.isQuarantined(pos),
            notional: pozisyonDegeri,
            commissionRate: gercekMuhasebe && pozisyonDegeri > 0
                ? toplamKomisyon / (pozisyonDegeri * 2)
                : komisyonOrani,
            closedAt: Date.now()
        });
    } catch (e) { console.log(`⚠️ [RENKO ENTRY CONFIRMATION SHADOW] ${e.message}`); }
    if (!manuelDisKapanis && !restartGap.isQuarantined(pos)) try {
        const ev15m = renko15mConfirmedEvidence.recordLiveClose(pos, {
            netPct: netPozisyonYuzdesi,
            net: netKarZarar,
            outcome: kaliteSonuc,
            reason: duzeltilmisSebep,
            exitPrice: kapanisFiyati,
            at: new Date().toISOString(),
            closedAt: Date.now()
        });
        if (ev15m?.accepted) console.log(`📚 [15M ENTRY EVIDENCE LIVE] ${pos.sym} ${pos.yon} | ${pos?.girisAnalizi?.entryMode || 'YOK'} | ${ev15m.key} | N${Number(ev15m.metric?.samples || 0).toFixed(0)} WR %${Number(ev15m.metric?.wr || 0).toFixed(1)} Exp ${Number(ev15m.metric?.expectancy || 0) >= 0 ? '+' : ''}${Number(ev15m.metric?.expectancy || 0).toFixed(4)}`);
    } catch (e) { console.log(`⚠️ [15M ENTRY EVIDENCE LIVE] ${e.message}`); }

    if (!manuelDisKapanis) try { renkoExitEvolution.close(pos, {
        net: netKarZarar, commission: toplamKomisyon, outcome: kaliteSonuc,
        reason: duzeltilmisSebep, exitPrice: kapanisFiyati, fiyatKarYuzdesi,
        restartGap: restartGap.isQuarantined(pos)
    }); } catch (e) { console.log(`⚠️ [ST2 EXIT EVOLUTION] ${e.message}`); }

    const restartGapIslemi = restartGap.isQuarantined(pos);
    const exitMethodSummary = (restartGapIslemi || manuelDisKapanis)
        ? exitMethodScoreboard.display(pos)
        : exitMethodScoreboard.close(pos, { net: netKarZarar, commission: toplamKomisyon, outcome: kaliteSonuc, reason: duzeltilmisSebep });

    // Muhasebe PNL/komisyon her durumda korunur; restart-gap pozisyonları
    // bilimsel başarı sayaçlarına ve öğrenme motorlarına alınmaz.
    if (!restartGapIslemi && !manuelDisKapanis && !leagueShadowOnly) {
        if (kaliteSonuc === 'TP') {
            h.state.basariOzeti.tp++;
            if (pos.yon === 'LONG') h.state.basariOzeti.longTp++;
            else h.state.basariOzeti.shortTp++;
        } else if (kaliteSonuc === 'BE') {
            h.state.basariOzeti.be++;
            if (pos.yon === 'LONG') h.state.basariOzeti.longBe++;
            else h.state.basariOzeti.shortBe++;
        } else {
            h.state.basariOzeti.sl++;
            if (pos.yon === 'LONG') h.state.basariOzeti.longSl++;
            else h.state.basariOzeti.shortSl++;
        }
    }

    const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;
    const emoji = kaliteSonuc === 'TP' ? '✅' : (kaliteSonuc === 'BE' ? (netKarZarar >= 0 ? '⚖️✅' : '⚖️') : '❌');
    const raporKimligi = kapanisRaporKimligi(pos, restartGapIslemi);
    const baslik = raporKimligi.title;
    const kapanisZamani = Date.now();

    const kapanisAnalizPaketi = {
        sonuc: kaliteSonuc,
        kapanisSebebi: duzeltilmisSebep,
        kapanisFiyati,
        fiyatKarYuzdesi: Number(fiyatKarYuzdesi.toFixed(4)),
        netKarZarar: Number(netKarZarar.toFixed(6)),
        netPozisyonYuzdesi: Number(netPozisyonYuzdesi.toFixed(4)),
        netMarjinYuzdesi: Number(netMarjinYuzdesi.toFixed(4)),
        komisyon: Number(toplamKomisyon.toFixed(6)),
        gercekMuhasebe: Boolean(gercekMuhasebe),
        muhasebeKaynagi: gercekMuhasebe ? hamGercekMuhasebe.source : 'ESTIMATE',
        muhasebeTam: gercekMuhasebe ? hamGercekMuhasebe.accountingExact !== false : false,
        commissionByAsset: gercekMuhasebe ? (hamGercekMuhasebe.commissionByAsset || {}) : {},
        leagueShadowOnly,
        virtualAccountIncluded: !leagueShadowOnly
    };

    if (pos?.sanal === false) {
        try {
            const postClose = postClosePricePath.start(pos, {
                entryPrice: gercekMuhasebe ? Number(hamGercekMuhasebe.entryPrice || pos.girisFiyati) : Number(pos.girisFiyati),
                exitPrice: Number(kapanisFiyati),
                closedAt: kapanisZamani,
                reason: duzeltilmisSebep,
                net: netKarZarar,
                commission: toplamKomisyon
            });
            if (postClose?.accepted) {
                console.log(`🔬 [POST-CLOSE 24H TAKİP BAŞLADI] ${pos.sym} ${pos.yon} | Giriş ${Number(pos.girisFiyati).toPrecision(8)} | Kapanış ${Number(kapanisFiyati).toPrecision(8)} | 24h boyunca emir etkisi YOK`);
            }
        } catch (e) {
            console.log(`⚠️ [POST-CLOSE 24H TAKİP] ${pos.sym} ${pos.yon} | start ${e.message}`);
        }
    }

    let exitReplayRecord = null;
    if (!restartGapIslemi && !manuelDisKapanis) {
        pos.blackboxKapanis = await blackbox.snapshotAl(pos.sym, pos.yon, 'KAPANIS').catch(err => {
            console.log(`⚠️ [BLACKBOX] Kapanış snapshot alınamadı: ${pos.sym} ${pos.yon} | ${err.message}`);
            return null;
        });

        pusuKaliteMotoru.islemKapanisKaydet(pos, kapanisAnalizPaketi);
        analizMerkezi.kapanisKaydet(pos, kapanisAnalizPaketi);
        exitOptimizer.kapanisKaydet(pos, kapanisAnalizPaketi);
        exitReplayRecord = exitReplay.replayTrade(pos, kapanisAnalizPaketi);
        blackbox.kayitYaz(pos, 'KAPANIS', kapanisAnalizPaketi);
        labChampion.close(pos, kapanisAnalizPaketi, exitReplayRecord);
        labPremier.close(pos, { net: netKarZarar, commission: toplamKomisyon, outcome: kaliteSonuc, reason: duzeltilmisSebep });
        liveCohortEconomy.record(pos, { net: netKarZarar, commission: toplamKomisyon, outcome: kaliteSonuc, reason: duzeltilmisSebep }, { closedAt: kapanisZamani });
    } else if (restartGapIslemi) {
        restartGap.closeRecord(pos, kapanisAnalizPaketi);
        console.log(`🛡️ [RESTART GAP KAPANIŞ] ${pos.sym} ${pos.yon} | Muhasebe dahil, öğrenme hariç | Net: ${netKarZarar.toFixed(4)}`);
    } else {
        console.log(`🖐️ [MANUEL/DIŞ KAPANIŞ] ${pos.sym} ${pos.yon} | Bilimsel öğrenme hariç | Net: ${netKarZarar.toFixed(4)}`);
    }

    try {
        accountingContinuity.trackAtClose(pos, {
            restartGap: restartGapIslemi,
            scientific: !restartGapIslemi && !manuelDisKapanis
        });
    } catch (err) {
        console.log(`⚠️ [ACCOUNTING CONTINUITY CLOSE] ${pos.sym} ${pos.yon} | ${err.message}`);
    }

    const hamFiyatYoluVar = Array.isArray(pos?.execution?.pricePath) && pos.execution.pricePath.length > 0;
    let replayUnavailableReason = null;
    if (restartGapIslemi) replayUnavailableReason = 'RESTART_GAP_SCIENTIFICALLY_EXCLUDED';
    else if (manuelDisKapanis) replayUnavailableReason = 'MANUAL_EXTERNAL_CLOSE_SCIENTIFICALLY_EXCLUDED';
    else if (!exitReplayRecord && !hamFiyatYoluVar) replayUnavailableReason = 'PRICE_PATH_MISSING';
    else if (!exitReplayRecord) replayUnavailableReason = 'EXIT_REPLAY_ENGINE_RETURNED_NULL';
    else if (!exitReplayRecord?.shadowExitValidation) replayUnavailableReason = 'EXIT_REPLAY_SELECTION_VALIDATION_NOT_AVAILABLE';

    const operasyonMesaji = operationTransparency.closingText(pos, {
        emoji,
        title: baslik,
        dnaLabel: raporKimligi.dnaLabel,
        labDnaLabel: raporKimligi.labDnaLabel,
        fullDnaLabel: raporKimligi.fullDnaLabel,
        league: raporKimligi.league,
        proof: raporKimligi.proof,
        openedAtText: blackbox.tarihSaat(pos.acilisZamani || pos.zaman),
        closedAtText: blackbox.tarihSaat(kapanisZamani),
        durationText: blackbox.sureMetni(kapanisZamani - Number(pos.acilisZamani || pos.zaman || kapanisZamani)),
        exitPrice: kapanisFiyati,
        pricePrecision: pPrecision,
        reason: duzeltilmisSebep,
        outcome: kaliteSonuc,
        fiyatKarYuzdesi,
        grossPnl: brutKarZarar,
        commission: toplamKomisyon,
        netPnl: netKarZarar,
        shadowOnly: leagueShadowOnly,
        accountingExact: gercekMuhasebe && hamGercekMuhasebe.accountingExact === true,
        entryCommission: gercekMuhasebe ? Number(hamGercekMuhasebe.entryCommission || 0) : 0,
        exitCommission: gercekMuhasebe ? Number(hamGercekMuhasebe.exitCommission || 0) : 0,
        replayValidation: exitReplayRecord?.shadowExitValidation || null,
        replayUnavailableReason
    }) +
    renkoEntryConfirmationShadow.telegramText(renkoEntryConfirmationResult) +
    (gercekMuhasebe
        ? `\n\n💳 <b>GERÇEK FILL MUHASEBESİ</b>\nKaynak: Binance User Trades | Fill ${hamGercekMuhasebe.tradeCount || 0} | Muhasebe ${hamGercekMuhasebe.accountingExact === false ? 'KISMİ (yabancı komisyon asseti ayrı)' : 'TAM'}`
        : '') +
    (restartGapIslemi ? restartGap.telegramMetni(pos) : '') +
    (manuelDisKapanis ? `\n\n⚠️ <b>MANUEL/DIŞ KAPANIŞ</b>\nBilimsel öğrenme ve metot çetelesi bu kapanış için güncellenmedi.` : '');

    const telegramSonuclari = await h.telegramMesajGonder(operasyonMesaji);
    let bilimselTelegramSonuclari = [];
    if (!restartGapIslemi && !manuelDisKapanis && ayarlar.telegramMinimalOperasyonModu !== true) {
        const bilimselMesaj = blackbox.bilimselKapanisMetni(pos) +
            exitOptimizer.kapanisMetni(pos, kapanisAnalizPaketi) +
            exitReplay.kapanisMetni(exitReplayRecord) +
            exitMethodScoreboard.telegramLine(exitMethodSummary, { restartGap: false, currentOutcome: kaliteSonuc });
        bilimselTelegramSonuclari = await h.telegramMesajGonder(bilimselMesaj);
    } else if (!restartGapIslemi && !manuelDisKapanis) {
        console.log(`ℹ️ [MINIMAL TELEGRAM] ${pos.sym} ${pos.yon} bilimsel kapanış ayrıntısı log/state/ledger içinde tutuldu.`);
    }

    const telegramOk = Array.isArray(telegramSonuclari) && telegramSonuclari.some(x => x?.sonuc?.ok);
    const bilimselTelegramOk = !bilimselTelegramSonuclari.length || bilimselTelegramSonuclari.some(x => x?.sonuc?.ok);
    console.log(`${telegramOk && bilimselTelegramOk ? '✅' : '⚠️'} [TELEGRAM KAPANIŞ] ${pos.sym} ${pos.yon} | Operasyon ${telegramOk ? 'OK' : 'HATA'} | Bilimsel ${bilimselTelegramOk ? 'OK' : 'HATA'} | Sonuç: ${kaliteSonuc} | Net: ${netKarZarar.toFixed(4)} | Parça: ${Array.isArray(telegramSonuclari) ? telegramSonuclari.length : 0}+${bilimselTelegramSonuclari.length}`);

    // v2.5.1: Her N kapanışta bir ayrı BlackBox istatistik raporu gönder.
    // Canlı rapor içinde özet var; bu rapor ise Telegram'da kaçırılmayacak ayrı analiz mesajıdır.
    try {
        if (ayarlar.telegramMinimalOperasyonModu !== true && ayarlar.entryStrategyMode !== 'ST2_RENKO' && !restartGapIslemi && blackbox.istatistikRaporGerekli && blackbox.istatistikRaporGerekli()) {
            await h.telegramMesajGonder(blackbox.telegramIstatistikRaporMetni());
            kaliciHafiza.kaydet('blackbox-istatistik-raporu-gonderildi');
        }
    } catch (err) {
        console.error(`⚠️ [BLACKBOX İSTATİSTİK RAPOR HATASI] ${err.message}`);
    }

    // v3.6.5: Her ayarlanan kapanış sayısında DNA bazlı Exit Evolution skor tablosu gönder.
    try {
        if (ayarlar.telegramMinimalOperasyonModu !== true && !restartGapIslemi && !manuelDisKapanis && exitReplay.periyodikRaporGerekli()) {
            const exitRaporSonuclari = await h.telegramMesajGonder(exitReplay.periyodikRaporMetni());
            const exitRaporOk = Array.isArray(exitRaporSonuclari) && exitRaporSonuclari.some(x => x?.sonuc?.ok);
            if (exitRaporOk) {
                exitReplay.periyodikRaporGonderildiIsaretle();
                kaliciHafiza.kaydet('exit-evolution-periyodik-raporu-gonderildi');
            }
        }
    } catch (err) {
        console.error(`⚠️ [EXIT EVOLUTION TELEGRAM RAPOR HATASI] ${err.message}`);
    }
}

function sanalKapanisKontrol(pos, canliFiyat) {
    pozisyonKorumaFiyatlariniOnar(pos, 'sanal-kapanis-kontrol');

    if (!fiyatGecerliMi(pos.sl) || !fiyatGecerliMi(pos.tp) || !fiyatGecerliMi(pos.girisFiyati)) {
        console.log(`🚫 [SANAL KAPANIŞ ENGELLENDİ] ${pos.sym} ${pos.yon} | Geçersiz fiyat | Giriş:${pos.girisFiyati} SL:${pos.sl} TP:${pos.tp}`);
        return { kapandi: false };
    }

    if (pos.yon === 'LONG') {
        if (canliFiyat <= pos.sl) return { kapandi: true, fiyat: pos.sl, sebep: 'Sanal SL' };
        if (canliFiyat >= pos.tp) return { kapandi: true, fiyat: pos.tp, sebep: 'Sanal TP' };
    } else {
        if (canliFiyat >= pos.sl) return { kapandi: true, fiyat: pos.sl, sebep: 'Sanal SL' };
        if (canliFiyat <= pos.tp) return { kapandi: true, fiyat: pos.tp, sebep: 'Sanal TP' };
    }
    return { kapandi: false };
}

function yuzdelikKarHesapla(pos, canliFiyat) {
    if (pos.yon === 'LONG') {
        return ((canliFiyat - pos.girisFiyati) / pos.girisFiyati) * 100;
    }
    return ((pos.girisFiyati - canliFiyat) / pos.girisFiyati) * 100;
}

function kademeliStopHesapla(pos, canliFiyat) {
    const adim = ayarlar.tpAdimYuzdesi || 0.4;
    const maxKademe = ayarlar.tpKademeSayisi || Math.floor((ayarlar.maxTpYuzdesi || 10) / adim);
    const karYuzde = yuzdelikKarHesapla(pos, canliFiyat);
    const ulasilanKademe = Math.min(Math.floor(karYuzde / adim), maxKademe);

    if (ulasilanKademe <= (pos.tpKademe || 0)) return false;
    if (ulasilanKademe <= 0) return false;

    const eskiKademe = pos.tpKademe || 0;
    // LAB yaşam profili oluştuysa öğrenilmiş BE tetik yüzdesi kademeye çevrilir.
    // Profil yoksa çalışan ST1 davranışı (breakevenTetikKademe) aynen korunur.
    const ogrenilmisBeTetik = Number(pos.labBeTetikYuzde);
    const beTetikKademe = Number.isFinite(ogrenilmisBeTetik) && ogrenilmisBeTetik > 0
        ? Math.max(1, Math.ceil(ogrenilmisBeTetik / adim))
        : Math.max(1, ayarlar.breakevenTetikKademe || 2);
    const geridenKademe = Math.max(1, ayarlar.kademeStopGeridenKademe || 2);
    const beTamponYuzde = Math.max(0, pos.labBeTamponYuzde ?? ayarlar.breakevenTamponYuzde ?? 0);
    const minBeklemeMs = Math.max(0, ayarlar.breakevenMinimumBeklemeSaniye || 0) * 1000;
    const pozisyonYasiMs = Date.now() - (pos.acilisZamani || pos.zaman || Date.now());

    // v2.1.10: İlk küçük kârda stopu hemen girişe çekme.
    // Kademe bilgisini yine kaydet ama BE/SL güncellemesini belirlenen tetik kademesine kadar beklet.
    if (ulasilanKademe < beTetikKademe || pozisyonYasiMs < minBeklemeMs) {
        pos.oncekiTpKademe = eskiKademe;
        pos.tpKademe = ulasilanKademe;
        pos.mevcutTpYuzdesi = ulasilanKademe * adim;
        pos.korunanKarYuzdesi = 0;
        pos.breakevenBeklemede = true;
        return false;
    }

    let korunanKarYuzde = Math.max(0, (ulasilanKademe - geridenKademe) * adim);

    // BE ilk defa aktifleştiğinde stop tam giriş yerine küçük tamponlu başabaşa alınır.
    // Bu komisyonu ve sıfır çevresindeki gürültüyü daha doğru raporlamaya yardım eder.
    if (!pos.breakevenAktif && korunanKarYuzde <= 0) {
        korunanKarYuzde = beTamponYuzde;
        pos.breakevenAktif = true;
        pos.breakevenYeniAktif = true;
        pos.breakevenBeklemede = false;
    } else if (!pos.breakevenAktif) {
        pos.breakevenAktif = true;
        pos.breakevenYeniAktif = true;
        pos.breakevenBeklemede = false;
    }

    const yeniSl = pos.yon === 'LONG'
        ? pos.girisFiyati * (1 + korunanKarYuzde / 100)
        : pos.girisFiyati * (1 - korunanKarYuzde / 100);

    const dahaIyiStop = pos.yon === 'LONG' ? yeniSl > pos.sl : yeniSl < pos.sl;
    if (!dahaIyiStop) {
        pos.tpKademe = ulasilanKademe;
        pos.mevcutTpYuzdesi = ulasilanKademe * adim;
        return false;
    }

    pos.oncekiTpKademe = eskiKademe;
    pos.tpKademe = ulasilanKademe;
    pos.mevcutTpYuzdesi = ulasilanKademe * adim;
    pos.korunanKarYuzdesi = korunanKarYuzde;
    pos.sl = yeniSl;
    return true;
}

function klasikTrailingHesapla(pos, canliFiyat) {
    let guncellemeGerekli = false;

    if (pos.yon === 'LONG') {
        const karYuzde = ((canliFiyat - pos.girisFiyati) / pos.girisFiyati) * 100;
        if (karYuzde >= (pos.labBeTetikYuzde ?? ayarlar.breakevenTetikYuzde) && !pos.breakevenAktif) {
            pos.sl = pos.girisFiyati * (1 + Math.max(0, pos.labBeTamponYuzde ?? ayarlar.breakevenTamponYuzde ?? 0) / 100);
            pos.breakevenAktif = true;
            pos.breakevenYeniAktif = true;
            guncellemeGerekli = true;
        }
        if (karYuzde >= ayarlar.izSurenStopAktivasyon) {
            const potansiyelSl = canliFiyat * (1 - ayarlar.izSurenStopTakipYuzdesi / 100);
            if (potansiyelSl > pos.sl) {
                pos.sl = potansiyelSl;
                guncellemeGerekli = true;
            }
        }
    } else {
        const karYuzde = ((pos.girisFiyati - canliFiyat) / pos.girisFiyati) * 100;
        if (karYuzde >= (pos.labBeTetikYuzde ?? ayarlar.breakevenTetikYuzde) && !pos.breakevenAktif) {
            pos.sl = pos.girisFiyati * (1 - Math.max(0, pos.labBeTamponYuzde ?? ayarlar.breakevenTamponYuzde ?? 0) / 100);
            pos.breakevenAktif = true;
            pos.breakevenYeniAktif = true;
            guncellemeGerekli = true;
        }
        if (karYuzde >= ayarlar.izSurenStopAktivasyon) {
            const potansiyelSl = canliFiyat * (1 + ayarlar.izSurenStopTakipYuzdesi / 100);
            if (potansiyelSl < pos.sl) {
                pos.sl = potansiyelSl;
                guncellemeGerekli = true;
            }
        }
    }

    return guncellemeGerekli;
}

function yuzdeselEkonomiHesapla(pos, canliFiyat) {
    if (ayarlar.confirmedYuzdeselEkonomiAktif !== true) return false;
    const giris = Number(pos?.girisFiyati || 0);
    const fiyat = Number(canliFiyat || 0);
    if (!(giris > 0) || !(fiyat > 0)) return false;

    const karYuzde = pos.yon === 'LONG'
        ? ((fiyat - giris) / giris) * 100
        : ((giris - fiyat) / giris) * 100;
    const aktivasyon = Number(ayarlar.confirmedYuzdeselEkonomiAktivasyonYuzde || 2.50);
    if (karYuzde + 1e-9 < aktivasyon) return false;

    const ilkKilit = Number(ayarlar.confirmedYuzdeselEkonomiIlkKilitYuzde || 1.50);
    const adim = Math.max(0.05, Number(ayarlar.confirmedYuzdeselEkonomiAdimYuzde || 0.50));
    const kademe = Math.max(0, Math.floor((karYuzde - aktivasyon + 1e-9) / adim));
    const korunanKar = ilkKilit + kademe * adim;
    const adaySl = pos.yon === 'LONG'
        ? giris * (1 + korunanKar / 100)
        : giris * (1 - korunanKar / 100);
    const mevcutSl = Number(pos.sl || 0);
    const dahaIyi = pos.yon === 'LONG' ? adaySl > mevcutSl : adaySl < mevcutSl;
    if (!dahaIyi) return false;

    pos.sl = adaySl;
    pos.breakevenAktif = true;
    pos.breakevenYeniAktif = true;
    pos.yuzdeselEkonomiAktif = true;
    pos.yuzdeselEkonomiSonKarYuzde = karYuzde;
    pos.yuzdeselEkonomiKorunanKarYuzde = korunanKar;
    pos.renkoExitLastStopSourceLabel = 'Yüzdesel ekonomi takip stopu';
    if (!Array.isArray(pos.renkoProtectionTimeline)) pos.renkoProtectionTimeline = [];
    pos.renkoProtectionTimeline.push({
        at: Date.now(), type: kademe === 0 ? 'PERCENT_ECONOMY_ARMED' : 'PERCENT_ECONOMY_STOP_MOVED',
        price: fiyat, profitPct: karYuzde, stop: adaySl, protectedProfitPct: korunanKar
    });
    if (pos.renkoProtectionTimeline.length > 120) pos.renkoProtectionTimeline = pos.renkoProtectionTimeline.slice(-120);
    return true;
}

function trailingHesapla(pos, canliFiyat) {
    if (ayarlar.confirmedYuzdeselEkonomiAktif === true) {
        return yuzdeselEkonomiHesapla(pos, canliFiyat);
    }
    if (ayarlar.stopTakipModu === 'KADEME') {
        return kademeliStopHesapla(pos, canliFiyat);
    }
    return klasikTrailingHesapla(pos, canliFiyat);
}


function stopBildirimGerekli(pos, oncekiSl, yeniSl, canliFiyat) {
    if (!ayarlar.telegramStopGuncellemeMesaji) return false;
    if (!oncekiSl || !yeniSl || oncekiSl === yeniSl) return false;

    const now = Date.now();
    const minSure = (ayarlar.stopBildirimMinSaniye || 60) * 1000;
    const minYuzde = ayarlar.stopBildirimMinYuzde || 0.2;
    const farkYuzde = Math.abs((yeniSl - oncekiSl) / oncekiSl) * 100;

    if (ayarlar.stopTakipModu === 'KADEME') return true;
    if (pos.breakevenYeniAktif) return true;
    if (!pos.sonStopBildirimZamani) return true;
    if (farkYuzde >= minYuzde && now - pos.sonStopBildirimZamani >= minSure) return true;
    if (now - pos.sonStopBildirimZamani >= minSure * 5) return true;
    return false;
}

async function stopGuncellemeMesajiGonder(pos, oncekiSl, yeniSl, canliFiyat, sanalPozisyon) {
    const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;
    const karYuzde = pos.yon === 'LONG'
        ? ((canliFiyat - pos.girisFiyati) / pos.girisFiyati) * 100
        : ((pos.girisFiyati - canliFiyat) / pos.girisFiyati) * 100;
    const korunanKarYuzde = pos.yon === 'LONG'
        ? ((yeniSl - pos.girisFiyati) / pos.girisFiyati) * 100
        : ((pos.girisFiyati - yeniSl) / pos.girisFiyati) * 100;
    const baslik = sanalPozisyon ? '🧪 SANAL STOP GÜNCELLENDİ' : '🔄 STOP GÜNCELLENDİ';
    const kademeSatiri = ayarlar.stopTakipModu === 'KADEME'
        ? `🎯 Kademe: ${pos.oncekiTpKademe || 0} → ${pos.tpKademe || 0}  (%${(pos.mevcutTpYuzdesi || 0).toFixed(2)})\n`
        : '';

    await h.telegramMesajGonder(
        `<b>${baslik}</b>\n\n` +
        `🔀 ${pos.sym} (${pos.yon})\n` +
        kademeSatiri +
        `📍 Anlık Fiyat: ${canliFiyat.toFixed(pPrecision)}\n` +
        `🛡️ Eski SL: ${oncekiSl.toFixed(pPrecision)}\n` +
        `🛡️ Yeni SL: ${yeniSl.toFixed(pPrecision)}\n` +
        `📈 Anlık Kâr: %${karYuzde.toFixed(2)}\n` +
        `🔒 Korunan Kâr: %${korunanKarYuzde.toFixed(2)}`
    );
    pos.sonStopBildirimZamani = Date.now();
}

function guvenliStopUygula(pos, oncekiSl, adaySl) {
    const onceki = Number(oncekiSl);
    const aday = Number(adaySl);
    if (!Number.isFinite(onceki) || onceki <= 0) return { applied: false, reason: 'ONCEKI_STOP_GECERSIZ', value: onceki };
    if (!Number.isFinite(aday) || aday <= 0) return { applied: false, reason: 'ADAY_STOP_GECERSIZ', value: onceki };
    const klipli = m.fiyatKlip(pos.sym, aday);
    if (!Number.isFinite(klipli) || klipli <= 0) return { applied: false, reason: 'KLIP_SONRASI_STOP_GECERSIZ', value: onceki };
    const tick = Number(h.state.basamaklar[pos.sym]?.tickSize) || Math.pow(10, -(h.state.basamaklar[pos.sym]?.pricePrecision ?? 8));
    const epsilon = Math.max(Number.EPSILON, tick / 2);
    const iyilesiyor = pos.yon === 'LONG' ? klipli > onceki + epsilon : klipli < onceki - epsilon;
    if (!iyilesiyor) return { applied: false, reason: Math.abs(klipli - onceki) <= epsilon ? 'NO_OP' : 'MONOTON_STOP_KORUMASI', value: onceki };
    pos.sl = klipli;
    pos.renkoExitSafetyRejectReason = null;
    return { applied: true, reason: 'APPLIED', value: klipli };
}

function renkoEntryConfirmationShadowTelegramArkaPlan(mesajlar = []) {
    const liste = Array.isArray(mesajlar) ? mesajlar.filter(Boolean) : [];
    if (liste.length === 0) return;
    setImmediate(() => {
        for (const mesaj of liste) {
            Promise.resolve(h.telegramMesajGonder(mesaj))
                .catch(err => console.log(`⚠️ [RENKO ENTRY CONFIRMATION FULL TG] ${err.message}`));
        }
    });
}

function gercekOkumaDeadline(promise, timeoutMs, label = 'SIGNED_READ_TIMEOUT') {
    const ms = Math.max(2000, Number(timeoutMs || 8000));
    let timer = null;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                const err = new Error(`${label}:${ms}ms`);
                err.code = 'ETIMEDOUT';
                reject(err);
            }, ms);
            timer.unref?.();
        })
    ]).finally(() => { if (timer) clearTimeout(timer); });
}

async function izSurmeyiGuncelle(options = {}) {
    const reconcileOnly = options.reconcileOnly === true;
    const skipExchangeReconcile = options.skipExchangeReconcile === true;
    // v6.12.3-R2: Ana işlem kapanmış olsa bile Renko giriş teyit gölge adayları
    // kendi bağımsız yaşam döngülerini sürdürür. Reconcile-only turunda bilimsel gölge işi çalıştırılmaz.
    if (!reconcileOnly) {
        try {
            const shadowTick = renkoEntryConfirmationShadow.tickAll(h.state.canliFiyatlar || {}, Date.now());
            renkoEntryConfirmationShadowTelegramArkaPlan(shadowTick.telegramMessages || []);
        } catch (e) {
            console.log(`⚠️ [RENKO ENTRY CONFIRMATION FULL TICK] ${e.message}`);
        }
    }

    try {
        const postCloseTick = postClosePricePath.advance(h.state.canliFiyatlar || {}, Date.now());
        for (const ev of postCloseTick.events || []) {
            if (ev.type === 'CHECKPOINT') {
                const cp = ev.snapshot || {};
                console.log(`🔬 [POST-CLOSE ${ev.label}] ${ev.sym} ${ev.direction} | Anlık ${Number(cp.pct || 0) >= 0 ? '+' : ''}${Number(cp.pct || 0).toFixed(3)}% | Best ${Number(cp.bestPct || 0) >= 0 ? '+' : ''}${Number(cp.bestPct || 0).toFixed(3)}% | Worst ${Number(cp.worstPct || 0).toFixed(3)}% | Emir etkisi YOK`);
                continue;
            }
            if (ev.type !== 'COMPLETE') continue;
            const row = ev.row || {};
            console.log(`📚 [POST-CLOSE 24H TAMAMLANDI] ${row.sym} ${row.direction} | Kapanış sonrası Best ${Number(row.bestPct || 0) >= 0 ? '+' : ''}${Number(row.bestPct || 0).toFixed(3)}% | Worst ${Number(row.worstPct || 0).toFixed(3)}% | Son ${Number(row.lastPct || 0) >= 0 ? '+' : ''}${Number(row.lastPct || 0).toFixed(3)}% | Emir etkisi YOK`);
        }
    } catch (e) {
        console.log(`⚠️ [POST-CLOSE 24H TAKİP] advance ${e.message}`);
    }

    if (h.state.aktifPozisyonlar.length === 0) return { exchangeOk: true, reconciled: 0, closed: 0 };

    let borsaPozisyonlar = [];
    if (!ayarlar.sanalEmirModu && !skipExchangeReconcile) {
        try {
            borsaPozisyonlar = await gercekOkumaDeadline(
                h.client.futuresPositionRisk(),
                ayarlar.gercekPozisyonMutabakatTimeoutMs || 8000,
                'FUTURES_POSITION_RISK_TIMEOUT'
            );
        } catch (e) {
            console.error('❌ Pozisyon risk durumu çekilemedi:', e.message);
            return { exchangeOk: false, error: e.message, reconciled: 0, closed: 0 };
        }
    }
    let reconciledCount = 0;
    let closedCount = 0;
    let reconcileFailures = 0;

    for (let i = h.state.aktifPozisyonlar.length - 1; i >= 0; i--) {
        const pos = h.state.aktifPozisyonlar[i];
        const sanalPozisyon = ayarlar.sanalEmirModu || pos.sanal;

        // Binance pozisyon gerçeği canlı fiyat akışından ÖNCE işlenir. Global ticker bozuk olsa bile
        // borsada kapanmış gerçek pozisyon state'te hayalet slot olarak kalamaz.
        if (!sanalPozisyon && !skipExchangeReconcile) {
            const borsaPoz = borsaPozisyonlar.find(p => p.symbol === pos.sym);
            const borsaMiktar = borsaPoz ? Math.abs(parseFloat(borsaPoz.positionAmt)) : 0;
            reconciledCount++;
            if (borsaMiktar === 0) {
                if (pos.kapanisIsleniyor) continue;
                pos.kapanisIsleniyor = true;
                let kritikKapanisCommitEdildi = false;
                try {
                    const fallbackPrice = Number(h.state.canliFiyatlar[pos.sym] || pos.girisFiyati || 0);
                    const mutabakat = await realExecution.finalizeExchangeClose(pos, fallbackPrice, h.client);
                    const commit = closeLifecycle.commitRealClose({
                        state: h.state,
                        pos,
                        indexHint: i,
                        reconciliation: mutabakat,
                        livePrice: Number(mutabakat.exitPrice || fallbackPrice || pos.girisFiyati || 0),
                        manualLockMs: Number(ayarlar.manuelKapanisYenidenGirisKilidiMs || 3600000),
                        removeAuxiliary: pozisyonListelerindenSil,
                        persist: kaliciHafiza.kaydet
                    });
                    kritikKapanisCommitEdildi = commit.ok === true;
                    if (kritikKapanisCommitEdildi) closedCount++;
                    console.log(`🔎 [GERÇEK KAPANIŞ MUTABAKATI] ${pos.sym} ${pos.yon} | ${commit.reason} | Fill ${commit.closePrice || fallbackPrice} | Net ${Number(mutabakat.netPnl || 0).toFixed(6)} | Slot SERBEST`);
                    closeLifecycle.scheduleCloseReport({
                        pos,
                        closePrice: commit.closePrice || fallbackPrice,
                        reason: commit.reason,
                        reportClose: kapanisRaporla,
                        sendPanel: rapor.raporGonder,
                        persist: kaliciHafiza.kaydet
                    });
                } catch (err) {
                    if (!kritikKapanisCommitEdildi) pos.kapanisIsleniyor = false;
                    reconcileFailures++;
                    console.error(`❌ [GERÇEK KAPANIŞ UZLAŞTIRMA] ${pos.sym} ${pos.yon} | ${err.message}`);
                }
                continue;
            }
        }

        if (reconcileOnly) continue;
        const canliFiyat = h.state.canliFiyatlar[pos.sym];
        if (!canliFiyat) continue;

        analizMerkezi.journeyGuncelle(pos, canliFiyat);
        exitOptimizer.tickGuncelle(pos, canliFiyat);
        // Yalnız gölge: R→G / G→R sonrası 0.25T–0.75T alternatif girişlerini izler.
        // Canlı stop, emir ve Exit Evolution pozisyonunu değiştirmez.
        const entryConfirmationTick = renkoEntryConfirmationShadow.update(pos, canliFiyat);
        const entryConfirmationMesajlari = [];
        for (const row of entryConfirmationTick.emitted || []) {
            const mesaj = renkoEntryConfirmationShadow.lifecycleTelegramText(row);
            if (mesaj) entryConfirmationMesajlari.push(mesaj);
        }
        renkoEntryConfirmationShadowTelegramArkaPlan(entryConfirmationMesajlari);
        renkoExitEvolution.assign(pos);
        const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;

        if (sanalPozisyon) {
            // v4.2.1: Kanıtlı DNA exit planı sanal testte aktif uygulanır.
            // Plan yoksa/desteklenmiyorsa mevcut kademe sistemi güvenli fallback olarak devam eder.
            const yeniEkonomi = ayarlar.confirmedYuzdeselEkonomiAktif === true;
            const dynamicKarar = yeniEkonomi ? { active:false, close:false } : sanalDynamicExit.evaluate(pos, canliFiyat);
            const renkoKarar = (!yeniEkonomi && ayarlar.renkoCikisEvolutionAktif === true) ? renkoExitEvolution.update(pos, canliFiyat) : { active:false, changed:false };
            if (renkoKarar.justActivated && ayarlar.telegramRenkoDevralmaMesaji === true && !pos.renkoExitTakeoverNotified) {
                await h.telegramMesajGonder(renkoExitEvolution.takeoverText(pos));
                pos.renkoExitTakeoverNotified = true;
                kaliciHafiza.kaydet('renko-exit-devraldi');
            }
            if (!renkoKarar.active && dynamicKarar.close) {
                if (pos.kapanisIsleniyor) continue;
                pos.kapanisIsleniyor = true;
                pos.dynamicExitApplied = dynamicKarar;
                console.log(`🧬 [SANAL DYNAMIC EXIT] ${pos.sym} ${pos.yon} | ${dynamicKarar.algorithmLabel} | ${dynamicKarar.reason} | Fiyat: ${dynamicKarar.price.toFixed(pPrecision)}`);
                h.state.aktifPozisyonlar.splice(i, 1);
                pozisyonListelerindenSil(pos);
                try { await kapanisRaporla(pos, dynamicKarar.price, dynamicKarar.reason); }
                catch (err) { console.error(`❌ [DYNAMIC EXIT KAPANIŞ HATASI] ${pos.sym} ${pos.yon} | ${err.message}`); }
                kaliciHafiza.kaydet('sanal-dynamic-exit-kapandi');
                await rapor.raporGonder(true);
                continue;
            }

            const dynamicAktif = dynamicKarar.active === true;
            const oncekiSl = Number(pos.sl);
            const hamGuncellendi = renkoKarar.active ? Boolean(renkoKarar.changed) : (dynamicAktif ? false : trailingHesapla(pos, canliFiyat));
            if (hamGuncellendi) {
                const adaySl = Number(pos.sl);
                pos.sl = oncekiSl;
                const safety = guvenliStopUygula(pos, oncekiSl, adaySl);
                if (!safety.applied) {
                    pos.renkoExitSafetyRejectReason = safety.reason;
                    if (safety.reason !== 'NO_OP' && pos.renkoExitLastSafetyLog !== safety.reason) {
                        console.warn(`🛡️ [RENKO STOP REDDEDİLDİ] ${pos.sym} ${pos.yon} | ${safety.reason} | Önceki ${oncekiSl} | Aday ${adaySl}`);
                        pos.renkoExitLastSafetyLog = safety.reason;
                    }
                } else {
                    pos.renkoExitLastSafetyLog = null;
                    exitOptimizer.stopKaydet(pos, oncekiSl, pos.sl, canliFiyat, { kaynak: 'SANAL' });
                    console.log(`🧪 [SANAL STOP GÜNCELLENDİ] ${pos.sym} ${pos.yon} | ${oncekiSl.toFixed(pPrecision)} → ${pos.sl.toFixed(pPrecision)}`);
                    if (stopBildirimGerekli(pos, oncekiSl, pos.sl, canliFiyat)) {
                        await stopGuncellemeMesajiGonder(pos, oncekiSl, pos.sl, canliFiyat, true);
                        await rapor.raporGonder(true);
                    }
                    pos.breakevenYeniAktif = false;
                    kaliciHafiza.kaydet('sanal-stop-guncellendi');
                }
            }

            const kapanis = sanalKapanisKontrol(pos, canliFiyat);
            if (kapanis.kapandi) {
                if (pos.kapanisIsleniyor) continue;
                pos.kapanisIsleniyor = true;
                console.log(`🧪 [SANAL KAPANDI] ${pos.sym} ${pos.yon} | Sebep: ${kapanis.sebep} | Fiyat: ${kapanis.fiyat.toFixed(pPrecision)}`);

                // KRİTİK FIX: Pozisyonu rapor/Telegram beklemeden önce aktif listeden çıkar.
                // Aksi halde Telegram/BlackBox tarafında oluşan tek bir hata, aynı TP/SL'nin her döngüde tekrar gönderilmesine yol açar.
                h.state.aktifPozisyonlar.splice(i, 1);
                pozisyonListelerindenSil(pos);

                try {
                    await kapanisRaporla(pos, kapanis.fiyat, kapanis.sebep);
                } catch (err) {
                    console.error(`❌ [KAPANIŞ RAPOR HATASI] ${pos.sym} ${pos.yon} | ${err.message}`);
                }

                kaliciHafiza.kaydet('sanal-pozisyon-kapandi');
                await rapor.raporGonder(true);
            }
            continue;
        }

        // Önceki turda yeni stop kurulamadıysa algoritma kademesini ilerletmeden aynı adayı tekrar dene.
        if (Number(pos.pendingRealStopPrice) > 0) {
            const pendingStop = Number(pos.pendingRealStopPrice);
            const retry = await realExecution.replaceStopAtomic(pos, pendingStop, h.client);
            if (!retry.ok) {
                const now = Date.now();
                const signature = `${retry.reason}|${pendingStop}`;
                const logDue = pos.realStopRetryLastLogSignature !== signature || now - Number(pos.realStopRetryLastLogAt || 0) >= 60_000;
                if (logDue) {
                    const koruma = retry.emergencyClosed ? 'Pozisyon acil kapatıldı' : (retry.oldRestored ? 'Eski stop geri kuruldu' : 'Eski koruma aktif');
                    console.warn(`⏳ [GERÇEK STOP YENİDEN DENEME] ${pos.sym} ${pos.yon} | ${koruma} | ${retry.reason}`);
                    pos.realStopRetryLastLogSignature = signature;
                    pos.realStopRetryLastLogAt = now;
                }
                // Cooldown sırasında saniyede bir aynı state kaydını yazarak diski/state dosyasını şişirme.
                // Neden değiştiğinde, global blokta veya 60 saniyelik sağlık damgasında kalıcılaştır.
                const persistDue = retry.globalBlocked === true ||
                    pos.realStopRetryLastPersistSignature !== signature ||
                    now - Number(pos.realStopRetryLastPersistAt || 0) >= 60_000;
                if (persistDue) {
                    pos.realStopRetryLastPersistSignature = signature;
                    pos.realStopRetryLastPersistAt = now;
                    realExecution.persistPosition(pos, retry.globalBlocked ? 'REAL_STOP_RETRY_GLOBAL_BLOCK' : 'REAL_STOP_RETRY_PENDING');
                }
                continue;
            }
            const oldStop = Number(pos.sl);
            pos.sl = pendingStop;
            delete pos.pendingRealStopPrice;
            exitOptimizer.stopKaydet(pos, oldStop, pendingStop, canliFiyat, { kaynak: 'BINANCE_ALGO_ATOMIC_RETRY' });
            realExecution.persistPosition(pos, 'REAL_STOP_RETRY_SUCCEEDED');
            console.log(`✅ [GERÇEK STOP YENİDEN DENEME BAŞARILI] ${pos.sym} ${pos.yon} | ${oldStop.toFixed(pPrecision)} → ${pendingStop.toFixed(pPrecision)}`);
        }

        // Gerçek stop algoritması aday stopu pozisyon nesnesinde değiştirir. Borsa güncellemesi
        // başarısız olursa yerel stopun eski korumadan kopmaması için önceki değeri baştan dondur.
        const realOncekiSl = Number(pos.sl);
        const yeniEkonomi = ayarlar.confirmedYuzdeselEkonomiAktif === true;
        const realDynamicKarar = yeniEkonomi ? { active:false, close:false } : sanalDynamicExit.evaluate(pos, canliFiyat);
        const realRenkoKarar = (!yeniEkonomi && ayarlar.renkoCikisEvolutionAktif === true)
            ? renkoExitEvolution.update(pos, canliFiyat)
            : { active: false, changed: false };

        if (realRenkoKarar.justActivated && ayarlar.telegramRenkoDevralmaMesaji === true && !pos.renkoExitTakeoverNotified) {
            await h.telegramMesajGonder(renkoExitEvolution.takeoverText(pos));
            pos.renkoExitTakeoverNotified = true;
            realExecution.persistPosition(pos, 'RENKO_EXIT_TAKEOVER_NOTIFIED');
        }

        if (!realRenkoKarar.active && realDynamicKarar.close) {
            if (pos.kapanisIsleniyor) continue;
            pos.kapanisIsleniyor = true;
            let kritikKapanisCommitEdildi = false;
            try {
                const kapanis = await realExecution.closePositionMarket(pos, realDynamicKarar.reason, h.client);
                if (!kapanis.ok) throw new Error(kapanis.reason || 'Dinamik gerçek kapanış mutabakatı başarısız');
                pos.dynamicExitApplied = realDynamicKarar;
                const commit = closeLifecycle.commitRealClose({
                    state: h.state,
                    pos,
                    indexHint: i,
                    reconciliation: { ...kapanis, manual: false, reason: realDynamicKarar.reason },
                    livePrice: kapanis.exitPrice || realDynamicKarar.price,
                    removeAuxiliary: pozisyonListelerindenSil,
                    persist: kaliciHafiza.kaydet
                });
                kritikKapanisCommitEdildi = commit.ok === true;
                console.log(`🧬 [GERÇEK DYNAMIC EXIT] ${pos.sym} ${pos.yon} | ${realDynamicKarar.algorithmLabel} | ${realDynamicKarar.reason} | Net ${Number(kapanis.netPnl || 0).toFixed(6)} | Slot SERBEST`);
                closeLifecycle.scheduleCloseReport({
                    pos,
                    closePrice: commit.closePrice || realDynamicKarar.price,
                    reason: commit.reason,
                    reportClose: kapanisRaporla,
                    sendPanel: rapor.raporGonder,
                    persist: kaliciHafiza.kaydet
                });
            } catch (err) {
                if (!kritikKapanisCommitEdildi) pos.kapanisIsleniyor = false;
                console.error(`❌ [GERÇEK DYNAMIC EXIT HATASI] ${pos.sym} ${pos.yon} | ${err.message}`);
            }
            continue;
        }

        const hamGuncellendi = realRenkoKarar.active
            ? Boolean(realRenkoKarar.changed)
            : trailingHesapla(pos, canliFiyat);

        if (hamGuncellendi) {
            const adaySl = Number(pos.sl);
            pos.sl = realOncekiSl;
            const safety = guvenliStopUygula(pos, realOncekiSl, adaySl);
            if (!safety.applied) {
                pos.renkoExitSafetyRejectReason = safety.reason;
                if (safety.reason !== 'NO_OP' && pos.renkoExitLastSafetyLog !== safety.reason) {
                    console.warn(`🛡️ [GERÇEK STOP REDDEDİLDİ] ${pos.sym} ${pos.yon} | ${safety.reason} | Önceki ${realOncekiSl} | Aday ${adaySl}`);
                    pos.renkoExitLastSafetyLog = safety.reason;
                }
            } else {
                const yeniSl = Number(pos.sl);
                const replacement = await realExecution.replaceStopAtomic(pos, yeniSl, h.client);
                if (!replacement.ok) {
                    pos.sl = realOncekiSl;
                    pos.pendingRealStopPrice = yeniSl;
                    pos.renkoExitSafetyRejectReason = replacement.reason;
                    realExecution.persistPosition(pos, 'REAL_STOP_RETRY_SCHEDULED');
                    const now = Date.now();
                    const signature = `${replacement.reason}|${yeniSl}`;
                    if (pos.realStopReplaceLastErrorSignature !== signature || now - Number(pos.realStopReplaceLastErrorAt || 0) >= 60_000) {
                        const prefix = ['STOP_REPLACE_MIN_INTERVAL','STOP_REPLACE_COOLDOWN'].includes(replacement.reason) ? '⏳' : '⚠️';
                        console.warn(`${prefix} [ATOMİK STOP GÜNCELLEME BEKLEME] ${pos.sym} | Eski koruma aktif, aday yeniden denenecek | ${replacement.reason}`);
                        pos.realStopReplaceLastErrorSignature = signature;
                        pos.realStopReplaceLastErrorAt = now;
                    }
                } else {
                    delete pos.pendingRealStopPrice;
                    pos.renkoExitLastSafetyLog = null;
                    exitOptimizer.stopKaydet(pos, realOncekiSl, yeniSl, canliFiyat, { kaynak: 'BINANCE_ALGO_ATOMIC' });
                    console.log(`🔐 [GERÇEK STOP ATOMİK GÜNCELLENDİ] ${pos.sym} ${pos.yon} | ${realOncekiSl.toFixed(pPrecision)} → ${yeniSl.toFixed(pPrecision)} | Eski iptal ${replacement.oldCanceled ? 'OK' : 'TEKRAR KONTROL GEREKLİ'}`);
                    if (stopBildirimGerekli(pos, realOncekiSl, yeniSl, canliFiyat)) {
                        await stopGuncellemeMesajiGonder(pos, realOncekiSl, yeniSl, canliFiyat, false);
                        await rapor.raporGonder(true);
                    }
                    pos.breakevenYeniAktif = false;
                    realExecution.persistPosition(pos, 'REAL_STOP_UPDATED_ATOMIC');
                }
            }
        } else {
            // MFE, takeover ve diğer çalışma zamanı alanları restartta kaybolmasın.
            realExecution.persistPosition(pos, 'REAL_POSITION_HEARTBEAT');
        }
    }
    return { exchangeOk: reconcileFailures === 0, reconciled: reconciledCount, closed: closedCount, failures: reconcileFailures, error: reconcileFailures ? 'EXCHANGE_CLOSE_RECONCILIATION_FAILED' : null };
}

async function pusuRaporuGonder() {
    if (ayarlar.telegramPusuMesaji !== true) return;
    const now = Date.now();
    // v3.0.2 FIX: Pusu raporu Telegram'ı kirletmesin.
    // Ayar aktifse bot açılışından sonraki ilk dolu pusu raporu gönderilir, sonra susar.
    if (ayarlar.pusuRaporuSadeceBaslangicta && pusuRaporuBaslangicGonderildi) return;
    if (!ayarlar.pusuRaporuSadeceBaslangicta && now - sonRaporZamani < RAPOR_ARALIGI) return;

    let raporListesi = [];
    if (pusuRaporu.length > 0) {
        raporListesi = pusuRaporu.splice(0, pusuRaporu.length);
    } else {
        for (const [sym, pusu] of Object.entries(h.state.pusuListesi)) {
            raporListesi.push({ sym, yon: pusu.yon, senaryo: pusu.senaryo || 'AKTIF', kalite: pusu.pusuKalite || null });
        }
    }

    if (raporListesi.length === 0) return;
    sonRaporZamani = now;

    function listeyiKisalt(liste) {
        const max = ayarlar.pusuRaporuMaxSembol || 20;
        const ilk = liste.slice(0, max).map(p => `${p.sym}(${p.senaryo}${p.kalite ? ' | ' + p.kalite.puan + '/' + p.kalite.sinif : ''})`);
        const kalan = Math.max(0, liste.length - max);
        return ilk.join(', ') + (kalan > 0 ? `\n… +${kalan} pusu daha` : '');
    }

    const longlar = raporListesi.filter(p => p.yon === 'LONG');
    const shortlar = raporListesi.filter(p => p.yon === 'SHORT');
    const longList = listeyiKisalt(longlar);
    const shortList = listeyiKisalt(shortlar);

    const mesaj = `🔔 <b>PUSU RAPORU</b>\n` +
        `📊 Toplam: ${raporListesi.length} | LONG: ${longlar.length} | SHORT: ${shortlar.length}\n\n` +
        (longList ? `📈 <b>LONG</b>\n${longList}\n\n` : '') +
        (shortList ? `📉 <b>SHORT</b>\n${shortList}` : '');

    await h.telegramMesajGonder(mesaj);
    if (ayarlar.pusuRaporuSadeceBaslangicta) pusuRaporuBaslangicGonderildi = true;
}

module.exports = {
    piyasayiTaraVePusuKur,
    pusulariDenetleVeIslemAc,
    izSurmeyiGuncelle,
    pusuRaporuGonder,
    _kapanisRaporKimligi: kapanisRaporKimligi,
    _closeLifecycle: closeLifecycle
};
