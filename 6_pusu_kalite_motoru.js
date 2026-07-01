const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const JSONL_FILE = path.join(DATA_DIR, 'pusu-kalite-islemler.jsonl');
const CSV_FILE = path.join(DATA_DIR, 'pusu-kalite-islemler.csv');

const CSV_BASLIK = [
    'kayitTipi', 'zaman', 'symbol', 'yon', 'senaryo',
    'kalitePuan', 'kaliteSinif',
    'govdeOrani', 'ustFitilOrani', 'altFitilOrani', 'kapanisGucu',
    'bandTemasKalitesi', 'bandFarkYuzde', 'ortaBandUzaklikYuzde', 'bandGenisligiYuzde',
    'pusuOpen', 'pusuHigh', 'pusuLow', 'pusuClose',
    'girisFiyati', 'cikisFiyati', 'sonuc', 'kapanisSebebi',
    'fiyatKarYuzdesi', 'netKarZarar', 'netPozisyonYuzdesi', 'netMarjinYuzdesi',
    'pusuSayaci',
    'stUyumlu', 'stYasMum', 'stMesafeYuzde', 'stKaynak', 'stDurum', 'stEtkiPuani',
    'tutmaSuresiMs', 'sanalOrderId'
];

function klasorHazirla() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CSV_FILE)) fs.writeFileSync(CSV_FILE, CSV_BASLIK.join(',') + '\n');
}

function sayi(n, varsayilan = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? x : varsayilan;
}

function sinirla(n, min = 0, max = 100) {
    const x = sayi(n, min);
    return Math.max(min, Math.min(max, x));
}

function yuvarla(n, basamak = 4) {
    const x = sayi(n, 0);
    return Number(x.toFixed(basamak));
}

function csvDeger(v) {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function csvSatirYaz(kayit) {
    const satir = CSV_BASLIK.map(k => csvDeger(kayit[k])).join(',') + '\n';
    fs.appendFileSync(CSV_FILE, satir);
}

function jsonlSatirYaz(kayit) {
    fs.appendFileSync(JSONL_FILE, JSON.stringify(kayit) + '\n');
}

function kayitYaz(kayit) {
    if (ayarlar.pusuKaliteLogAktif === false) return;
    try {
        klasorHazirla();
        jsonlSatirYaz(kayit);
        csvSatirYaz(kayit);
    } catch (err) {
        console.error(`❌ [PUSU KALİTE LOG] Yazılamadı: ${err.message}`);
    }
}

function kaliteSinifi(puan) {
    if (puan >= 80) return 'A';
    if (puan >= 60) return 'B';
    if (puan >= 40) return 'C';
    return 'D';
}

function hesapla(mum, yon, senaryoBilgisi = {}) {
    const senaryo = typeof senaryoBilgisi === 'string' ? senaryoBilgisi : (senaryoBilgisi.senaryo || 'YOK');
    if (!mum) return { puan: 0, sinif: 'D', metin: '0/100 D', senaryo, detay: 'Pusu mumu yok' };

    const open = sayi(mum.open);
    const high = sayi(mum.high);
    const low = sayi(mum.low);
    const close = sayi(mum.close);
    const range = high - low;

    if (!Number.isFinite(range) || range <= 0) {
        return { puan: 0, sinif: 'D', metin: '0/100 D', senaryo, detay: 'Mum aralığı yok' };
    }

    const govde = Math.abs(open - close);
    const ustFitil = Math.max(0, high - Math.max(open, close));
    const altFitil = Math.max(0, Math.min(open, close) - low);

    const govdePct = sinirla((govde / range) * 100);
    const ustFitilPct = sinirla((ustFitil / range) * 100);
    const altFitilPct = sinirla((altFitil / range) * 100);
    const kapanisKonumu = sinirla(((close - low) / range) * 100); // 100 = high tarafında kapanış
    const shortKapanisGucu = sinirla(((high - close) / range) * 100); // 100 = low tarafında kapanış
    const yonluKapanisGucu = yon === 'LONG' ? kapanisKonumu : shortKapanisGucu;

    const bandLevel = sayi(senaryoBilgisi.bandLevel, yon === 'LONG' ? sayi(senaryoBilgisi.altBand) : sayi(senaryoBilgisi.ustBand));
    const ortaBand = sayi(senaryoBilgisi.ortaBand);
    const bandFarkYuzde = sayi(senaryoBilgisi.bandFarkYuzde);
    const bandGenisligiYuzde = sayi(senaryoBilgisi.bandGenisligiYuzde);

    const temasMesafesi = Math.abs(bandFarkYuzde);
    const yakinlikLimiti = Math.max(0.01, sayi(ayarlar.proximityYuzdesi, 0.5));
    const bandTemasKalitesi = sinirla(100 - (temasMesafesi / yakinlikLimiti) * 100);

    let ortaBandUzaklikYuzde = 0;
    if (ortaBand > 0) {
        const referans = yon === 'LONG' ? sayi(senaryoBilgisi.targetLevel, close) : sayi(senaryoBilgisi.targetLevel, close);
        ortaBandUzaklikYuzde = Math.abs(((ortaBand - referans) / ortaBand) * 100);
    }
    const ortaBandUzaklikKalitesi = sinirla((ortaBandUzaklikYuzde / 2) * 100); // %2 ve üzeri tam puan

    const fitilKalitesi = yon === 'LONG' ? altFitilPct : ustFitilPct;
    const tersFitil = yon === 'LONG' ? ustFitilPct : altFitilPct;
    const govdeKalitesi = 100 - Math.abs(govdePct - 45) * 1.25; // çok küçük ve aşırı büyük gövdeyi cezalandırır
    const tersFitilCezasi = Math.max(0, tersFitil - 35) * 0.30;

    let puan = 0;
    puan += fitilKalitesi * 0.24;
    puan += yonluKapanisGucu * 0.22;
    puan += sinirla(govdeKalitesi) * 0.18;
    puan += bandTemasKalitesi * 0.18;
    puan += ortaBandUzaklikKalitesi * 0.10;
    puan += sinirla((bandGenisligiYuzde / 2) * 100) * 0.08;
    puan -= tersFitilCezasi;

    puan = Math.round(sinirla(puan));
    const sinif = kaliteSinifi(puan);

    const arti = [];
    const eksi = [];
    if (fitilKalitesi >= 35) arti.push(yon === 'LONG' ? 'alt fitil güçlü' : 'üst fitil güçlü'); else eksi.push(yon === 'LONG' ? 'alt fitil zayıf' : 'üst fitil zayıf');
    if (yonluKapanisGucu >= 55) arti.push('kapanış yönlü güçlü'); else eksi.push('kapanış gücü zayıf');
    if (bandTemasKalitesi >= 70) arti.push('band teması temiz'); else eksi.push('band teması sınırda');
    if (ortaBandUzaklikYuzde >= 1) arti.push('orta banda mesafe var'); else eksi.push('orta banda yakın');
    if (govdePct >= 20 && govdePct <= 65) arti.push('gövde dengeli'); else eksi.push('gövde dengesiz');

    return {
        puan,
        sinif,
        metin: `${puan}/100 ${sinif}`,
        senaryo,
        govdePct: yuvarla(govdePct, 2),
        ustFitilPct: yuvarla(ustFitilPct, 2),
        altFitilPct: yuvarla(altFitilPct, 2),
        kapanisKonumu: yuvarla(kapanisKonumu, 2),
        kapanisGucu: yuvarla(yonluKapanisGucu, 2),
        bandTemasKalitesi: yuvarla(bandTemasKalitesi, 2),
        bandFarkYuzde: yuvarla(bandFarkYuzde, 4),
        ortaBandUzaklikYuzde: yuvarla(ortaBandUzaklikYuzde, 4),
        bandGenisligiYuzde: yuvarla(bandGenisligiYuzde, 4),
        arti,
        eksi,
        detay: `Gövde %${govdePct.toFixed(1)} | ÜstFitil %${ustFitilPct.toFixed(1)} | AltFitil %${altFitilPct.toFixed(1)} | KapanışGücü %${yonluKapanisGucu.toFixed(1)} | BandTemas %${bandTemasKalitesi.toFixed(1)} | OrtaUzaklık %${ortaBandUzaklikYuzde.toFixed(2)}`
    };
}

function ortakAlanlar(girisAnalizi = {}, pos = {}) {
    const kalite = girisAnalizi.pusuKalite || {};
    const mum = girisAnalizi.pusuMumu || {};
    return {
        zaman: new Date().toISOString(),
        symbol: pos.sym || girisAnalizi.symbol || '',
        yon: pos.yon || girisAnalizi.yon || '',
        senaryo: kalite.senaryo || girisAnalizi.senaryo || '',
        kalitePuan: kalite.puan ?? '',
        kaliteSinif: kalite.sinif || '',
        govdeOrani: kalite.govdePct ?? '',
        ustFitilOrani: kalite.ustFitilPct ?? '',
        altFitilOrani: kalite.altFitilPct ?? '',
        kapanisGucu: kalite.kapanisGucu ?? kalite.kapanisKonumu ?? '',
        bandTemasKalitesi: kalite.bandTemasKalitesi ?? '',
        bandFarkYuzde: kalite.bandFarkYuzde ?? '',
        ortaBandUzaklikYuzde: kalite.ortaBandUzaklikYuzde ?? '',
        bandGenisligiYuzde: kalite.bandGenisligiYuzde ?? '',
        pusuOpen: mum.open ?? '',
        pusuHigh: mum.high ?? '',
        pusuLow: mum.low ?? '',
        pusuClose: mum.close ?? '',
        pusuSayaci: girisAnalizi.pusuSayaci ?? '',
        sanalOrderId: pos.sanalOrderId || '',
        stUyumlu: girisAnalizi.superTrendEtki?.uyumlu ?? '',
        stYasMum: girisAnalizi.superTrendEtki?.yasMum ?? '',
        stMesafeYuzde: girisAnalizi.superTrendEtki?.mesafeYuzde ?? '',
        stKaynak: girisAnalizi.superTrendEtki?.kaynak || girisAnalizi.stKaynak || '',
        stDurum: girisAnalizi.superTrendEtki?.durum || '',
        stEtkiPuani: girisAnalizi.superTrendEtki?.puan ?? ''
    };
}

function islemAcilisKaydet(girisAnalizi, posBilgi = {}) {
    const kayit = {
        kayitTipi: 'ACILIS',
        ...ortakAlanlar(girisAnalizi, posBilgi),
        girisFiyati: posBilgi.girisFiyati || girisAnalizi?.girisFiyati || '',
        cikisFiyati: '',
        sonuc: 'ACIK',
        kapanisSebebi: '',
        fiyatKarYuzdesi: '',
        netKarZarar: '',
        netPozisyonYuzdesi: '',
        netMarjinYuzdesi: '',
        tutmaSuresiMs: ''
    };
    kayitYaz(kayit);
}

function islemKapanisKaydet(pos, sonuc = {}) {
    const girisAnalizi = pos.girisAnalizi || {};
    const kayit = {
        kayitTipi: 'KAPANIS',
        ...ortakAlanlar(girisAnalizi, pos),
        girisFiyati: pos.girisFiyati || '',
        cikisFiyati: sonuc.kapanisFiyati || '',
        sonuc: sonuc.sonuc || '',
        kapanisSebebi: sonuc.kapanisSebebi || '',
        fiyatKarYuzdesi: sonuc.fiyatKarYuzdesi ?? '',
        netKarZarar: sonuc.netKarZarar ?? '',
        netPozisyonYuzdesi: sonuc.netPozisyonYuzdesi ?? '',
        netMarjinYuzdesi: sonuc.netMarjinYuzdesi ?? '',
        tutmaSuresiMs: pos.acilisZamani ? Date.now() - Number(pos.acilisZamani) : ''
    };
    kayitYaz(kayit);
}

module.exports = {
    hesapla,
    islemAcilisKaydet,
    islemKapanisKaydet,
    dosyalar: { JSONL_FILE, CSV_FILE }
};
