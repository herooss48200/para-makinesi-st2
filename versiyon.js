'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-RENKO-ENTRY-EXIT-EVOLUTION',
    kod: 'AGROS ST2 v6.4.0 — RESTART MEMORY & TELEGRAM TRUTH FINAL',
    botSurumu: '6.4.0-RESTART-MEMORY-TELEGRAM-TRUTH',
    stratejiSurumu: '1.0.23',
    yayinTarihi: '28.07.2026',
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
