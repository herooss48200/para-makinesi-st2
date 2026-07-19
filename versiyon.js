const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'LAB-PREMIER-TRUE-LEAGUE-FINAL',
    kod: 'AWS Candidate v4.8.0-LAB-PREMIER-TRUE-LEAGUE-FINAL',
    botSurumu: '4.8.0-LAB-PREMIER-TRUE-LEAGUE-FINAL',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '19.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
