const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'ACTIVE-EVIDENCE-RECONCILIATION',
    kod: 'AWS Candidate v5.0.8-ACTIVE-EVIDENCE-RECONCILIATION',
    botSurumu: '5.0.8-ACTIVE-EVIDENCE-RECONCILIATION',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '20.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
