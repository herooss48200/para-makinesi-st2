const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'ADAPTIVE-TRADING-LEAGUE',
    kod: 'AWS Candidate v4.2.9-SIZING-GUARD-CLEAN-START',
    botSurumu: '4.2.9-SIZING-GUARD-CLEAN-START',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '17.07.2026',
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
