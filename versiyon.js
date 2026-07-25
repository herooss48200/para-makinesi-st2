const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'ST2-RENKO-ENTRY',
    kod: 'ST2 Candidate v5.6.1-ST2-RENKO-HISTORICAL-ENTRY-RECOVERY',
    botSurumu: '5.6.1-ST2-RENKO-HISTORICAL-ENTRY-RECOVERY',
    stratejiSurumu: '1.0.20',
    yayinTarihi: '25.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
