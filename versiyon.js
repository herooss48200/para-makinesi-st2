'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.12.1: çekirdek-önce piyasa ısınması + ilerleme kanıtı; ST2/ST1 giriş kurgusu korunur.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'CORE-FIRST-WARMUP-ST1-GATED-RENKO',
    kod: 'AGROS ST2 v6.12.1 — CORE-FIRST STARTUP WARMUP & ST1 GATED RENKO',
    botSurumu: '6.12.1-CORE-FIRST-WARMUP-ST1-GATED-RENKO',
    stratejiSurumu: '1.0.36',
    yayinTarihi: '04.08.2026',
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
