'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.13.5-R24: R23.2 CONFIRMED giriş korunur; 10 gerçek slot x 20USDT; başlangıç SL -%2.50; +%2.50'de +%1.50 kilit ve sonra %1 geriden yüzdesel takip; Premier/Real/Shadow kasa canlı panelde ayrı görünür.
// R4'e kadar canlıda kanıtlanan market-data motoru geri yüklendi; doğru telemetri raporu korunur.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R24.2-UNIFIED-PERCENT-ECONOMY-10SLOT-20USDT-LIVE-COHORTS',
    kod: 'AGROS ST2 v6.13.5-R24.2 — UNIFIED PERCENT ECONOMY + 10 SLOT + 20USDT + LIVE COHORTS',
    botSurumu: '6.13.5-R24.2-UNIFIED-PERCENT-ECONOMY-10SLOT-20USDT-LIVE-COHORTS-POSTCLOSE-24H',
    stratejiSurumu: '1.0.47',
    yayinTarihi: '13.08.2026',
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
