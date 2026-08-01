'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.10.6: manuel kapanış auto-rearm + güvenli taban sonrası runner ekonomi onarımı.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-MANUAL-CLOSE-AUTO-REARM-PROFIT-ECONOMY',
    kod: 'AGROS ST2 v6.10.6 — MANUAL CLOSE AUTO-REARM & PROFIT ECONOMY',
    botSurumu: '6.10.6-MANUAL-CLOSE-AUTO-REARM-PROFIT-ECONOMY',
    stratejiSurumu: '1.0.29',
    yayinTarihi: '01.08.2026',
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
