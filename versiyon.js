'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R26-CORE-ONLY-N5-20SLOT',
    kod: 'AGROS ST2 v6.14.0-R26 — CORE ONLY / PHYSICAL PRUNE / STARTUP CPU ISOLATION',
    botSurumu: '6.14.1-R26-CORE-PHASED-STARTUP-N5-20SLOT-20USDT',
    stratejiSurumu: '1.0.50',
    yayinTarihi: '16.08.2026',
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
