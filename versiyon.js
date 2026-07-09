const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'AGROS-STRATEGY-LAB',
    kod: 'AWS Stable v3.2.4-FEATURE-IMPORTANCE-LAB',
    botSurumu: '3.2.4-FEATURE-IMPORTANCE-LAB',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '09.07.2026',
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
