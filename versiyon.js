'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R30-RENKO-ONLY-20-SLOT',
    kod: 'AGROS ST2 v6.18.0-R30 — RENKO ONLY / PREMIER-N5 / 20 REAL SLOT / CLEAN TELEGRAM',
    botSurumu: '6.18.0-R30-RENKO-ONLY-20SLOT-20USDT',
    stratejiSurumu: '1.4.0',
    yayinTarihi: '18.08.2026',
    ortam: Object.freeze({ emirModu: 'GERCEK_FAIL_CLOSED' })
});
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod=versiyon.ortam?.emirModu||'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet:kisaOzet(), telegramOzet:telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
