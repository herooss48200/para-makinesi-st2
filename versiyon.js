// ============================================================
// PARA MAKİNESİ BINANCE - SÜRÜM KİMLİK DOSYASI
// AWS Stable v3.0.1-STRATEGY-LAB-LIVE-SIGNATURE
// ============================================================

const versiyon = {
    isim: 'Para Makinesi Binance',
    kodAdi: 'AGROS-STRATEGY-LAB',
    kod: 'AWS Stable v3.0.1-STRATEGY-LAB-LIVE-SIGNATURE',
    botSurumu: '3.0.1-STRATEGY-LAB-LIVE-SIGNATURE',
    stratejiSurumu: '1.0.14',
    yayinTarihi: '07.07.2026',

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
        'v3.0.1: Açılış Telegram kartına işlem açıldığı anda o 256 BTC×Coin imzasının geçmiş başarı oranı, TP/SL/BE, net, ortalama net, güven ve sıralama bilgisi eklendi.',
        'v3.0.1: Kapanış analizine güncellenmiş 256 imza performansı eklendi; kapanan işlemden sonra aynı imzanın yeni oranı anında görünür.',
        'v3.0.1: Açılış fotoğrafında artık sadece L_B0111_C1001 gibi kısa imza değil, emojili BTC/Coin zaman dilimi açılımı ve geçmiş karar satırı birlikte gösterilir.',
        'v3.0.0: 256 BTC×Coin imza matrisi eklendi; BTC 5m/15m/1h/4h ve Coin 5m/15m/1h/4h bit kombinasyonları saf şekilde ayrı istatistiklenir.',
        'v3.0.0: Her 10 kapanışta Telegram raporuna En Başarılı 256 İmzaları, En Başarısız 256 İmzaları ve 256 Matris Ters Yön Test Adayları bölümü eklenir.',
        'v3.0.0: 256 matris BB, pusu kalitesi veya sembolü karıştırmaz; yalnızca BTC-Coin zaman dilimi ilişkisini ölçer ve işlem motoruna dokunmaz.',
        'v2.5.6: Strategy Lab Radar satırları net oran formatına taşındı; her imza için başarı %, başarısızlık %, BE %, örnek sayısı, net ve ortalama net Telegram’da açıkça yazılır.',
        'v2.5.6: Çok başarısız veya %100 başarısız imzalarda ters yön test adayı kararı daha görünür hale getirildi; işlem motoruna müdahale etmez, bilimsel deney önerisi üretir.',
        'v2.5.5: AGROS Strategy Lab Radar eklendi; her 10 kapanışta Telegram’a en başarılı, en başarısız, %100 başarısız ve ters yön test adayı imzalar ayrı bölüm olarak gönderilir.',
        'v2.5.5: Büyük oranda başarısız imzalar için SHORT yerine LONG / LONG yerine SHORT test önerisi üretir; emir motoruna dokunmaz, sadece bilimsel deney uyarısı verir.',
        'v2.5.4: Strategy Lab imza sistemi eklendi; BTC/Coin uyum puanının hangi zaman dilimlerinden geldiği key, kısa imza ve okunabilir etiket olarak JSONL/CSV kayıtlarına yazılır.',
        'v2.5.4: Telegram BlackBox açılış/kapanış fotoğrafına renkli Strategy Lab imzası eklendi; LONG uyumları yeşil, SHORT uyumları kırmızı, ters zaman dilimleri siyah gösterilir.',
        'v2.5.4: Tam kombinasyon istatistikleri artık sadece 3/4-1/4 skorunu değil BTC[5m+15m] ve Coin[15m] gibi gerçek periyot imzasını kullanır.',
        'v2.5.3: AGROS Strategy Lab eklendi; aktif deney kimliği, periyot/parametre etiketi ve deney karşılaştırması Telegram raporlarına yazılır.',
        'v2.5.3: BTC/Coin 5m-15m-1h-4h etkileri ayrı ayrı UP/DOWN + LONG/SHORT kırılımıyla raporlanır; BTC 1/4 olduğunda hangi TF olduğu görülebilir.',
        'v2.5.3: Agros bulgusu bölümü en güçlü ve en zayıf ölçümü örnek sayısı, başarı, net ve güven seviyesiyle özetler.',
        'v2.5.2: Agros Karar Laboratuvarı eklendi; güçlü kombinasyon adayları ve filtre/yasak adayları Telegram raporunda görünür.',
        'v2.5.2: Pusu kalite sınıfı ve dip/tepe dalga senaryosu istatistikleri BlackBox özetine eklendi.',
        'v2.5.2: Karar laboratuvarı sadece ölçüm yapar; emir yönü, kasa, TP/SL/BE ve iz süren stop mantığına müdahale etmez.',
        'v2.5.1: BlackBox tam kombinasyon istatistik raporu Telegram’a her 10 kapanışta bir ayrı mesaj olarak gönderilir.',
        'v2.5.1: BTC/Coin TF, BB+yön, trend aynı/ters yön ve en zayıf kombinasyon raporları eklendi.',
        'v2.5.0-FIX: Telegram mesajları 3900 karakterlik güvenli parçalara bölünür; uzun BlackBox kapanış kartları kaybolmaz.',
        'v2.5.0-FIX: Telegram HTML parse hatasında aynı mesaj düz metin olarak tekrar denenir; LONG/SHORT kapanış kartları sessizce düşmez.',
        'v2.5.0-FIX: BE sınıflandırması sadece breakevenAktif bayrağına göre yapılmaz; net zarar büyükse sonuç SL yazılır.',
        'v2.5.0-FIX: Kapanış Telegram gönderim sonucu konsola LONG/SHORT ayırt etmeden açıkça yazılır.',
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
        'v3.0.1 Live Signature modülü emir motoruna dokunmaz; işlem açılışında yalnızca o imzanın geçmiş istatistiksel bağlamını Telegram’da gösterir.',
        'v3.0.0 256 Matrix raporu, hangi BTC-Coin zaman dilimi imzasının en başarılı veya en başarısız olduğunu tek Telegram raporunda gösterir; otomatik emir yönü değiştirme yoktur.',
        'v2.5.6 Ratio Radar her imza için net başarı oranını yazar ve ters yön test adayını karar satırı olarak öne çıkarır; otomatik emir yönü değiştirme güvenlik için kapalıdır.',
        'v2.5.5 Strategy Lab Radar ters yön adaylarını Telegram’da gösterir; otomatik emir yönü değiştirme güvenlik için kapalıdır ve işlem motoruna müdahale edilmemiştir.',
        'v2.5.4 Strategy Lab Signature emir motoruna dokunmaz; sadece analiz/telemetri katmanında hangi uyum puanının hangi zaman diliminden geldiğini kaydeder.',
        'v2.5.3 Strategy Lab emir motoruna dokunmaz; amaç farklı TF/periyot deneylerinin performansını Telegram ve CSV/JSONL üzerinden karşılaştırmaktır.',
        'Periyot testi değiştirirken ayarlar.js içindeki strategyLabDeneyId/strategyLabDeneyAdi alanları doldurulursa deneyler birbirinden net ayrılır.',
        'v2.5.2 Agros Lab strateji değiştirmez; Telegram üzerinden hangi kombinasyonların kazandırdığını takip etmek için tasarlanmıştır.',
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
