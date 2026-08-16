'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R27-DUAL-REAL-RENKO-HA-10X10',
    kod: 'AGROS ST2 v6.15.0-R27 — DUAL REAL / RENKO vs HEIKIN ASHI / 10+10',
    botSurumu: '6.15.0-R27-DUAL-REAL-RENKO-HA-10X10-20USDT',
    stratejiSurumu: '1.1.0',
    yayinTarihi: '17.08.2026',
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
