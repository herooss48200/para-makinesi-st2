'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-RENKO-ENTRY-EXIT-EVOLUTION',
    kod: 'AGROS ST2 v6.7.0 — ONLINE ADAPTIVE ATR EXIT & PRIORITY TELEGRAM FINAL',
    botSurumu: '6.7.0-ONLINE-ADAPTIVE-ATR-EXIT-PRIORITY-TELEGRAM',
    stratejiSurumu: '1.0.25',
    yayinTarihi: '29.07.2026',
    ortam: Object.freeze({ emirModu: 'SANAL' })
});

function kisaOzet() {
    return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`;
}

function telegramOzet() {
    const mod = versiyon.ortam?.emirModu || 'BILINMIYOR';
    return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`;
}

function detayliOzet() {
    return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() };
}

module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
