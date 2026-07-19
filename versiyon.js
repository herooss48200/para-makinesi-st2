const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'LAB-PREMIER-FAMILY-REPORT-PATH-CLOSED',
    kod: 'AWS Candidate v4.8.0-fix.1-FAMILY-REPORT-PATH-CLOSED',
    botSurumu: '4.8.0-fix.1-FAMILY-REPORT-PATH-CLOSED',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '19.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
