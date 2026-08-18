'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R30.1-RENKO-RACE-COUNTER',
    kod: 'AGROS ST2 v6.18.1-R30.1 — RENKO ONLY / RACE COUNTER / 20 REAL SLOT',
    botSurumu: '6.18.1-R30.1-RENKO-RACE-COUNTER-20SLOT-20USDT',
    stratejiSurumu: '1.4.0',
    yayinTarihi: '18.08.2026',
    ortam: Object.freeze({ emirModu: 'GERCEK_FAIL_CLOSED' })
});
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod=versiyon.ortam?.emirModu||'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet:kisaOzet(), telegramOzet:telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
