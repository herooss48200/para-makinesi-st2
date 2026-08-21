'use strict';

const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'R31.4-RECONCILE-SNAPSHOT-LIVENESS',
    kod: 'AGROS ST2 v6.19.4-R31.4 — 15M ONLY / 1M CONFIRM / ONUR SYMMETRIC HARD GUARD / POSITION SNAPSHOT LIVENESS / ASYNC CLOSE FINALIZE',
    botSurumu: '6.19.4-R31.4-RECONCILE-SNAPSHOT-LIVENESS',
    stratejiSurumu: '1.5.0',
    yayinTarihi: '21.08.2026',
    ortam: Object.freeze({ emirModu: 'GERCEK_FAIL_CLOSED' })
});
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod=versiyon.ortam?.emirModu||'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet:kisaOzet(), telegramOzet:telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
