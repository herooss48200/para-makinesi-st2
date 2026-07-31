'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.9.4: canlı tutar/kaldıraç/marjin/pozisyon limiti ayarlar.js üzerinden yönetilir.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-RENKO-LIVE-CONFIGURABLE-RISK-PREMIER-200-COIN',
    kod: 'AGROS ST2 v6.9.4 — CONFIGURABLE LIVE RISK CONTROLS',
    botSurumu: '6.9.4-CONFIGURABLE-LIVE-RISK-PREMIER-200-COIN',
    stratejiSurumu: '1.0.28',
    yayinTarihi: '31.07.2026',
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
