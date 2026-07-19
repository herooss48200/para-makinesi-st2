const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'SHARED-REQUEST-QUEUE',
    kod: 'AWS Candidate v5.0.2-SHARED-REQUEST-QUEUE',
    botSurumu: '5.0.2-SHARED-REQUEST-QUEUE',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '20.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
