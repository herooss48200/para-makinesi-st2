'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.12.2 FINAL: Golden Renko giriş zinciri + öğrenilmiş Entry Evolution canlı yetkisi.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'GOLDEN-RENKO-FINAL-WILLIAMS-SHADOW',
    kod: 'AGROS ST2 v6.12.2 — GOLDEN RENKO FINAL & WILLIAMS CYCLE SHADOW',
    botSurumu: '6.12.2-GOLDEN-RENKO-FINAL-WILLIAMS-SHADOW',
    stratejiSurumu: '1.0.37',
    yayinTarihi: '05.08.2026',
    ortam: Object.freeze({ emirModu: 'GERCEK_FAIL_CLOSED' })
});

function kisaOzet() {
    return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`;
}
function telegramOzet() {
    const mod = versiyon.ortam?.emirModu || 'BILINMIYOR';
    return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`;
}
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
