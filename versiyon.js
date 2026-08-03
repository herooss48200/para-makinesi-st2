'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.11.2: doğrudan ayarlı kâr tabanı ve Renko aktivasyonu; iki kat/kademe çarpanı yoktur.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-DIRECT-PROFIT-FLOOR-TWO-SLOT',
    kod: 'AGROS ST2 v6.11.2 — DIRECT PROFIT FLOOR & TWO SLOT',
    botSurumu: '6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT',
    stratejiSurumu: '1.0.34',
    yayinTarihi: '03.08.2026',
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
