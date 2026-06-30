// ============================================================
// PARA MAKİNESİ BINANCE - SÜRÜM KİMLİK DOSYASI
// AWS Stable v2.1.3
// ============================================================

const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'SNIPER',
    kod: 'AWS Stable v2.1.3',
    botSurumu: '2.1.3',
    stratejiSurumu: '1.0.3',
    yayinTarihi: '26.06.2026',

    ortam: {
        aws: true,
        github: true,
        emirModu: 'SANAL'
    },

    strateji: {
        pusuPeriyodu: '4h',
        sniperPeriyodu: '5m',
        bollingerPusu: true,
        superTrendOnayi: true,
        pusuOrtaBandFiltresi: true,
        pusuKaliteFiltresi: true,
        dinamikStop: true,
        sanalIslem: true
    },

    degisiklikler: [
        'bot.js ile uyumlu kisaOzet() ve telegramOzet() fonksiyonları eklendi.',
        'Sürüm kimliği AWS Stable v2.1.3 olarak güncellendi.',
        'Pusu ve Sniper farklı zaman dilimi desteği korundu.',
        'Telegram canlı raporlarına sürüm bilgisi uyumlu hale getirildi.',
        'GitHub -> AWS stable çalışma akışı için dosya adları normalize edildi.',
        'Sanal pozisyon kalıcı hafızası eklendi.',
        'Restart sonrası aynı sembolde tekrar emir açılması engellendi.',
        'Döngü başına ve günlük yeni emir limitleri eklendi.',
        'Pusu raporu Telegram için kısaltıldı.'
    ],

    notlar: [
        'Varsayılan emir modu güvenlik için SANAL olarak tutuldu.',
        'Gerçek/testnet emir geçişi ayarlar.js içindeki sanalEmirModu ile yönetilir.',
        'AWS üzerinde PM2 ile bot.js çalıştırılmalıdır.',
        'data/sanal-state.json çalışma zamanı hafıza dosyasıdır; GitHub’a eklenmemelidir.'
    ]
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
