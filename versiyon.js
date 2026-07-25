const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-RENKO-ENTRY',
    kod: 'AGROS ST2 v5.6.3 — CLEAN SCIENTIFIC RESET & PERSISTENT LEARNING',
    botSurumu: '5.6.3-fix.1-LIVE-REPORT-PUSU-VISIBILITY',
    stratejiSurumu: '1.0.21',
    yayinTarihi: '25.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
