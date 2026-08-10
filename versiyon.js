'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.13.5-R22.1: R22 15m authority korunur; DIRECT seçiliyken 15m CONFIRMED counterfactual canlı shadow öğrenir; panel funnel RAM truth; legacy 1m seçim yetkisi YOK.
// R4'e kadar canlıda kanıtlanan market-data motoru geri yüklendi; doğru telemetri raporu korunur.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R22.1-CONFIRMED-SHADOW-LIVE-LEARNING-OBSERVABILITY-FINAL',
    kod: 'AGROS ST2 v6.13.5-R22.1 — CONFIRMED SHADOW LIVE LEARNING + OBSERVABILITY FINAL',
    botSurumu: '6.13.5-R22.1-15M-CONFIRMED-SHADOW-LIVE-LEARNING-OBSERVABILITY-FINAL',
    stratejiSurumu: '1.0.41',
    yayinTarihi: '10.08.2026',
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
