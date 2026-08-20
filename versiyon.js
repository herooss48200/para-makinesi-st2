'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R31.3-15M-SYMMETRIC-ONUR-RECONCILE',
    kod: 'AGROS ST2 v6.19.3-R31.3 — 15M ONLY / 1M CONFIRM / ONUR SYMMETRIC HARD GUARD / POSITION-RISK SINGLE-FLIGHT / CRITICAL TRADE TELEGRAM',
    botSurumu: '6.19.3-R31.3-15M-SYMMETRIC-ONUR-RECONCILE',
    stratejiSurumu: '1.5.0',
    yayinTarihi: '20.08.2026',
    ortam: Object.freeze({ emirModu: 'GERCEK_FAIL_CLOSED' })
});
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod=versiyon.ortam?.emirModu||'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet:kisaOzet(), telegramOzet:telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
