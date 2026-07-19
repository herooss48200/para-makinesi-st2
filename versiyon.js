const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'TRANSFER-ID-COMPLETE-FORWARD-PROOF',
    kod: 'AWS Candidate v4.6.1-TRANSFER-ID-COMPLETE-FORWARD-PROOF',
    botSurumu: '4.6.1-TRANSFER-ID-COMPLETE-FORWARD-PROOF',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '19.07.2026',
    ortam: {
        emirModu: 'SANAL'
    }
};

function kisaOzet() {
    return `${versiyon.isim} ${versiyon.botSurumu} | ${versiyon.kodAdi} | Strateji ${versiyon.stratejiSurumu}`;
}

function telegramOzet() {
    const mod = versiyon.ortam?.emirModu || 'BILINMIYOR';
    return `${versiyon.botSurumu} / ${versiyon.kodAdi} / ${mod}`;
}

function detayliOzet() {
    return {
        ...versiyon,
        kisaOzet: kisaOzet(),
        telegramOzet: telegramOzet()
    };
}

module.exports = {
    ...versiyon,
    versiyon,
    kisaOzet,
    telegramOzet,
    detayliOzet
};
