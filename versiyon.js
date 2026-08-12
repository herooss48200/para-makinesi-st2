'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.13.5-R23.1: Tüm yeni gerçek girişler CONFIRMED; pusu anı kararı dondurulur. CONFIRMED long-life erken +%0.25 tabanını bypass eder; 10 USDT notional; 24h post-close öğrenme korunur.
// R4'e kadar canlıda kanıtlanan market-data motoru geri yüklendi; doğru telemetri raporu korunur.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R23.1-CONFIRMED-FROZEN-LONG-LIFE-TARGET1-POSTCLOSE-24H-FINAL',
    kod: 'AGROS ST2 v6.13.5-R23.1 — CONFIRMED FROZEN + LONG LIFE + TARGET-1 + 10USDT + POST-CLOSE 24H FINAL',
    botSurumu: '6.13.5-R23.1-CONFIRMED-FROZEN-LONG-LIFE-10USDT-POSTCLOSE-24H-FINAL',
    stratejiSurumu: '1.0.44',
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
