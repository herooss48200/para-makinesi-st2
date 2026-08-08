'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.13.5-R4: R3 ekonomi/CONFIRMED/real-size korunur; restartta terminal Algo koruması taze kimlikle güvenli rearm edilir.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'RENKO-ENTRY-CONFIRMATION-FULL-LIFECYCLE-SHADOW',
    kod: 'AGROS ST2 v6.13.5-R4 — RESTART PROTECTION REARM',
    botSurumu: '6.13.5-R4-RESTART-PROTECTION-REARM',
    stratejiSurumu: '1.0.39',
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
