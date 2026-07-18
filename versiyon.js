const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'EXIT-VICTORY-AUDIT',
    kod: 'AWS Candidate v4.5.2-EXIT-VICTORY-AUDIT',
    botSurumu: '4.5.2-EXIT-VICTORY-AUDIT',
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
