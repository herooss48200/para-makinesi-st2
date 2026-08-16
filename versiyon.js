'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.13.5-R25.8: dedicated startup worker/socket eşlendi; cancellable symbol deadline orphan request bırakmaz; 10sn liveness kanıtı. R25.3 Premier/N5 ve R25 stop ekonomisi korunur; MACD SHADOW-only.
// R25.1: R23.2 CONFIRMED giriş korunur; 10 gerçek slot x 20USDT; 4 USDT marjin x exact 5x; başlangıç SL -%2.50; +%1.50'de +%1.00 kilit, sonra %0.50 geriden 0.50 puan adım; MACD replay-kanıtlı 1m/15m SHADOW cohort; canlı emir/stop yetkisi YOK.
// R4'e kadar canlıda kanıtlanan market-data motoru geri yüklendi; doğru telemetri raporu korunur.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R25.8-STARTUP-CANCELLABLE-LIVENESS-20SLOT',
    kod: 'AGROS ST2 v6.13.5-R25.8 — STARTUP CANCELLABLE LIVENESS + R25.4 CORE LIVENESS + R25.3 PREMIER RECOVERY + 20 SLOT × 20USDT',
    botSurumu: '6.13.5-R25.8-STARTUP-CANCELLABLE-LIVENESS-N5-20SLOT-20USDT',
    stratejiSurumu: '1.0.50',
    yayinTarihi: '16.08.2026',
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
