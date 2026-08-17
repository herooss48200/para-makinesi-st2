'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R29.2-HA-FORMATION-OBSERVABILITY',
    kod: 'AGROS ST2 v6.17.2-R29.2 — HA FORMATION OBSERVABILITY / CUP-HANDLE LEVELS + BUTTERFLY XABCD PROOF + BB REGIME + 3M ST FINAL GATE',
    botSurumu: '6.17.2-R29.2-HA-FORMATION-PROOF-10X10-20USDT',
    stratejiSurumu: '1.3.2',
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
