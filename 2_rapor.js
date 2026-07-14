require('dotenv').config();
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const learningValidation = require('./20_learning_validation.js');

const TELEGRAM_GUVENLI_LIMIT = 3600;
let sonLearningValidationKapanan = null;

function sayi(n, basamak = 2) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(basamak) : '0.00';
}

function yuzde(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : '0.00';
}

function pozisyonYon(p) {
    return String(p.yon || p.side || p.direction || '').toUpperCase();
}

function pozisyonSembol(p) {
    return p.sym || p.sembol || p.symbol || p.coin || p.girisAnalizi?.symbol || p.blackboxAcilis?.symbol || 'BILINMIYOR';
}

function pozisyonGiris(p) {
    return Number(p.girisFiyati || p.entryPrice || p.giris || p.entry || 0);
}

function pozisyonFiyat(p) {
    const sembol = pozisyonSembol(p);
    return Number(
        h.state.canliFiyatlar[sembol] ||
        p.sonFiyat ||
        p.anlikFiyat ||
        p.currentPrice ||
        p.fiyat ||
        pozisyonGiris(p)
    );
}

function pozisyonKarYuzde(p) {
    if (Number.isFinite(Number(p.anlikKarYuzde))) return Number(p.anlikKarYuzde);
    if (Number.isFinite(Number(p.karYuzde))) return Number(p.karYuzde);
    if (Number.isFinite(Number(p.pnlYuzde))) return Number(p.pnlYuzde);

    const giris = pozisyonGiris(p);
    const fiyat = pozisyonFiyat(p);
    const yon = pozisyonYon(p);

    if (!giris || !fiyat) return 0;

    if (yon === 'SHORT') return ((giris - fiyat) / giris) * 100;
    return ((fiyat - giris) / giris) * 100;
}

function pozisyonKorunanKar(p) {
    if (Number.isFinite(Number(p.korunanKarYuzdesi))) return Number(p.korunanKarYuzdesi);
    if (Number.isFinite(Number(p.korunanKarYuzde))) return Number(p.korunanKarYuzde);
    if (Number.isFinite(Number(p.korunanKar))) return Number(p.korunanKar);

    const giris = pozisyonGiris(p);
    const sl = Number(p.sanalStop || p.stopLoss || p.sl || p.stop || 0);
    const yon = pozisyonYon(p);

    if (!giris || !sl) return null;

    if (yon === 'SHORT') return ((giris - sl) / giris) * 100;
    return ((sl - giris) / giris) * 100;
}

function pozisyonKademe(p) {
    return p.tpKademe || p.kademe || p.sanalTpKademe || p.sonKademe || 0;
}

function pozisyonSatiri(p) {
    const sembol = pozisyonSembol(p);
    const yon = pozisyonYon(p);
    const kar = pozisyonKarYuzde(p);
    const korunan = pozisyonKorunanKar(p);
    const kademe = pozisyonKademe(p);

    let satir = `${sembol} ${yon} ${kar >= 0 ? '+' : ''}%${yuzde(kar)}`;

    if (korunan !== null) {
        satir += ` | SL ${korunan >= 0 ? '+' : ''}%${yuzde(korunan)}`;
    }

    if (kademe) {
        satir += ` | K${kademe}`;
    }

    return satir;
}

function sonKapananSatiri(islem) {
    if (!islem) return '';

    const sembol = islem.sym || islem.sembol || islem.symbol || 'BILINMIYOR';
    const yon = String(islem.yon || islem.side || '').toUpperCase();
    const sonuc = islem.sonuc || islem.kapanisSebebi || islem.sebep || '-';

    const net = Number(
        islem.netKarZarar ??
        islem.netPnl ??
        islem.netPNL ??
        islem.pnl ??
        0
    );

    const yonText = yon ? `${yon} ` : '';
    return `${sembol} ${yonText}${sonuc} ${net >= 0 ? '+' : ''}${sayi(net, 2)} USDT`;
}

function kisalt(metin, limit = TELEGRAM_GUVENLI_LIMIT) {
    const text = String(metin || '');
    if (text.length <= limit) return text;

    // HTML etiketlerinin ortasında kesilen mesaj Telegram tarafından reddedilir.
    // Uzun canlı raporu önce düz metne çevirip sonra güvenli sınırda kesiyoruz.
    const duzMetin = text
        .replace(/<\/?pre>/g, '')
        .replace(/<\/?b>/g, '')
        .replace(/<\/?i>/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

    return duzMetin.slice(0, limit - 90) +
        `\n\n⚠️ Rapor güvenlik nedeniyle kısaltıldı.`;
}

function canliRaporMetniOlustur() {
    const s = h.state.basariOzeti || {};
    const aktifler = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
    const pusuDegerleri = Object.values(h.state.pusuListesi || {});
    const analizOzeti = h.state.analizOzeti || {};

    const tp = Number(s.tp || 0);
    const sl = Number(s.sl || 0);
    const be = Number(s.be || 0);

    const sonucToplam = tp + sl;
    const toplamKapanan = tp + sl + be;
    const basariOrani = sonucToplam > 0 ? (tp / sonucToplam) * 100 : 0;

    const longAktif = aktifler.filter(p => pozisyonYon(p) === 'LONG').length;
    const shortAktif = aktifler.filter(p => pozisyonYon(p) === 'SHORT').length;

    const longPusu = pusuDegerleri.filter(x => String(x.yon || '').toUpperCase() === 'LONG').length;
    const shortPusu = pusuDegerleri.filter(x => String(x.yon || '').toUpperCase() === 'SHORT').length;

    const sirali = [...aktifler].sort((a, b) => pozisyonKarYuzde(b) - pozisyonKarYuzde(a));
    const enKarli = sirali.slice(0, 5);
    const enRiskli = [...sirali].reverse().slice(0, 5);

    const sonKapananlar = Array.isArray(analizOzeti.son10Islem)
        ? analizOzeti.son10Islem.slice(0, 5)
        : [];

    const saat = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const mod = ayarlar.sanalEmirModu ? 'SANAL' : 'BINANCE';

    let mesaj = '';

    mesaj += `📊 <b>PARA MAKİNESİ CANLI PORTFÖY</b>\n`;
    mesaj += `🕒 ${saat} | ${mod}\n`;
    mesaj += `━━━━━━━━━━━━━━━━━━\n`;
    mesaj += `📦 <b>Aktif Pozisyon:</b> ${aktifler.length} / ${ayarlar.maxPozisyonSayisi || '-'}\n`;
    mesaj += `🟢 Long: ${longAktif} | 🔴 Short: ${shortAktif}\n`;
    mesaj += `🎯 <b>Aktif Pusu:</b> ${pusuDegerleri.length} | 🟢 ${longPusu} | 🔴 ${shortPusu}\n`;
    mesaj += `🔄 <b>Toplam Açılan:</b> ${s.toplamAcilanEmir || 0}\n`;
    mesaj += `✅ TP: ${tp} | ❌ SL: ${sl} | ⚖️ BE: ${be} | Kapanan: ${toplamKapanan}\n`;
    mesaj += `🏅 <b>Başarı:</b> %${yuzde(basariOrani)}\n`;
    mesaj += `💸 <b>Komisyon:</b> ${sayi(s.toplamKomisyon || 0, 4)} USDT\n`;
    mesaj += `👑 <b>Net Kasa:</b> ${sayi(s.netKarZarar || 0, 4)} USDT\n`;


    mesaj += `\n🏆 <b>En Karlı 5</b>\n`;
    mesaj += enKarli.length
        ? enKarli.map(pozisyonSatiri).join('\n')
        : `Aktif pozisyon yok`;

    mesaj += `\n\n⚠️ <b>En Riskli 5</b>\n`;
    mesaj += enRiskli.length
        ? enRiskli.map(pozisyonSatiri).join('\n')
        : `Aktif pozisyon yok`;

    if (sonKapananlar.length) {
        mesaj += `\n\n📌 <b>Son Kapanan 5</b>\n`;
        mesaj += sonKapananlar.map(sonKapananSatiri).filter(Boolean).join('\n');
    }

    mesaj += `\n━━━━━━━━━━━━━━━━━━\n`;
    mesaj += `<i>Öğrenme, Strategy Lab, BlackBox ve Heat Map analizleri ayrı raporlanır.</i>`;

    return kisalt(mesaj);
}

function kapananIslemSayisi() {
    const s = h.state.basariOzeti || {};
    return Number(s.tp || 0) + Number(s.sl || 0) + Number(s.be || 0);
}

async function learningValidationRaporuGonderGerekirse(oneCikar = false) {
    if (!oneCikar) return;

    const kapanan = kapananIslemSayisi();
    const ilkCalisma = sonLearningValidationKapanan === null;
    const yeniKapanisVar = !ilkCalisma && kapanan !== sonLearningValidationKapanan;

    // Başlangıçta mevcut öğrenme durumunu bir kez göster.
    // Sonrasında yalnızca TP/SL/BE sayacı değiştiğinde yeni dashboard gönder.
    // Stop güncellemeleri ve Restart Gap muhasebe kapanışları rapor spam'i üretmez.
    if (!ilkCalisma && !yeniKapanisVar) return;

    sonLearningValidationKapanan = kapanan;

    try {
        const model = learningValidation.buildLearningValidationModel();
        const mesaj = learningValidation.telegramOzetMetni(model);
        await h.telegramMesajGonder(mesaj);
        console.log(`🧠 [AGROS INTELLIGENCE] Telegram raporu gönderildi | Kapanan: ${kapanan}`);
    } catch (err) {
        console.error('❌ [AGROS INTELLIGENCE RAPOR HATASI]:', err.message);
    }
}

async function raporGonder(oneCikar = false) {
    try {
        const mesaj = canliRaporMetniOlustur();

        if (ayarlar.canliRaporAktif) {
            await h.telegramCanliRaporGuncelle(mesaj, oneCikar);
        } else if (oneCikar) {
            await h.telegramMesajGonder(mesaj);
        }

        await learningValidationRaporuGonderGerekirse(oneCikar);
    } catch (err) {
        console.error('❌ Rapor hazırlanırken hata oluştu:', err.message);
    }
}

module.exports = { raporGonder, canliRaporMetniOlustur, learningValidationRaporuGonderGerekirse };
