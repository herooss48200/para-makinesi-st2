'use strict';
// Compatibility marker: CALIBRATION-READY; gerçek emir için aktif kalibrasyon ayrıca zorunludur.
// v6.12.0: ST2 Renko pusu + ST1 giriş kapısı + referans tuğla taze kırılımı; yönsel canlı rapor.

// v6.8.4 compatibility marker: 6.8.4-MINIMAL-TELEGRAM-OPERATION-PROOF
const versiyon = Object.freeze({
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST1-GATED-RENKO-ENTRY-DIRECTIONAL-REPORT',
    kod: 'AGROS ST2 v6.12.0 — ST1 GATED RENKO ENTRY & DIRECTIONAL REPORT',
    botSurumu: '6.12.0-ST1-GATED-RENKO-DIRECTIONAL-REPORT',
    stratejiSurumu: '1.0.35',
    yayinTarihi: '04.08.2026',
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
