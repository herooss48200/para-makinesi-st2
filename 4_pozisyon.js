const h = require('./1_hafiza.js');
const m = require('./motor.js');
const ayarlar = require('./ayarlar.js');
const rapor = require('./2_rapor.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');
const pusuKaliteMotoru = require('./6_pusu_kalite_motoru.js');
const analizMerkezi = require('./7_analiz_merkezi.js');
const blackbox = require('./8_blackbox.js');

let pusuRaporu = [];
let sonRaporZamani = 0;
const RAPOR_ARALIGI = 300000;

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

        const emirIzni = kaliciHafiza.emirAcilabilirMi(sym, pusu.yon);
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

        const basarili = await m.pozisyonAc(sym, pusu.yon, canliFiyat, girisAnalizi);
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

    const slMantikli = pos.yon === 'LONG'
        ? fiyatGecerliMi(pos.sl) && Number(pos.sl) < giris
        : fiyatGecerliMi(pos.sl) && Number(pos.sl) > giris;
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

    if (fiyatKarYuzde > 0.05) return 'İz Süren Stop / Kâr Koruma';
    if (Math.abs(fiyatKarYuzde) <= 0.05) return 'Başabaş Stop / Komisyon';
    return sebep;
}

async function kapanisRaporla(pos, kapanisFiyati, sebep) {
    const komisyonOrani = ayarlar.sanalKomisyonOrani ?? 0.0005;
    const pozisyonDegeri = pozisyonDegeriHesapla(pos);
    const toplamKomisyon = pozisyonDegeri * komisyonOrani * 2;
    const fiyatKarYuzdesi = pos.yon === 'LONG'
        ? ((kapanisFiyati - pos.girisFiyati) / pos.girisFiyati) * 100
        : ((pos.girisFiyati - kapanisFiyati) / pos.girisFiyati) * 100;
    const brutKarZarar = pozisyonDegeri * (fiyatKarYuzdesi / 100);
    const netKarZarar = brutKarZarar - toplamKomisyon;
    const netPozisyonYuzdesi = pozisyonDegeri > 0 ? (netKarZarar / pozisyonDegeri) * 100 : 0;
    const netMarjinYuzdesi = (ayarlar.calisilmakIstenenUsdtMiktar || 0) > 0
        ? (netKarZarar / ayarlar.calisilmakIstenenUsdtMiktar) * 100
        : 0;
    const duzeltilmisSebep = kapanisSebebiDuzenle(pos, sebep, kapanisFiyati);

    h.state.basariOzeti.toplamKomisyon += toplamKomisyon;
    h.state.basariOzeti.netKarZarar += netKarZarar;

    const sebepText = String(duzeltilmisSebep || sebep || '').toUpperCase();
    const beBandYuzde = Math.max(0.05, ayarlar.breakevenSonucBandYuzde || 0.15);
    let kaliteSonuc = 'SL';
    if (sebepText.includes('TP')) kaliteSonuc = 'TP';
    else if (pos.breakevenAktif || sebepText.includes('BAŞABAŞ') || sebepText.includes('KOMİSYON') || Math.abs(fiyatKarYuzdesi) <= beBandYuzde) kaliteSonuc = 'BE';

    // Kâr koruma/trailing stop SL emriyle kapanabilir; analizde zarar SL'i gibi sayılmamalı.
    if (kaliteSonuc === 'SL' && netKarZarar >= 0) {
        kaliteSonuc = 'BE';
    }

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

    const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;
    const emoji = kaliteSonuc === 'TP' ? '✅' : (kaliteSonuc === 'BE' ? (netKarZarar >= 0 ? '⚖️✅' : '⚖️') : '❌');
    const baslik = pos.sanal ? '[SANAL POZİSYON KAPANDI]' : '[POZİSYON KAPANDI]';
    const kapanisZamani = Date.now();

    const kapanisAnalizPaketi = {
        sonuc: kaliteSonuc,
        kapanisSebebi: duzeltilmisSebep,
        kapanisFiyati,
        fiyatKarYuzdesi: Number(fiyatKarYuzdesi.toFixed(4)),
        netKarZarar: Number(netKarZarar.toFixed(6)),
        netPozisyonYuzdesi: Number(netPozisyonYuzdesi.toFixed(4)),
        netMarjinYuzdesi: Number(netMarjinYuzdesi.toFixed(4)),
        komisyon: Number(toplamKomisyon.toFixed(6))
    };

    pos.blackboxKapanis = await blackbox.snapshotAl(pos.sym, pos.yon, 'KAPANIS').catch(err => {
        console.log(`⚠️ [BLACKBOX] Kapanış snapshot alınamadı: ${pos.sym} ${pos.yon} | ${err.message}`);
        return null;
    });

    pusuKaliteMotoru.islemKapanisKaydet(pos, kapanisAnalizPaketi);
    analizMerkezi.kapanisKaydet(pos, kapanisAnalizPaketi);
    blackbox.kayitYaz(pos, 'KAPANIS', kapanisAnalizPaketi);

    await h.telegramMesajGonder(
        `${emoji} <b>${baslik}</b>\n` +
        `🔀 ${pos.sym} (${pos.yon})\n` +
        `🕒 Açılış: ${blackbox.tarihSaat(pos.acilisZamani || pos.zaman)}\n` +
        `🕒 Kapanış: ${blackbox.tarihSaat(kapanisZamani)}\n` +
        `⏳ Süre: ${blackbox.sureMetni(kapanisZamani - Number(pos.acilisZamani || pos.zaman || kapanisZamani))}\n` +
        `📌 Sebep: ${duzeltilmisSebep}\n` +
        `📥 Giriş: ${pos.girisFiyati.toFixed(pPrecision)}\n` +
        `📤 Çıkış: ${kapanisFiyati.toFixed(pPrecision)}\n` +
        `📦 Pozisyon: ${pozisyonDegeri.toFixed(4)} USDT\n` +
        `📊 Fiyat Hareketi: %${fiyatKarYuzdesi.toFixed(2)}\n` +
        `📈 Brüt PNL: ${brutKarZarar.toFixed(4)} USDT\n` +
        `💸 Komisyon: ${toplamKomisyon.toFixed(4)} USDT\n` +
        `👑 Net PNL: ${netKarZarar.toFixed(4)} USDT\n` +
        (pos.girisAnalizi?.pusuKalite ? `🏅 Pusu Kalitesi: ${pos.girisAnalizi.pusuKalite.puan}/100 ${pos.girisAnalizi.pusuKalite.sinif} | ${pos.girisAnalizi.pusuKalite.senaryo || pos.girisAnalizi.senaryo || 'YOK'} | Sonuç: ${kaliteSonuc}\n` : '') +
        `📊 Net %: %${netPozisyonYuzdesi.toFixed(2)} | Marjin %: %${netMarjinYuzdesi.toFixed(2)}` +
        blackbox.kapanisAnalizMetni(pos, kapanisAnalizPaketi, kapanisZamani) +
        blackbox.telegramSnapshotMetni(pos.blackboxAcilis, 'AÇILIŞ FOTOĞRAFI') +
        blackbox.telegramSnapshotMetni(pos.blackboxKapanis, 'KAPANIŞ FOTOĞRAFI') +
        blackbox.gecisMetni(pos.blackboxAcilis, pos.blackboxKapanis)
    );
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
    const beTetikKademe = Math.max(1, ayarlar.breakevenTetikKademe || 2);
    const geridenKademe = Math.max(1, ayarlar.kademeStopGeridenKademe || 2);
    const beTamponYuzde = Math.max(0, ayarlar.breakevenTamponYuzde || 0);
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
        if (karYuzde >= ayarlar.breakevenTetikYuzde && !pos.breakevenAktif) {
            pos.sl = pos.girisFiyati * (1 + Math.max(0, ayarlar.breakevenTamponYuzde || 0) / 100);
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
        if (karYuzde >= ayarlar.breakevenTetikYuzde && !pos.breakevenAktif) {
            pos.sl = pos.girisFiyati * (1 - Math.max(0, ayarlar.breakevenTamponYuzde || 0) / 100);
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

function trailingHesapla(pos, canliFiyat) {
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

async function izSurmeyiGuncelle() {
    if (h.state.aktifPozisyonlar.length === 0) return;

    let borsaPozisyonlar = [];
    if (!ayarlar.sanalEmirModu) {
        try {
            borsaPozisyonlar = await h.client.futuresPositionRisk();
        } catch (e) {
            console.error('❌ Pozisyon risk durumu çekilemedi:', e.message);
            return;
        }
    }

    for (let i = h.state.aktifPozisyonlar.length - 1; i >= 0; i--) {
        const pos = h.state.aktifPozisyonlar[i];
        const canliFiyat = h.state.canliFiyatlar[pos.sym];
        if (!canliFiyat) continue;

        const sanalPozisyon = ayarlar.sanalEmirModu || pos.sanal;
        analizMerkezi.journeyGuncelle(pos, canliFiyat);
        const pPrecision = h.state.basamaklar[pos.sym]?.pricePrecision ?? 4;

        if (sanalPozisyon) {
            const oncekiSl = pos.sl;
            const guncellendi = trailingHesapla(pos, canliFiyat);
            if (guncellendi) {
                pos.sl = m.fiyatKlip(pos.sym, pos.sl);
                console.log(`🧪 [SANAL STOP GÜNCELLENDİ] ${pos.sym} ${pos.yon} | ${oncekiSl.toFixed(pPrecision)} → ${pos.sl.toFixed(pPrecision)}`);
                if (stopBildirimGerekli(pos, oncekiSl, pos.sl, canliFiyat)) {
                    await stopGuncellemeMesajiGonder(pos, oncekiSl, pos.sl, canliFiyat, true);
                    await rapor.raporGonder(true);
                }
                pos.breakevenYeniAktif = false;
                kaliciHafiza.kaydet('sanal-stop-guncellendi');
            }

            const kapanis = sanalKapanisKontrol(pos, canliFiyat);
            if (kapanis.kapandi) {
                console.log(`🧪 [SANAL KAPANDI] ${pos.sym} ${pos.yon} | Sebep: ${kapanis.sebep} | Fiyat: ${kapanis.fiyat.toFixed(pPrecision)}`);
                await kapanisRaporla(pos, kapanis.fiyat, kapanis.sebep);
                h.state.aktifPozisyonlar.splice(i, 1);
                pozisyonListelerindenSil(pos);
                kaliciHafiza.kaydet('sanal-pozisyon-kapandi');
                await rapor.raporGonder(true);
            }
            continue;
        }

        const borsaPoz = borsaPozisyonlar.find(p => p.symbol === pos.sym);
        const borsaMiktar = borsaPoz ? Math.abs(parseFloat(borsaPoz.positionAmt)) : 0;

        if (borsaMiktar === 0) {
            console.log(`🛑 [KAPANDI] ${pos.sym} pozisyonu kapandı. Rapor iletiliyor...`);
            await kapanisRaporla(pos, canliFiyat, 'Borsa pozisyonu kapandı');
            h.state.aktifPozisyonlar.splice(i, 1);
            pozisyonListelerindenSil(pos);
            await rapor.raporGonder(true);
            continue;
        }

        const oncekiSl = pos.sl;
        const guncellemeGerekli = trailingHesapla(pos, canliFiyat);

        if (guncellemeGerekli) {
            try {
                const acikEmirler = await h.client.futuresOpenOrders({ symbol: pos.sym });
                const eskiStoplar = acikEmirler.filter(o => o.type === 'STOP_MARKET');
                for (const o of eskiStoplar) {
                    await h.client.futuresCancelOrder({ symbol: pos.sym, orderId: o.orderId }).catch(() => {});
                }

                const karsiYon = pos.yon === 'LONG' ? 'SELL' : 'BUY';
                const yeniSl = m.fiyatKlip(pos.sym, pos.sl);
                await h.client.futuresOrder({
                    symbol: pos.sym,
                    side: karsiYon,
                    type: 'STOP_MARKET',
                    stopPrice: yeniSl.toFixed(pPrecision),
                    closePosition: true,
                    workingType: 'MARK_PRICE'
                });
                pos.sl = yeniSl;

                if (stopBildirimGerekli(pos, oncekiSl, yeniSl, canliFiyat)) {
                    await stopGuncellemeMesajiGonder(pos, oncekiSl, yeniSl, canliFiyat, false);
                    await rapor.raporGonder(true);
                }
                pos.breakevenYeniAktif = false;
            } catch (err) {
                console.error(`❌ [STOP GÜNCELLEME HATASI] ${pos.sym}:`, err.message);
            }
        }
    }
}

async function pusuRaporuGonder() {
    const now = Date.now();
    if (now - sonRaporZamani < RAPOR_ARALIGI) return;

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
}

module.exports = {
    piyasayiTaraVePusuKur,
    pusulariDenetleVeIslemAc,
    izSurmeyiGuncelle,
    pusuRaporuGonder
};
