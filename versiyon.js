const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'EXIT-INTELLIGENCE-EVOLUTION',
    kod: 'AWS Stable v3.6.6-DNA-PROFIT-POTENTIAL',
    botSurumu: '3.6.6-DNA-PROFIT-POTENTIAL',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '10.07.2026',
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
