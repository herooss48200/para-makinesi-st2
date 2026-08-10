'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.13.5-R20: 30sn canlı panel teslimi generic bulk kuyruğundan ayrıldı; panel direct lane + teslim telemetrisi. CONFIRMED pusu fiyatı dönüş öncesi 0 göstermez.
// R4'e kadar canlıda kanıtlanan market-data motoru geri yüklendi; doğru telemetri raporu korunur.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R20-LIVE-PANEL-DIRECT-ENTRY-TRUTH-FINAL',
    kod: 'AGROS ST2 v6.13.5-R20 — LIVE PANEL DIRECT & ENTRY TRUTH FINAL',
    botSurumu: '6.13.5-R20-LIVE-PANEL-DIRECT-ENTRY-TRUTH-FINAL',
    stratejiSurumu: '1.0.39',
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
