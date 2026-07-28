'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-RENKO-ENTRY-EXIT-EVOLUTION',
    kod: 'AGROS ST2 v6.3.7 — PREMIER READINESS & PUSU DEDUPE FINAL',
    botSurumu: '6.3.7-PREMIER-READINESS-PUSU-DEDUPE-FINAL',
    stratejiSurumu: '1.0.22',
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
