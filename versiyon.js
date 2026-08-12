'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.13.5-R23.2: CONFIRMED giriş ilk kapanmış 15m reversal + fresh fractional pencere kullanır; legacy 3-tuğla expiry bypass; pusu Renko box dondurulur; geç hareket kovalanmaz. Long-life/10USDT/24h post-close korunur.
// R4'e kadar canlıda kanıtlanan market-data motoru geri yüklendi; doğru telemetri raporu korunur.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R23.2-CONFIRMED-FIRST-REVERSAL-FRESH-WINDOW-LONG-LIFE-FINAL',
    kod: 'AGROS ST2 v6.13.5-R23.2 — CONFIRMED FIRST REVERSAL + FRESH WINDOW + LONG LIFE + 10USDT FINAL',
    botSurumu: '6.13.5-R23.2-CONFIRMED-FIRST-REVERSAL-FRESH-WINDOW-10USDT-POSTCLOSE-24H-FINAL',
    stratejiSurumu: '1.0.45',
    yayinTarihi: '12.08.2026',
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
