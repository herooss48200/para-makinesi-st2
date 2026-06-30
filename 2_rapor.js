require('dotenv').config();
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

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
    const pusuSayisi = Object.keys(h.state.pusuListesi).length;
    const longPusu = Object.values(h.state.pusuListesi).filter(x => x.yon === 'LONG').length;
    const shortPusu = Object.values(h.state.pusuListesi).filter(x => x.yon === 'SHORT').length;
    const saat = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const mod = ayarlar.sanalEmirModu ? 'SANAL' : 'BINANCE';

    return `📊 <b>PARA MAKİNESİ CANLI RAPORU</b>\n` +
        `(${saat})\n` +
        `--------------------------------\n` +
        `🧪 <b>Emir Modu:</b> ${mod}\n` +
        `📦 <b>Aktif Pozisyon:</b> ${h.state.aktifPozisyonlar.length} / ${ayarlar.maxPozisyonSayisi}\n` +
        `🔄 <b>Toplam Açılan Emir:</b> ${s.toplamAcilanEmir || 0}\n` +
        `🎯 <b>Aktif Pusu:</b> ${pusuSayisi} | 🟢 Long: ${longPusu} | 🔴 Short: ${shortPusu}\n\n` +
        `🎯 <b>BAŞARILI İŞLEMLER (TP):</b> ${tp}\n` +
        `   L 🟢 <b>Long:</b> ${s.longTp || 0} | 🔴 <b>Short:</b> ${s.shortTp || 0}\n\n` +
        `❌ <b>BAŞARISIZ İŞLEMLER (SL):</b> ${sl}\n` +
        `   L 🟢 <b>Long:</b> ${s.longSl || 0} | 🔴 <b>Short:</b> ${s.shortSl || 0}\n\n` +
        `⚖️ <b>BAŞABAŞ (NÖTR) DURUMU:</b> ${be}\n` +
        `🏅 <b>KASA BAŞARI ORANI:</b> %${yuzde(basariOrani)}\n` +
        `--------------------------------\n` +
        `💸 <b>TOPLAM KOMİSYON:</b> ${s.toplamKomisyon.toFixed(4)} USDT\n` +
        `👑 <b>NET KASA DURUMU:</b> ${s.netKarZarar.toFixed(4)} USDT`;
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
