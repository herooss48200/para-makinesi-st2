// ============================================================
// PARA MAKİNESİ BINANCE - SÜRÜM KİMLİK DOSYASI
// AWS Stable v2.4.0
// ============================================================

const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'BLACKBOX-INTELLIGENCE-PRO',
    kod: 'AWS Stable v2.4.0',
    botSurumu: '2.4.0',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '03.07.2026',

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
        'v2.4.0: Kapanış mesajına aynı kombinasyon öğrenme kartı eklendi; BTC/Coin uyum + BB bölgesi için TP/SL/BE ve net sonuç birikir.',
        'v2.4.0: Ana BlackBox raporuna en kârlı kombinasyonlar bölümü eklendi.',
        'v2.4.0: Kapanış kartı max kâr/max zarar, komisyon, net PNL ve açılış→kapanış uyum değişimini tek analiz bloğunda gösterir.',
        'v2.3.1: Açılış mesajına gerçek işlem açılış saati eklendi.',
        'v2.3.1: Kapanış mesajına açılış saati, kapanış saati, işlem süresi ve BlackBox uyum değişim analizi eklendi.',
        'v2.3.1: Aktif pozisyon BlackBox özetinde açılış zamanı ve pozisyon süresi gösterilir.',
        'v2.3.0: Telegram ana raporuna kapanan işlemler için 8/8, 7/8, 6/8 SuperTrend uyum tabloları ve aktif pozisyon açılış fotoğrafları eklendi.',
        'v2.3.0: Açılış ve kapanış mesajları BTC/Coin 5m/15m/1h/4h kartlarını çok satırlı okunabilir formata taşır.',
        'v2.3.0: Kapanış mesajına açılış fotoğrafı, kapanış fotoğrafı ve trend değişim özeti eklendi.',
        'v2.3.0: Bollinger orta, orta bölge ve alt/üst etkileri ana raporda ayrı sayılır.',
        'v2.2.2: Telegram açılış mesajına BTC/Coin 5m/15m/1h/4h BlackBox SuperTrend kartı eklendi.',
        'v2.2.2: Telegram kapanış mesajına açılış fotoğrafı, kapanış fotoğrafı ve trend değişimi eklendi.',
        'v2.2.1: Sanal SL/TP fiyat doğrulaması eklendi; geçersiz 0 fiyatlı kapanışlar engellendi.',
        'v2.2.1: Kârla kapanan kâr-koruma stopları zarar SL istatistiğine yazılmayacak şekilde sınıflandırıldı.',
        'v2.2.1: BE sayaçlarındaki çift LONG BE artışı düzeltildi.',
        'bot.js ile uyumlu kisaOzet() ve telegramOzet() fonksiyonları eklendi.',
        'Sürüm kimliği AWS Stable v2.2.2 olarak güncellendi.',
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
        'v2.1.14.2: SHORT sanal pozisyon açılış mesajlarını bozan Telegram HTML parse hatası düzeltildi; <= metni yerine ≤ kullanılır.',
        'v2.2.0: BlackBox Full Analysis eklendi; BTC ve coin için 5m/15m/1h/4h açılış-kapanış SuperTrend fotoğrafı Telegram ve JSONL/CSV loglarına yazılır.',
        'v2.2.0: Telegram ana raporuna SuperTrend uyum etkisi, Bollinger orta bant etkisi ve son BlackBox işlem özeti eklendi.',
        'v2.2.0: BE tamponu %0.12 yapıldı; komisyon sonrası zararda başabaş kapanışlarını azaltmak için BE+ koruması güçlendirildi.',
        'v2.2.0: Kasa sonucu sınıflandırması kapanış sebebine göre TP/SL/BE olarak ayrıldı; BE+ küçük kâr olsa da ayrı izlenir.'
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
        'SHORT açılış mesajında Telegram HTML parse hatası olmaması için dinamik karşılaştırma metinlerinde < karakteri kullanılmaz.',
        'BlackBox ölçüm katmanıdır; işlem açma yönünü veya pusu/sniper stratejisini değiştirmez.',
        'BlackBox dosyaları: data/blackbox-snapshots.jsonl ve data/blackbox-trades.csv.'
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
