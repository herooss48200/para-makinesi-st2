const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'RECENT5-POSITIVE-SHADOW-CONTINUITY',
    kod: 'AWS Candidate v4.9.2-RECENT5-POSITIVE-PREMIER',
    botSurumu: '4.9.2-RECENT5-POSITIVE-PREMIER',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '19.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
