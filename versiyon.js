const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'MEMORY-SAFE-HOTFIX',
    kod: 'AWS Candidate v4.5.1-MEMORY-SAFE-HOTFIX',
    botSurumu: '4.5.1-MEMORY-SAFE-HOTFIX',
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
