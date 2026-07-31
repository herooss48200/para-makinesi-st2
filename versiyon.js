'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.10.0: canlı risk ayarları + idempotent gerçek emir + Binance Algo Service koruması.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-RENKO-REAL-ORDER-EXECUTION-SAFETY',
    kod: 'AGROS ST2 v6.10.0 — REAL ORDER EXECUTION SAFETY',
    botSurumu: '6.10.0-REAL-ORDER-EXECUTION-SAFETY',
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
