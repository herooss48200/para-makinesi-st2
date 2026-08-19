'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R31-MTF-LIVE-STRUCT-STOP',
    kod: 'AGROS ST2 v6.19.0-R31 — MTF LIVE / STRUCTURAL 0.25T STOP / FALSE-BRICK HARDENING',
    botSurumu: '6.19.0-R31-MTF-LIVE-15M-30M-1H-2H-4H-STRUCT025T',
    stratejiSurumu: '1.5.0',
    yayinTarihi: '19.08.2026',
    ortam: Object.freeze({ emirModu: 'GERCEK_FAIL_CLOSED' })
});
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod=versiyon.ortam?.emirModu||'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet:kisaOzet(), telegramOzet:telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
