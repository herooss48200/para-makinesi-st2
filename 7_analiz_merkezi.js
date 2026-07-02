const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const TRADES_JSONL = path.join(DATA_DIR, 'argos-trade-analiz.jsonl');
const TRADES_CSV = path.join(DATA_DIR, 'argos-trade-analiz.csv');

const CSV_BASLIK = [
    'kayitTipi', 'tradeId', 'zaman', 'symbol', 'yon', 'sonuc',
    'trendPeriyodu', 'pusuPeriyodu', 'sniperPeriyodu', 'superTrendYonu', 'stKaynak',
    'pusuKalitePuan', 'pusuKaliteSinif', 'senaryo',
    'girisFiyati', 'kapanisFiyati', 'sl', 'tp',
    'mfeYuzde', 'maeYuzde', 'enYuksekFiyat', 'enDusukFiyat',
    'fiyatKarYuzdesi', 'netKarZarar', 'komisyon', 'tutmaSuresiMs', 'kapanisSebebi'
];

function bosYonOzeti() {
    return {
        acilan: 0,
        kalite: { A: 0, B: 0, C: 0, D: 0, YOK: 0 },
        tp: 0,
        sl: 0,
        be: 0,
        netKarZarar: 0,
        toplamKomisyon: 0
    };
}

function bosAnalizOzeti() {
    return {
        surum: '2.1.14.2',
        sonGuncelleme: new Date().toISOString(),
        long: bosYonOzeti(),
        short: bosYonOzeti(),
        son10Islem: []
    };
}

function normalizeYon(yon) {
    return String(yon || '').toUpperCase() === 'SHORT' ? 'short' : 'long';
}

function normalizeSinif(sinif) {
    const s = String(sinif || '').toUpperCase();
    return ['A', 'B', 'C', 'D'].includes(s) ? s : 'YOK';
}

function analizOzetiHazirla() {
    if (!h.state.analizOzeti || typeof h.state.analizOzeti !== 'object') {
        h.state.analizOzeti = bosAnalizOzeti();
    }
    if (!h.state.analizOzeti.long) h.state.analizOzeti.long = bosYonOzeti();
    if (!h.state.analizOzeti.short) h.state.analizOzeti.short = bosYonOzeti();
    if (!Array.isArray(h.state.analizOzeti.son10Islem)) h.state.analizOzeti.son10Islem = [];
    for (const key of ['long', 'short']) {
        const o = h.state.analizOzeti[key];
        if (!o.kalite) o.kalite = { A: 0, B: 0, C: 0, D: 0, YOK: 0 };
        for (const k of ['A', 'B', 'C', 'D', 'YOK']) o.kalite[k] = Number(o.kalite[k] || 0);
        for (const k of ['acilan', 'tp', 'sl', 'be']) o[k] = Number(o[k] || 0);
        o.netKarZarar = Number(o.netKarZarar || 0);
        o.toplamKomisyon = Number(o.toplamKomisyon || 0);
    }
    return h.state.analizOzeti;
}

function klasorHazirla() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(TRADES_CSV)) fs.writeFileSync(TRADES_CSV, CSV_BASLIK.join(',') + '\n');
}

function csvDeger(v) {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function kayitYaz(kayit) {
    if (ayarlar.analizMerkeziAktif === false) return;
    try {
        klasorHazirla();
        fs.appendFileSync(TRADES_JSONL, JSON.stringify(kayit) + '\n');
        fs.appendFileSync(TRADES_CSV, CSV_BASLIK.map(k => csvDeger(kayit[k])).join(',') + '\n');
    } catch (err) {
        console.error(`❌ [ANALİZ MERKEZİ] Kayıt yazılamadı: ${err.message}`);
    }
}

function tradeIdUret(symbol, yon) {
    return `ARGOS-${Date.now()}-${symbol}-${yon}-${Math.floor(Math.random() * 10000)}`;
}

function ortakKayit(pos, ek = {}) {
    const g = pos.girisAnalizi || {};
    const kalite = g.pusuKalite || {};
    return {
        kayitTipi: ek.kayitTipi || '',
        tradeId: pos.tradeId || '',
        zaman: new Date().toISOString(),
        symbol: pos.sym || g.symbol || '',
        yon: pos.yon || g.yon || '',
        sonuc: ek.sonuc || '',
        trendPeriyodu: g.trendPeriyodu || ayarlar.trendPeriyodu || '',
        pusuPeriyodu: g.pusuPeriyodu || ayarlar.pusuPeriyodu || '',
        sniperPeriyodu: g.sniperPeriyodu || ayarlar.sniperPeriyodu || '',
        superTrendYonu: g.superTrendYonu || '',
        stKaynak: g.stKaynak || '',
        pusuKalitePuan: kalite.puan ?? '',
        pusuKaliteSinif: normalizeSinif(kalite.sinif),
        senaryo: kalite.senaryo || g.senaryo || '',
        girisFiyati: pos.girisFiyati || g.girisFiyati || '',
        kapanisFiyati: ek.kapanisFiyati ?? '',
        sl: pos.sl ?? '',
        tp: pos.tp ?? '',
        mfeYuzde: pos.journey?.mfeYuzde ?? '',
        maeYuzde: pos.journey?.maeYuzde ?? '',
        enYuksekFiyat: pos.journey?.enYuksekFiyat ?? '',
        enDusukFiyat: pos.journey?.enDusukFiyat ?? '',
        fiyatKarYuzdesi: ek.fiyatKarYuzdesi ?? '',
        netKarZarar: ek.netKarZarar ?? '',
        komisyon: ek.komisyon ?? '',
        tutmaSuresiMs: pos.acilisZamani ? Date.now() - Number(pos.acilisZamani) : '',
        kapanisSebebi: ek.kapanisSebebi || ''
    };
}

function acilisKaydet(pos) {
    if (!pos) return;
    analizOzetiHazirla();
    if (!pos.tradeId) pos.tradeId = tradeIdUret(pos.sym, pos.yon);
    const kalite = normalizeSinif(pos.girisAnalizi?.pusuKalite?.sinif);
    const yonKey = normalizeYon(pos.yon);
    const ozet = h.state.analizOzeti[yonKey];
    ozet.acilan += 1;
    ozet.kalite[kalite] = (ozet.kalite[kalite] || 0) + 1;
    h.state.analizOzeti.sonGuncelleme = new Date().toISOString();
    pos.journey = pos.journey || {
        baslangicZamani: Date.now(),
        enYuksekFiyat: pos.girisFiyati,
        enDusukFiyat: pos.girisFiyati,
        mfeYuzde: 0,
        maeYuzde: 0
    };
    kayitYaz(ortakKayit(pos, { kayitTipi: 'ACILIS', sonuc: 'ACIK' }));
}

function journeyGuncelle(pos, canliFiyat) {
    if (!pos || !Number.isFinite(Number(canliFiyat)) || !Number(pos.girisFiyati)) return;
    pos.journey = pos.journey || {
        baslangicZamani: pos.acilisZamani || Date.now(),
        enYuksekFiyat: pos.girisFiyati,
        enDusukFiyat: pos.girisFiyati,
        mfeYuzde: 0,
        maeYuzde: 0
    };
    const fiyat = Number(canliFiyat);
    pos.journey.enYuksekFiyat = Math.max(Number(pos.journey.enYuksekFiyat || fiyat), fiyat);
    pos.journey.enDusukFiyat = Math.min(Number(pos.journey.enDusukFiyat || fiyat), fiyat);
    const giris = Number(pos.girisFiyati);
    const highKar = pos.yon === 'LONG'
        ? ((pos.journey.enYuksekFiyat - giris) / giris) * 100
        : ((giris - pos.journey.enDusukFiyat) / giris) * 100;
    const lowZarar = pos.yon === 'LONG'
        ? ((pos.journey.enDusukFiyat - giris) / giris) * 100
        : ((giris - pos.journey.enYuksekFiyat) / giris) * 100;
    pos.journey.mfeYuzde = Number(Math.max(Number(pos.journey.mfeYuzde || 0), highKar).toFixed(4));
    pos.journey.maeYuzde = Number(Math.min(Number(pos.journey.maeYuzde || 0), lowZarar).toFixed(4));
}

function kapanisKaydet(pos, sonuc = {}) {
    if (!pos) return;
    const ozet = analizOzetiHazirla();
    const yonKey = normalizeYon(pos.yon);
    const yo = ozet[yonKey];
    const s = String(sonuc.sonuc || '').toUpperCase();
    if (s === 'TP') yo.tp += 1;
    else if (s === 'BE') yo.be += 1;
    else if (s === 'SL') yo.sl += 1;
    yo.netKarZarar += Number(sonuc.netKarZarar || 0);
    yo.toplamKomisyon += Number(sonuc.komisyon || 0);
    ozet.son10Islem.unshift({
        zaman: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
        symbol: pos.sym,
        yon: pos.yon,
        kalite: normalizeSinif(pos.girisAnalizi?.pusuKalite?.sinif),
        sonuc: s || 'KAPANDI',
        netKarZarar: Number(sonuc.netKarZarar || 0),
        mfeYuzde: pos.journey?.mfeYuzde ?? '',
        maeYuzde: pos.journey?.maeYuzde ?? ''
    });
    ozet.son10Islem = ozet.son10Islem.slice(0, 10);
    ozet.sonGuncelleme = new Date().toISOString();
    kayitYaz(ortakKayit(pos, {
        kayitTipi: 'KAPANIS',
        sonuc: s,
        kapanisFiyati: sonuc.kapanisFiyati,
        fiyatKarYuzdesi: sonuc.fiyatKarYuzdesi,
        netKarZarar: sonuc.netKarZarar,
        komisyon: sonuc.komisyon,
        kapanisSebebi: sonuc.kapanisSebebi
    }));
}

function basariYuzde(o) {
    const sonuc = Number(o.tp || 0) + Number(o.sl || 0);
    return sonuc > 0 ? ((Number(o.tp || 0) / sonuc) * 100).toFixed(1) : '0.0';
}

function kaliteMetni(o) {
    const k = o.kalite || {};
    return `A:${k.A || 0} B:${k.B || 0} C:${k.C || 0} D:${k.D || 0}${k.YOK ? ' YOK:' + k.YOK : ''}`;
}

function telegramOzetMetni() {
    const o = analizOzetiHazirla();
    const long = o.long;
    const short = o.short;
    const son10 = (o.son10Islem || []).slice(0, 10);
    const son10Metin = son10.length
        ? son10.map(x => `${x.sonuc === 'TP' ? '✅' : (x.sonuc === 'BE' ? '⚖️' : '❌')} ${x.symbol} ${x.yon} ${x.kalite} ${x.sonuc} | ${Number(x.netKarZarar || 0).toFixed(2)} USDT`).join('\n')
        : 'Henüz kapanan işlem yok';

    return `\n\n🧠 <b>ANALİZ MERKEZİ</b>\n` +
        `⏱️ TF: ST ${ayarlar.superTrendPeriyodu || ayarlar.trendPeriyodu} | Pusu ${ayarlar.pusuPeriyodu} | Sniper ${ayarlar.sniperPeriyodu}\n` +
        `🟢 <b>LONG:</b> Açılan ${long.acilan} | ${kaliteMetni(long)} | TP:${long.tp} SL:${long.sl} BE:${long.be} | Başarı %${basariYuzde(long)} | Net ${Number(long.netKarZarar || 0).toFixed(2)}\n` +
        `🔴 <b>SHORT:</b> Açılan ${short.acilan} | ${kaliteMetni(short)} | TP:${short.tp} SL:${short.sl} BE:${short.be} | Başarı %${basariYuzde(short)} | Net ${Number(short.netKarZarar || 0).toFixed(2)}\n\n` +
        `📜 <b>SON 10 KAPANAN İŞLEM</b>\n${son10Metin}`;
}

module.exports = {
    bosAnalizOzeti,
    analizOzetiHazirla,
    acilisKaydet,
    journeyGuncelle,
    kapanisKaydet,
    telegramOzetMetni,
    dosyalar: { TRADES_JSONL, TRADES_CSV }
};
