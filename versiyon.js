'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.13.5-R13: 30 sn canlı panel ritmi ağır Renko taramasından ve Telegram ağ tesliminden ayrıldı; latest-only panel worker + bounded retry.
// R4'e kadar canlıda kanıtlanan market-data motoru geri yüklendi; doğru telemetri raporu korunur.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'RENKO-ENTRY-CONFIRMATION-FULL-LIFECYCLE-SHADOW',
    kod: 'AGROS ST2 v6.13.5-R13 — CORE LOOP LIVENESS & ST1 SHADOW ISOLATION',
    botSurumu: '6.13.5-R13-CORE-LOOP-LIVENESS-ST1-SHADOW-ISOLATION',
    stratejiSurumu: '1.0.39',
    yayinTarihi: '07.08.2026',
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
