const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'REAL-ORDER-PREPARATION-STAGE1',
    kod: 'AWS Candidate v5.2.2-FINAL-EVIDENCE-GATE',
    botSurumu: '5.2.2-FINAL-EVIDENCE-GATE',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '22.07.2026',
    ortam: { emirModu: 'SANAL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
