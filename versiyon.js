const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'ADAPTIVE-TRADING-LEAGUE',
    kod: 'AWS Candidate v4.4.3-LEAGUE-STATE-RECLASSIFICATION',
    botSurumu: '4.4.3-LEAGUE-STATE-RECLASSIFICATION',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '18.07.2026',
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
