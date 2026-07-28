'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-RENKO-ENTRY-EXIT-EVOLUTION',
    kod: 'AGROS ST2 v6.5.0 — MFE CAPTURE & RENKO TAKEOVER EVOLUTION FINAL',
    botSurumu: '6.5.0-MFE-CAPTURE-TAKEOVER-EVOLUTION',
    stratejiSurumu: '1.0.24',
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
