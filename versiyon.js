'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R28.1-HA-STRICT-3STAGE-FORMATION-VETO',
    kod: 'AGROS ST2 v6.16.1-R28.1 — HA STRICT 3-STAGE / CUP-HANDLE + BUTTERFLY + STRUCTURE VETO',
    botSurumu: '6.16.1-R28.1-HA-STRICT-3STAGE-FORMATION-VETO-10X10-20USDT',
    stratejiSurumu: '1.2.1',
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
