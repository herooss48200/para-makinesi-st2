'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.13.5-R3: K0.5 +%0.25→+%0.20 erken ekonomi; K1 +%0.50→+%0.40 güvenli taban korunur; başarı-öncelikli CONFIRMED + nearest-step real quantity.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'RENKO-ENTRY-CONFIRMATION-FULL-LIFECYCLE-SHADOW',
    kod: 'AGROS ST2 v6.13.5-R3 — EARLY ECONOMY + SAFE FLOOR + SUCCESS CONFIRMED + REAL SIZE',
    botSurumu: '6.13.5-R3-EARLY-ECONOMY-SAFE-FLOOR-SUCCESS-CONFIRMED-REAL-SIZE',
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
