const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'ACCOUNTING-CLASSIFICATION-REPAIR',
    kod: 'AWS Candidate v5.0.5-ACCOUNTING-CLASSIFICATION-REPAIR',
    botSurumu: '5.0.5-ACCOUNTING-CLASSIFICATION-REPAIR',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '20.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
