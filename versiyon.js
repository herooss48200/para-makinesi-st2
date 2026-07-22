const versiyon = {
    isim: 'AGROS ST2',
    instanceId: 'ST2',
    repo: 'para-makinesi-st2',
    kodAdi: 'ST2-IDENTITY-ISOLATION',
    kod: 'Experimental Candidate v5.3.0-ST2.1',
    botSurumu: '5.3.0-ST2.1',
    stratejiSurumu: 'ST2-BASELINE-1.0.14',
    yayinTarihi: '22.07.2026',
    ortam: { emirModu: 'SANAL', rol: 'DENEYSEL' }
};
function kisaOzet() { return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`; }
function telegramOzet() { const mod = versiyon.ortam?.emirModu || 'BILINMIYOR'; return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`; }
function detayliOzet() { return { ...versiyon, kisaOzet: kisaOzet(), telegramOzet: telegramOzet() }; }
module.exports = { ...versiyon, versiyon, kisaOzet, telegramOzet, detayliOzet };
