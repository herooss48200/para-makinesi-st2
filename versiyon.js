// ============================================================
// PARA MAKİNESİ BINANCE - SÜRÜM KİMLİK DOSYASI
// AWS Stable v2.1.14.2
// ============================================================

const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'ANALIZ-TELEGRAM-FIX',
    kod: 'AWS Stable v2.1.14.2',
    botSurumu: '2.1.14.2',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '02.07.2026',

    ortam: {
        aws: true,
        github: true,
        emirModu: 'SANAL'
    },

    strateji: {
        trendPeriyodu: '1h',
        pusuPeriyodu: '1h',
        sniperPeriyodu: '3m',
        bollingerPusu: true,
        superTrendOnayi: true,
        pusuOrtaBandFiltresi: true,
        pusuKaliteMotoru: true,
        superTrendEtkiAnalizi: true,
        dinamikStop: true,
        sanalIslem: true
    },

    degisiklikler: [
        'bot.js ile uyumlu kisaOzet() ve telegramOzet() fonksiyonları eklendi.',
        'Sürüm kimliği AWS Stable v2.1.14.2 olarak güncellendi.',
        'Pusu ve Sniper farklı zaman dilimi desteği korundu.',
        'Telegram canlı raporlarına sürüm bilgisi uyumlu hale getirildi.',
        'GitHub -> AWS stable çalışma akışı için dosya adları normalize edildi.',
        'Sanal pozisyon kalıcı hafızası eklendi.',
        'Restart sonrası aynı sembolde tekrar emir açılması engellendi.',
        'Döngü başına ve günlük yeni emir limitleri eklendi.',
        'Pusu raporu Telegram için kısaltıldı.',
        'Geç giriş problemi için canlı sniper SuperTrend tetik desteği eklendi.',
        'Fiyat kırılımı önce geldiyse 5m mum kapanışı beklenmeden canlı fiyatla tetik hesaplanır.',
        'v2.1.4-c: tetikYuzdesi 0 yapıldı; hedef seviyesi doğrudan tetik kabul edilir.',
        'Telegram giriş teşhisine Tetik Modu bilgisi eklendi.',
        'v2.1.5: Sniper mum O/H/L/C teşhisi eklendi.',
        'v2.1.6: 15m pusu mum teşhisi eklendi ve pusu yalnızca kapanmış mumdan kurulacak güvenlik kontrolü güçlendirildi.',
        'v2.1.7: Pusu kalite puanı, fitil/gövde/kapanış gücü sınıflandırması ve Telegram kalite raporları eklendi.',
        'v2.1.8: Pusu Kalite Motoru tamamlandı; band temas kalitesi, orta band uzaklığı, JSONL/CSV açılış-kapanış analiz kayıtları eklendi.',
        'v2.1.9: Zaman dilimi 30m pusu + 3m sniper yapıldı; SuperTrend etki analizi, ST yaşı, ST mesafesi ve ST puanı loglara eklendi.',
        'v2.1.10: Zaman dilimi 1h pusu + 5m sniper yapıldı; KADEME stopta gecikmeli/tamponlu başabaş koruması eklendi.',
        'v2.1.10: Pusu mum teşhisi başlığı seçili pusu periyoduna göre dinamik hale getirildi.',
        'v2.1.11: SuperTrend onayı sniper periyodundan ayrıldı; varsayılan yapı 4h trend/ST + 1h pusu + 5m sniper yapıldı.',
        'v2.1.13: Varsayılan yapı 4h trend/ST + 1h pusu + 3m sniper olarak güncellendi.',
        'v2.1.13: SHORT/LONG için maxGirisSapmaYuzde geç giriş koruması eklendi.',
        'v2.1.13: Emir anı snapshot ve RAW fiyat/tetik karşılaştırması Telegram giriş teşhisine eklendi.',
        'v2.1.14.1: Varsayılan yapı 1h SuperTrend filtresi + 1h pusu + 3m sniper olarak güncellendi.',
        'v2.1.14.1: Argos Analiz Merkezi eklendi; açılış/kapanış, LONG/SHORT kalite özeti, son 10 işlem ve MFE/MAE yolculuk kaydı tutulur.',
        'v2.1.14.1: Telegram canlı raporuna LONG ve SHORT ayrı kalite/sonuç/net PNL tablosu eklendi.',
        'v2.1.14.2: SHORT sanal pozisyon açılış mesajlarını bozan Telegram HTML parse hatası düzeltildi; <= metni yerine ≤ kullanılır.'
    ],

    notlar: [
        'Varsayılan emir modu güvenlik için SANAL olarak tutuldu.',
        'Gerçek/testnet emir geçişi ayarlar.js içindeki sanalEmirModu ile yönetilir.',
        'AWS üzerinde PM2 ile bot.js çalıştırılmalıdır.',
        'data/sanal-state.json çalışma zamanı hafıza dosyasıdır; GitHub’a eklenmemelidir.',
        'canliSniperTetikAktif=true ayarı hızlı giriş modudur; kapanmış mum onayı istenirse false yapılabilir.',
        'Pusu Kalite Motoru ölçüm modundadır; kalite sınıfı emir engellemez.',
        'SuperTrend Etki Analizi ölçüm modundadır; ST puanı emir engellemez.',
        'KADEME modunda başabaş artık ilk küçük kârda değil, breakevenTetikKademe ayarından sonra devreye girer.',
        'v2.1.14.1 ile 3m sniper sadece tetik ve mum teşhisi için, 1h SuperTrend ise trend/onay katmanı için kullanılır.',
        '3 mum kuralı sniper mumuna değil, sadece 1h pusu mumuna göre çalışır.',
        'Geç giriş filtresi aşılırsa pusu güvenlik amacıyla iptal edilir.',
        'SHORT açılış mesajında Telegram HTML parse hatası olmaması için dinamik karşılaştırma metinlerinde < karakteri kullanılmaz.'
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
