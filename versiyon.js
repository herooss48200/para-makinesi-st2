const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'GOLDEN-FULL-DNA-LAB-CHAMPION-BRIDGE',
    kod: 'AWS Candidate v4.7.0-GOLDEN-FULL-DNA-LAB-CHAMPION-BRIDGE',
    botSurumu: '4.7.0-GOLDEN-FULL-DNA-LAB-CHAMPION-BRIDGE',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '19.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
