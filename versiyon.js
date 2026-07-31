'use strict';

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-RENKO-FAST-CALIBRATION-READY-PREMIER-200-COIN',
    kod: 'AGROS ST2 v6.9.2 — FAST PREMIER CALIBRATION READY + 200 COIN',
    botSurumu: '6.9.2-FAST-CALIBRATION-READY-PREMIER-200-COIN',
    stratejiSurumu: '1.0.28',
    yayinTarihi: '31.07.2026',
    ortam: Object.freeze({ emirModu: 'SANAL' })
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
