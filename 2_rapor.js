require('dotenv').config();
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const analizMerkezi = require('./7_analiz_merkezi.js');
const blackbox = require('./8_blackbox.js');

function yuzde(n) {
    return Number.isFinite(n) ? n.toFixed(1) : '0.0';
}

function canliRaporMetniOlustur() {
    const s = h.state.basariOzeti;
    const tp = s.tp || 0;
    const sl = s.sl || 0;
    const be = s.be || 0;
    const sonucToplam = tp + sl;
    const basariOrani = sonucToplam > 0 ? (tp / sonucToplam) * 100 : 0;
    const pusuDegerleri = Object.values(h.state.pusuListesi);
    const pusuSayisi = pusuDegerleri.length;
    const longPusu = pusuDegerleri.filter(x => x.yon === 'LONG').length;
    const shortPusu = pusuDegerleri.filter(x => x.yon === 'SHORT').length;
    const kaliteOlanlar = pusuDegerleri.filter(x => x.pusuKalite && Number.isFinite(Number(x.pusuKalite.puan)));
    const kaliteOrt = kaliteOlanlar.length ? kaliteOlanlar.reduce((t, x) => t + Number(x.pusuKalite.puan || 0), 0) / kaliteOlanlar.length : 0;
    const kaliteA = kaliteOlanlar.filter(x => x.pusuKalite.sinif === 'A').length;
    const kaliteB = kaliteOlanlar.filter(x => x.pusuKalite.sinif === 'B').length;
    const kaliteC = kaliteOlanlar.filter(x => x.pusuKalite.sinif === 'C').length;
    const kaliteD = kaliteOlanlar.filter(x => x.pusuKalite.sinif === 'D').length;
    const saat = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const mod = ayarlar.sanalEmirModu ? 'SANAL' : 'BINANCE';

    return `📊 <b>PARA MAKİNESİ CANLI RAPORU</b>\n` +
        `(${saat})\n` +
        `--------------------------------\n` +
        `🧪 <b>Emir Modu:</b> ${mod}\n` +
        `📦 <b>Aktif Pozisyon:</b> ${h.state.aktifPozisyonlar.length} / ${ayarlar.maxPozisyonSayisi}\n` +
        `🔄 <b>Toplam Açılan Emir:</b> ${s.toplamAcilanEmir || 0}\n` +
        `🎯 <b>Aktif Pusu:</b> ${pusuSayisi} | 🟢 Long: ${longPusu} | 🔴 Short: ${shortPusu}\n` +
        `🏅 <b>Pusu Kalitesi:</b> Ort: ${kaliteOlanlar.length ? kaliteOrt.toFixed(1) : 'YOK'} | A:${kaliteA} B:${kaliteB} C:${kaliteC} D:${kaliteD}\n\n` +
        `🎯 <b>BAŞARILI İŞLEMLER (TP):</b> ${tp}\n` +
        `   L 🟢 <b>Long:</b> ${s.longTp || 0} | 🔴 <b>Short:</b> ${s.shortTp || 0}\n\n` +
        `❌ <b>BAŞARISIZ İŞLEMLER (SL):</b> ${sl}\n` +
        `   L 🟢 <b>Long:</b> ${s.longSl || 0} | 🔴 <b>Short:</b> ${s.shortSl || 0}\n\n` +
        `⚖️ <b>BAŞABAŞ (NÖTR) DURUMU:</b> ${be}\n` +
        `🏅 <b>KASA BAŞARI ORANI:</b> %${yuzde(basariOrani)}\n` +
        `--------------------------------\n` +
        `💸 <b>TOPLAM KOMİSYON:</b> ${s.toplamKomisyon.toFixed(4)} USDT\n` +
        `👑 <b>NET KASA DURUMU:</b> ${s.netKarZarar.toFixed(4)} USDT` +
        analizMerkezi.telegramOzetMetni() +
        blackbox.telegramOzetMetni();
}

async function raporGonder(oneCikar = false) {
    try {
        const mesaj = canliRaporMetniOlustur();
        if (ayarlar.canliRaporAktif) {
            await h.telegramCanliRaporGuncelle(mesaj, oneCikar);
        } else if (oneCikar) {
            await h.telegramMesajGonder(mesaj);
        }
    } catch (err) {
        console.error('❌ Rapor hazırlanırken hata oluştu:', err.message);
    }
}

module.exports = { raporGonder, canliRaporMetniOlustur };
