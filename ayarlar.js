/**
 * PARA MAKİNESİ - AYARLAR SAYFASI
 * Strateji, pusu/tetik, risk, sanal emir ve raporlama ayarları.
 *
 * STRATEJİ ÖZETİ:
 * - Pusu büyük periyotta kapanmış mumdan kurulur.
 * - Sniper küçük periyotta hedef kırılımı + SuperTrend onayı bekler.
 * - Bollinger orta band filtresi sniper tarafında değil, pusu tarafında kalite kontrolü olarak kullanılır.
 * - Dar Bollinger ve zayıf mum gövdesi yanlış pusu üretimini artırabileceği için filtrelenir.
 */

const ayarlar = {

    // ========================================
    // CÜZDAN VE RİSK YÖNETİMİ
    // ========================================
    // R24 kontrollü CONFIRMED canlı ekonomi: pozisyon başına 20 USDT notional.
    // 4 USDT marjin x 5x = 20 USDT notional; Shadow öğrenme Binance emri göndermez.
    calisilmakIstenenUsdtMiktar: 4,
    mevcutKaldirac: 5,
    maxPozisyonSayisi: 100,

    // ========================================
    // EMİR MODU
    // ========================================
    // true  = Binance'e emir göndermez, sanal pozisyon açar/kapatır.
    // false = Binance Futures'a gerçek/testnet emir gönderir.
    sanalEmirModu: false,
    sanalKomisyonOrani: 0.0005,

    // ========================================
    // STOP TAKİP MANTIĞI
    // ========================================
    // KADEME: Stop sadece TP kademesine ulaşıldığında güncellenir.
    // TRAILING: Stop canlı fiyatı yüzde mesafeyle takip eder.
    stopTakipModu: 'KADEME',

    // KADEME modunda eski davranış: 1. kademe görülür görülmez SL girişe çekiliyordu.
    // v2.1.10: Başabaş artık gecikmeli çalışır. İlk küçük kârda hemen girişe çekmez.
    // Örn: tpAdimYuzdesi 0.4 ve breakevenTetikKademe 2 ise BE ancak %0.8 kâr görülünce aktif olur.
    breakevenTetikYuzde: 0.4,
    breakevenTetikKademe: 2,
    breakevenTamponYuzde: 0.12,
    // Kademe stop kaç kademe geriden gelsin? 2 = daha geniş nefes, 1 = daha agresif koruma.
    kademeStopGeridenKademe: 2,
    // Pozisyon açıldıktan sonra BE için minimum bekleme. 0 = kapalı.
    breakevenMinimumBeklemeSaniye: 0,
    // BE/BE+ sınıflandırması için fiyat hareketi bandı. Komisyon çevresindeki kapanışlar TP/SL istatistiğini bozmasın.
    breakevenSonucBandYuzde: 0.15,

    // v5.4.0 ST1 Bilimsel Denetim — LAB/lig bazlı hızlı fakat tarihsel hafızayı koruyan Stop + BE öğrenmesi.
    labLifecycleEvolutionAktif: true,
    labLifecycleMinKapanis: 5,
    labStopMinKapanis: 5,
    labBeMinKapanis: 5,
    labLifecycleYenidenHesaplamaAdimi: 5,
    labLifecycleDerinHesaplamaAdimi: 10,
    labLifecycleGuncelPencere: 20,
    labLifecycleGuncelAgirlik: 0.60,
    labLifecycleMinSkorIyilesme: 0.0005,
    labLifecycleOtomatikAktiflestirme: true,
    // v6.7.3: LAB canlı lig terfi/düşüşü aynı son-N bilimsel kapanış penceresinden verilir.
    // Pozitif ekonomi Premier'e çıkarır; aynı pencerenin pozitif kapıyı kaybetmesi Shadow'a indirir.
    labCanliLigAktif: true,
    labCanliLigMinKapanis: 5,
    labCanliLigMinPF: 1,
    labCanliLigMinNet: 0,
    labCanliLigMinExpectancy: 0,

    // v6.9.1: Premier kalite puanı kronolojik walk-forward audit ile kalibre edilebilir.
    // data/st2-premier-score-calibration.json yoksa bu güvenli varsayılanlar kullanılır.
    // Exact-context, tamamlanmış tarihsel havuz ve minimum örnek zorunluluğu değişmez.
    renkoPremierScoreAktif: true,
    renkoPremierScoreMinOrnek: 3,
    renkoPremierScoreMin: 55,
    renkoPremierScoreGoreceliYuzdelik: 0.40,
    renkoPremierScoreMaxDinamikEsik: 70,
    // R25.3 OOS cohort filtresi: gerçek Premier auditinde belirgin kayıp üreten COIN 1000/1001
    // normal Score-Premier yolunda Shadow'a alınır. Aynı tam LAB bağlamı N5 canlı pozitif ekonomi
    // kanıtı üretirse bu veto kalkar ve canlı lig terfisi Premier otoritesi olur.
    premierScoreOosCoinVetoAktif: true,
    premierScoreOosCoinVetoBits: ['1000', '1001'],
    labStopAdaylariYuzde: [0.8, 1.0, 1.2, 1.5, 1.8, 2.1, 2.4],
    labBeTetikAdaylariYuzde: [0.30, 0.40, 0.60, 0.80],
    labBeAdaylariYuzde: [0.08, 0.12, 0.16, 0.20, 0.25, 0.30],
    izSurenStopTakipYuzdesi: 0.4,
    izSurenStopAktivasyon: 0.8,
    stopBildirimMinYuzde: 0.01,
    stopBildirimMinSaniye: 0,

    // ========================================
    // KAR KADEMELERİ
    // ========================================
    tpAdimYuzdesi: 0.4,
    maxTpYuzdesi: 50.0,
    tpKademeSayisi: 25,

    // ========================================
    // SABİT STOP LOSS VE TAKE PROFIT
    // ========================================
    sabitStopYuzdesi: 2.5,
    // KADEME modunda borsaya/sanala gönderilen TP, erken kapatmasın diye maxTpYuzdesi olur.
    // TRAILING modunda sabitTpYuzdesi kullanılır.
    sabitTpYuzdesi: 0.4,

    // ========================================
    // TEKNİK İNDİKATÖR AYARLARI
    // ========================================
    bollingerperiod: 20,
    bollingercarpani: 2.0,
    superTrendPeriod: 10,
    superTrendMultiplier: 3,

    // ========================================
    // ZAMAN DİLİMİ VE PERİYOTLAR
    // ========================================
    // v2.1.11: Üç katmanlı yapı.
    // Trend/SuperTrend onayı büyük periyottan, pusu Bollinger setup'ı orta periyottan, sniper hassas girişten gelir.
    // v2.1.14.1: Analiz testi için SuperTrend filtresi ve pusu aynı 1h periyotta ölçülür.
    // Trend filtresi: 1h SuperTrend yön onayı
    // Pusu: 1h Bollinger pusu mumu
    // Sniper: 3m canlı tetik/teşhis mumu
    trendPeriyodu: '3m',
    superTrendPeriyodu: '3m',
    pusuPeriyodu: '15m',
    sniperPeriyodu: '1m',
    trendFiltresiAktif: true,
    trendFiltresiModu: 'ONAY', // ONAY: ST yönü işlem yönüyle aynı olmalı | BILGI: sadece log/risk etiketi

    // ========================================
    // PUSU VE TETİKLEME KURALLARI
    // ========================================
    proximityYuzdesi: 0.5,
    // v2.1.4-c hedef-tetik düzeltmesi:
    // KIRMIZI_MUM_ALT_BAND / YESIL_MUM_UST_BAND senaryolarında
    // bot artık hedef kırılır kırılmaz tetik alır.
    // Eski değer 0.25 idi; bu hedef üstüne %0.25 buffer ekleyip geç giriş görüntüsü oluşturuyordu.
    tetikYuzdesi: 0,
    maxPusuBeklemeMum: 3,
    // Pusu süresi içinde fiyat kırılımı ve SuperTrend onayı hangi sırayla gelirse gelsin,
    // ikisi de tamamlandığı anda işlem açılır. Pusu sadece maxPusuBeklemeMum dolunca iptal edilir.
    pusuTetikSirasiSerbest: true,

    // ST2 Renko giriş yolu. ST1 Trade Engine ve giriş sonrası katmanlar değişmez.
    entryStrategyMode: 'ST2_RENKO', // ST1 | ST2_RENKO
    renkoKaynakPeriyodu: '15m',
    renkoAtrPeriod: 14,
    renkoKaynakMumLimiti: 250, // BB(20) için ATR-Renko tuğla derinliği
    renkoBollingerPeriod: 20,
    renkoBbTemasToleransTugla: 0.25, // ST2-only: band yaklaşımı en fazla çeyrek Renko tuğlası
    renkoKanitTuglaSayisi: 10,
    renkoYakinRedKanitSayisi: 3,
    renkoPusuKanitTelegram: true, // yalnız kısa açılış özeti + kısa yeni pusu
    renkoProofConsoleAktif: false, // ayrıntılı 10-tuğla proof normal runtime konsolunu boğmasın; gerektiğinde true
    renkoRuntimeYieldEverySembol: 2, // R19: 200-coin taramada Telegram/timer adaleti; karar matematiğini değiştirmez
    renkoEventLoopStarvationLogMs: 1000, // setImmediate dönüşü gecikirse canlı CPU starvation kanıtı
    // v6.3.7: canlı pusu bildirim hafızası sınırlı ve süreli tutulur.
    renkoPusuBildirimHafizaSaat: 168,
    renkoPusuBildirimHafizaMax: 5000,
    renkoOnayPeriyodu: '1m',
    renkoOnayAtrPeriod: 14,
    renkoOnaySuperTrendPeriod: 10,
    renkoOnaySuperTrendMultiplier: 3,
    // R12: 80 mum yetmeyen sembollerde stratejiyi değiştirmeden aynı 1m ATR-Renko ST için derin tarihçe onarımı.
    renkoOnayKaynakMumLimiti: 80,
    renkoOnayDerinOnarimMumLimiti: 240,
    renkoOnayMaksOnarimMumLimiti: 480,
    // R25.2: canlı 1m Renko-ST refresh tam 240/480 geçmişi tekrar çekmez; küçük kapanmış pencere cache'e eklenir.
    renkoOnayIncrementalMumMin: 5,
    renkoOnayIncrementalMumMax: 30,
    renkoOnayRefreshTimeoutMs: 6000,
    renkoOnayRefreshRetry: 0,
    renkoAuditLogMs: 60000,
    renkoTetikYuzdesi: 0.05, // legacy; aktif tetik artık tuğla mesafesi evriminden gelir
    renkoGirisOgrenmeAktif: true,
    renkoGirisOtomatikAktiflestirme: true,
    renkoGirisAdayTugla: [0.25, 0.50, 0.75, 1.00, 1.25, 1.50],
    renkoGirisVarsayilanTugla: 0.75,
    renkoGirisIlkAtamaKapanis: 3,
    renkoGirisYenidenHesaplamaAdimi: 5,
    renkoGirisGuncelPencere: 10,
    renkoGirisGuncelAgirlik: 0.65,
    renkoGirisMinSkorIyilesme: 0.005,
    // v6.12.2: Golden Renko geri dönüşü. Öğrenilmiş Entry Evolution 0.25T–1.50T kararı
    // canlı/sanal girişin fiyat yetkisidir; ST1 yalnız shadow etki etiketi olarak tutulur.
    renkoGirisCanliYetkiAktif: true,
    // Legacy DIRECT güvenlik filtresi: force-CONFIRMED kapatılırsa yalnız DIRECT 0.50T ve 1.00T gerçek Binance emri alabilir.
    // R23.1'de yeni gerçek giriş otoritesi CONFIRMED olduğundan bu filtre geriye dönük güvenlik/compatibility katmanıdır.
    gercekDirectTuglaFiltreAktif: true,
    gercekDirectIzinliTuglalar: [0.50, 1.00],
    st2St1GirisKapisiAktif: false,
    st2St1KarsiYonPusuIptal: false,
    st2St1KarsiTrendPusuIptal: false,
    // Pusu ömrü tekrar kapanmış Renko tuğlalarıyla ölçülür.
    maxPusuBeklemeTugla: 3,

    // Williams %R Cycle Shadow Lab — ana emri açmaz veya engellemez.
    // Gürültüyü azaltmak için dar ekstrem bölgeler: tepe -10..0, dip -100..-90.
    williamsCycleShadowAktif: true,
    williamsCyclePeriod: 14,
    williamsCycleTepeEsigi: -10,
    williamsCycleTepeResetEsigi: -20,
    williamsCycleDipEsigi: -90,
    williamsCycleDipResetEsigi: -80,
    // Uç bölgede yapışmak destek değildir; nötre doğru ilk 1–3 tuğlalık dönüş aranır.
    williamsCycleDonusMaxTugla: 3,
    williamsCycleDonusMinFark: 0.01,
    williamsCycleGecNotrEsigi: -50,

    // v6.12.3 — 1m Renko Entry Confirmation Shadow Lab.
    // Canlı girişi/stopu/Exit Evolution'ı değiştirmez. Yalnız R→G veya G→R dönüşünden
    // sonra 0.25T / 0.50T / 0.75T bekleseydik ne olurdu sorusunu ölçer.
    renkoGirisTeyitShadowAktif: true,
    renkoGirisTeyitShadowAdayTugla: [0.25, 0.50, 0.75],
    renkoGirisTeyitShadowStopYuzde: 1.50,
    renkoGirisTeyitShadowTabanTetikYuzde: 0.50,
    renkoGirisTeyitShadowTakeoverYuzde: 0.60,
    renkoGirisTeyitShadowBakisTugla: 40,
    // Ana işlem kapandıktan sonra tetiklenmemiş adayların bekleme süresi.
    renkoGirisTeyitShadowTetikBeklemeDakika: 60,
    // Tetiklenen adayın kendi stop/Renko korumasıyla azami bağımsız yaşamı.
    renkoGirisTeyitShadowMaksYasamDakika: 360,
    renkoGirisTeyitShadowStateKayitAraligiMs: 15000,
    renkoGirisTeyitShadowTamamlananSakla: 500,

    // R25 — MACD yalnız SHADOW ölçüm katmanıdır. Emir açmaz, girişi engellemez,
    // gerçek/sanal stopu değiştirmez. Mevcut kapanmış 1m + 15m cache'ini kullanır.
    macdShadowAktif: true,
    macdShadowFastPeriod: 12,
    macdShadowSlowPeriod: 26,
    macdShadowSignalPeriod: 9,
    // İşlem yönündeki histogram gücü bu kadar ardışık kapanmış çubuk zayıflarsa DECAY etiketi.
    macdShadowDecayArdisikCubuk: 2,
    // +%1.50 MFE sonrası decay/reversal görülürse yalnız öneri kaydı üretir.
    macdShadowKarKorumaEsikYuzde: 1.50,
    macdShadowHistogramEpsilon: 0.000000000001,
    macdShadowTimelineSakla: 120,
    macdShadowLedgerAktif: true,
    macdShadowEmirYetkisi: false,
    macdShadowStopYetkisi: false,

    // v6.13.5-R21 — Tek gerçek giriş kapısı: DIRECT champion / CONFIRMED challenger.
    // CONFIRMED seçilirse gerçek zaman/fiyat otoritesi pusu SONRASI kapanmış 15m Renko
    // R→G / G→R dönüşü + seçilen 0.25/0.50/0.75T offset'tir. 1m Renko ST yalnız son
    // sniper teyididir; 1m confirmation lifecycle laboratuvarı ayrı gölge kanıtı üretir.
    // İkinci gerçek emir zinciri oluşturulmaz.
    renkoGirisModuOtomatikAktif: true,
    renkoGirisModuZorlaConfirmed: true, // Tüm gerçek girişler CONFIRMED
    renkoGirisModuMinTeyitOrnek: 15,
    renkoGirisModuMinOrnek: 20,
    // CONFIRMED'ın görevi daha yüksek tekil kâr değil, yanlış girişleri elemek ve başarı olasılığını yükseltmektir.
    // N15+ Full Lifecycle profili en az %75 başarı ve pozitif ekonomi üretiyorsa gerçek giriş zamanlamasını devralabilir.
    renkoGirisModuMinBasariYuzde: 75,
    // Geriye dönük uyumluluk: artık seçim kapısı değildir; başarı-öncelikli policy kullanılır.
    renkoGirisModuMinSkorFarki: 0,
    // R22: CONFIRMED gerçek mode seçimi artık ayrı 15m bootstrap + canlı evidence state'inden gelir.
    // Bootstrap tarihsel örnek sayısı sonsuza kadar baskın olmasın; canlı veri geldikçe ağırlık doğal olarak devralır.
    renkoGiris15mBootstrapMaksAgirlik: 30,
    // R22.1: DIRECT seçiliyken 15m CONFIRMED karşı-olgusal yaşamı canlıda gölge izlenir; emir göndermez.
    // Gölge kanıt eski rejimi sonsuza dek taşımaması için etkili N ile sınırlandırılır.
    renkoGiris15mShadowCanliAktif: true,
    renkoGiris15mShadowMaksAgirlik: 60,
    renkoGiris15mShadowRoundTripFeePct: 0.08,
    renkoGiris15mShadowMaxHoldBars: 32,
    // Aynı standardize tarihsel modelde CONFIRMED, DIRECT'ten en az bu kadar WR avantajı göstermeli.
    renkoGirisModuMinWrAvantaj: 2.0,
    // Expectancy de DIRECT'ten kötü olamaz.
    renkoGirisModuMinExpAvantaj: 0.0,
    renkoGirisTeyitVarsayilanTugla: 0.25,


    // v2.1.13: Geç giriş koruması.
    // Hedef kırıldıktan sonra fiyat fazla kaçtıysa işlem açılmaz.
    // SHORT örnek: hedef 90, max %1.5 ise 88.65 altı geç kalmış sayılır ve pusu iptal edilir.
    // LONG örnek: hedef 90, max %1.5 ise 91.35 üstü geç kalmış sayılır ve pusu iptal edilir.
    maxGirisSapmaYuzde: 1.5,
    gecGirisPusuyuIptalEt: true,

    // v2.1.13: Emir anı ham fiyat snapshot/debug. Telegram giriş teşhisinde raw karşılaştırma gösterilir.
    emirSnapshotAktif: true,
    // Giriş anında kullanılan sniper mumunu ve tetik karşılaştırmalarını loglar.
    // GMT/ZEC gibi işlemlerde fitil mi, kapanış mı, canlı fiyat mı tetiklediğini kesin gösterir.
    debugSniperMum: true,

    // Giriş anında pusu kurulan pusu periyodu mumun gerçekten kapanmış olup olmadığını loglar.
    // Bu ayar, çalışan pusu mumu üzerinden pusu kurma şüphesini kesinleştirmek için eklendi.
    debugPusuMum: true,

    // v2.1.9: Pusu kalite puanı ve SuperTrend etki analizi hesaplanır ve Telegram giriş/kapanış raporlarına yazılır.
    // Şimdilik sadece ölçüm modudur; emir engellemez.
    pusuKalitePuanlamaAktif: true,
    // Pusu kalite analiz kayıtları data/pusu-kalite-islemler.jsonl ve .csv dosyalarına yazılır.
    pusuKaliteLogAktif: true,

    // ========================================
    // ARGOS ANALİZ MERKEZİ
    // ========================================
    // Stratejiyi değiştirmez; açılış/kapanış/kalite/yolculuk verisini ölçer.
    analizMerkeziAktif: true,
    // v2.2.0 BlackBox: Her işlemde BTC ve coin için 5m/15m/1h/4h SuperTrend + Bollinger fotoğrafı alır.

  blackboxRequestTimeoutMs: 5000,
  blackboxSnapshotTimeoutMs: 7000,
    blackboxAktif: true,
    blackboxTimeframes: ['5m', '15m', '1h', '4h'],
    blackboxBollingerTf: '15m',
    blackboxRaporTopKombinasyon: 10,
    blackboxMinKombinasyonOrnek: 3,
    blackboxMinTfOrnek: 5,
    // v2.5.2: Karar laboratuvarı eşikleri. Sadece raporlar; emir yönünü veya filtreyi değiştirmez.
    blackboxKararLaboratuvariAktif: true,
    blackboxKararMinOrnek: 10,
    blackboxKararBasariEsigi: 65,
    blackboxRiskBasariEsigi: 35,
    blackboxKararTopAday: 10,
    // v3.0: Saf 256 BTC×Coin imza matrisi. BB/pusu kalitesi karıştırılmaz; emir motoruna dokunmaz.
    blackbox256MatrixAktif: true,
    blackbox256MatrixMinOrnek: 3,
    blackbox256MatrixTopAday: 10,
    dnaProfitRankingMinOrnek: 10,
    // Expectancy Revolution A2: yalnızca geçmiş veride filtre etkisini simüle eder; Trade Engine'e filtre uygulamaz.
    dnaFilterSimulatorMinOrnek: 10,
    dnaFilterSimulatorMaksAday: 10,
    dnaFilterSimulatorKumulatifAday: 10,
    dnaFilterSimulatorMaksPf: 0.95,
    dnaFilterSimulatorMaksExpectancy: 0,
    // v2.5.6: Radar her imza için başarı/başarısızlık oranını ve ters yön test adaylığını açık yazar. Sadece Telegram uyarısıdır; emir motoruna dokunmaz.
    blackboxTersYonMinOrnek: 10,
    blackboxTersYonBasariEsigi: 35,
    blackboxPusuKaliteStatsAktif: true,
    // v2.5.3: Strategy Lab deney etiketi. Periyot değiştirince farklı ID ver; boş bırakılırsa ayarlardan otomatik üretilir.
    strategyLabAktif: true,
    strategyLabDeneyId: null,
    strategyLabDeneyAdi: null,
    blackboxTfHaritaMinOrnek: 1,
    // v3.0.3: Telegram'da otomatik BTC/Coin uyum analiz raporu.
    // Kapanış bazlı tetik korunur; ayrıca dakika bazlı ayrı rapor eklendi.
    // Dakika bazlı rapor kapanış minimumuna bağlı değildir; ilk rapor bot açılışından sonra ayarlanan süre dolunca gelir.
    // Bu rapor canlı rapor gibi eski mesajı düzenlemez; Telegram'a ayrı mesaj olarak düşer.
    blackboxIstatistikRaporuAktif: true,
    blackboxIstatistikRaporAraligiKapanis: 10,
    blackboxIstatistikMinIslem: 10,
    blackboxIstatistikDakikaRaporuAktif: true,
    blackboxIstatistikRaporAraligiDakika: 10,

    // v3.2.4 Feature Importance Lab:
    // Mevcut blackboxOzet verisini kullanarak tek tek özelliklerin kazanan/kaybeden DNA ayırt ediciliğini ölçer.
    // Trade Engine'e dokunmaz; sadece Telegram raporu ve Argos Dev Console için JSON/CSV çıktı üretir.
    featureImportanceLabAktif: true,
    featureImportanceConsoleExportAktif: true,
    featureImportanceMinOrnek: 5,
    featureImportanceTopAday: 8,
    featureImportanceAyirtEdicilikEsigi: 10,
    featureImportanceMediumOrnek: 10,
    featureImportanceHighOrnek: 25,
    featureImportanceVeryHighOrnek: 50,


    // v3.2.5 Pair Importance Lab:
    // Tek tek feature başarısından sonra, iki özelliğin birlikte geldiğinde sinerji üretip üretmediğini ölçer.
    // Trade Engine'e dokunmaz; Telegram raporu ve Argos Dev Console için JSON/CSV çıktı üretir.
    pairImportanceLabAktif: true,
    pairImportanceConsoleExportAktif: true,
    pairImportanceMinOrnek: 4,
    pairImportanceTopAday: 8,
    pairImportanceSinerjiEsigi: 8,
    pairImportanceMediumOrnek: 10,
    pairImportanceHighOrnek: 25,
    pairImportanceVeryHighOrnek: 50,


    // v3.2.6 Triple DNA Lab:
    // Feature ve Pair analizinden sonra, üçlü özellik kümelerinin gerçek avantaj/sinerji üretip üretmediğini ölçer.
    // Trade Engine'e dokunmaz; Telegram raporu ve Argos Dev Console için JSON/CSV çıktı üretir.
    tripleDnaLabAktif: true,
    tripleDnaConsoleExportAktif: true,
    tripleDnaMinOrnek: 3,
    tripleDnaTopAday: 8,
    tripleDnaSinerjiEsigi: 6,
    tripleDnaMediumOrnek: 8,
    tripleDnaHighOrnek: 20,
    tripleDnaVeryHighOrnek: 40,


    // v3.2.7 Confidence Engine:
    // Feature + Pair + Triple DNA Lab sonuçlarını tek güven puanında birleştirir.
    // Trade Engine'e dokunmaz; şimdilik sadece Telegram raporu ve Argos Dev Console için JSON/CSV çıktı üretir.
    confidenceEngineAktif: true,
    confidenceEngineConsoleExportAktif: true,
    confidenceEngineMinOrnek: 3,
    confidenceEngineTopAday: 10,
    confidenceEngineGucluEsik: 58,
    confidenceEngineRiskEsik: 42,
    confidenceEngineHighOrnek: 25,


    // v3.2.8 Live Intelligence Monitor:
    // Confidence Engine skorlarının gerçek TP/SL/BE sonuçlarıyla kalibrasyonunu izler.
    // Trade Engine'e dokunmaz; emir açmaz, engellemez, sadece Telegram ve Console çıktısı üretir.
    liveIntelligenceMonitorAktif: true,
    liveIntelligenceMonitorConsoleExportAktif: true,
    liveMonitorMinOrnek: 3,
    liveMonitorMinBucketSonuc: 5,
    liveMonitorTopAday: 8,
    liveMonitorGucluEsik: 70,
    liveMonitorRiskEsik: 40,
    liveMonitorSapmaEsigi: 12,


    // v3.3.0 Intelligence Console Foundation:
    // Intelligence Layer modüllerini tek bir ortak snapshot altında toplar.
    // Trade Engine'e dokunmaz; emir açmaz, engellemez, sadece rapor ve Console export üretir.
    intelligenceConsoleAktif: true,
    intelligenceConsoleExportAktif: true,
    intelligenceConsoleMinOrnek: 3,
    intelligenceConsoleTopAday: 12,


    // v3.4.0 Exit Optimizer Foundation:
    // MFE/MAE, kaçırılan kâr ve Profit Capture Ratio ölçer.
    // Trade Engine'e dokunmaz; emir açmaz, kapatmaz, stop değiştirmez.
    exitOptimizerAktif: true,
    exitOptimizerExportAktif: true,
    exitOptimizerTelegramAktif: true,
    exitOptimizerTopAday: 8,

    // v3.6.1 Exit Replay Engine Foundation:
    // Kapanan işlemleri farklı çıkış davranışlarıyla sanal olarak yeniden oynatır.
    // Trade Engine'e dokunmaz; emir açmaz, kapatmaz veya stop değiştirmez.
    exitReplayAktif: true,
    exitReplayTelegramAktif: true,
    exitReplayExportAktif: true,
    exitReplayMinOrnek: 3,
    exitReplayFixedTpLevels: [0.40, 0.60, 0.80, 1.00, 1.50],
    exitReplayMfeCaptureLevels: [0.50, 0.60, 0.70, 0.80, 0.90],
    exitReplayTimeMinutes: [5, 10, 15, 20, 30, 45, 60, 90, 120],
    exitReplayPathSampleSeconds: 30,
    exitReplayMaxPathPoints: 600,
    exitReplayTelegramRaporKapanis: 10,
    exitReplayTrendMinMinute: 3,
    exitReplayAtrMultipliers: [1.5, 2.0, 2.5],
    exitReplayAlternativeLadders: [
      { id: 'FAST', label: 'Alternatif Kademe Hızlı', triggers: [0.30, 0.60, 1.00, 2.00], floors: [0.00, 0.20, 0.50, 1.20] },
      { id: 'WIDE', label: 'Alternatif Kademe Geniş', triggers: [0.50, 1.20, 2.50, 4.00], floors: [0.00, 0.40, 1.20, 2.50] }
    ],

    // v3.6.6 DNA Profit Potential Engine:
    // Her DNA için MFE/MAE dağılımı, hedef erişim oranı, net EV ve güvenli çıkış bölgesi üretir.
    // Yalnızca öğrenme katmanıdır; canlı TP/SL/stop kararını değiştirmez.
    dnaProfitPotentialAktif: true,
    dnaProfitMinOrnek: 10,
    dnaProfitSafeReachRate: 70,
    dnaProfitStrongReachRate: 80,
    dnaProfitTargetLevels: [0.20, 0.30, 0.40, 0.50, 0.60, 0.80, 1.00, 1.20, 1.50, 1.80, 2.00, 2.50, 3.00, 4.00, 5.00],
    timeBehaviorAktif: true,
    timeBehaviorMinOrnek: 10,

    // v3.6.2: Restart sırasında aktif kalan pozisyonları öğrenme istatistiklerinden ayır.
    restartGapProtectionAktif: true,

    // v3.4.1 Success Cluster: En başarılı imzaların kesişen kümelerini raporlar; emir motoruna müdahale etmez.
    successClusterAktif: true,
    successClusterExportAktif: true,
    successClusterMinOrnek: 3,
    successClusterHighOrnek: 25,
    successClusterTopAday: 10,



    // v3.4.2 Cluster Intelligence: Kazanan/kaybeden kesişim kümelerini karşılaştırır; emir motoruna müdahale etmez.
    clusterIntelligenceAktif: true,
    clusterIntelligenceExportAktif: true,
    clusterIntelligenceMinSupport: 3,
    clusterIntelligenceEdgeEsik: 12,
    clusterIntelligenceTopAday: 10,



    // v3.5.0 Similarity Learning Core: Geçmiş başarılı/riskli kümeleri yeni işlemler için benzerlik çekirdeğine çevirir; emir motoruna müdahale etmez.
    similarityLearningAktif: true,
    similarityLearningExportAktif: true,
    similarityLearningMinSupport: 3,
    similarityLearningTopAday: 10,
    similarityLearningEdgeEsik: 25,

    // SuperTrend/trend filtresinin gerçekten katkısını ölçer; emir engellemez, sadece loglar.
    superTrendEtkiAnaliziAktif: true,

    // Geç giriş düzeltmesi:
    // true ise SuperTrend onay periyodu sadece kapanmış mumdan değil, canlı fiyatla oluşan geçici trend mumundan da hesaplanır.
    // Böylece fiyat kırılımı önce geldiyse bot trend mum kapanışını beklemeden tetik alabilir.
    canliSniperTetikAktif: true,


    // PUSU KALİTE FİLTRELERİ
    // true ise pusu kurulurken pusu periyodundaki Bollinger orta bandı kontrol edilir.
    // LONG: pusu hedefi pusu orta bandının altında olmalı.
    // SHORT: pusu hedefi pusu orta bandının üstünde olmalı.
    pusuOrtaBandFiltresi: true,

    // Dar Bollinger bantlarında oluşan yanıltıcı pusuları azaltır.
    // Hesap: ((üstBand - altBand) / ortaBand) * 100
    // 0 yaparsan devre dışı kalır.
    minimumBandGenisligiYuzde: 1.0,

    // Çok küçük gövdeli mumların pusu üretmesini engeller.
    // Hesap: abs(open-close) / close * 100
    // 0 yaparsan devre dışı kalır.
    minimumPusuMumGovdesiYuzde: 0.05,

    // ESKİ FİLTRE: Sniper orta band filtresi.
    // Bu sürümde varsayılan kapalıdır; çünkü hedef kırılırken fiyatın sniper orta bandı geçmesi normaldir.
    sniperOrtaBandFiltresi: false,



    // ========================================
    // RİSK VE KALICI HAFIZA KORUMALARI
    // ========================================
    // Sanal pozisyonlar data/sanal-state.json dosyasına kaydedilir.
    // Bot restart olunca aynı pozisyonlar geri yüklenir; aynı sembolde tekrar emir açılmaz.
    sanalPozisyonHafizasiAktif: true,
    kaliciHafizaLogAktif: true,

    // Ani çoklu tetiklerde sistemi sakinleştirir.
    // Bir döngüde en fazla bu kadar yeni pozisyon açılır.
    maxYeniEmirDonguBasina: 1,

    // Günlük toplam yeni emir limiti. 0 = limitsiz.
    gunlukMaxYeniEmir: 0,

    // Pusu raporundaki sembol listesini Telegram'da okunabilir tutar.
    pusuRaporuMaxSembol: 20,
    // v3.0.2: Pusu raporu Telegram'ı kirletmesin diye yalnızca bot açılışından sonraki ilk dolu pusu taramasında gönderilir.
    pusuRaporuSadeceBaslangicta: true,
    renkoPusuStartupTekrarBastirMs: 900000,

    // ========================================
    // TELEGRAM RAPORLAMA
    // ========================================
    // v6.8.3: Telegram yalnız operasyon ekranıdır. Bilimsel ayrıntılar state/ledger/loglarda kalır.
    telegramMinimalOperasyonModu: true,
    telegramMesajMaxKarakter: 3400,
    telegramCanliPanelTimeoutMs: 6000, // R20: panel DIRECT lane; Native->curl bounded, generic bulk/detail kuyruğunu beklemez
    telegramDetayRaporlariAktif: false,
    telegramCanliRaporMaxPozisyon: 10,
    telegramAcilisPusuMaxSatir: 6,
    canliRaporAktif: true,
    canliRaporGuncellemeMs: 30000, // her 30 sn mevcut panel edit edilir; yeni Telegram balonu değildir
    // v6.4.1: Büyük Entry/DNA/Renko replay raporları en fazla 5 dakikada bir kontrol edilir.
    st2DetayRaporMinAralikMs: 900000,
    st2DetayRaporStartupGecikmeMs: 180000,
    st2StartupPanelGecikmeMs: 15000,
    st2GlobalHistoricalCacheMs: 300000,
    st2DetayRaporHeapLimitMb: 190,
    // Telegram editMessageText eski mesajı aşağı taşımaz. Bu süre dolunca eski ana tablo silinir ve yeni tablo en alta gönderilir.
    canliRaporYenidenGondermeMs: 180000, // her 3 dk panel yeni balon olarak alta taşınır; aradaki 30 sn güncellemeler edit'tir
    canliRaporEskiMesajiSil: true,
    telegramStopGuncellemeMesaji: false,

    // ========================================
    // SİSTEM VE VERİ TARAMA
    // ========================================
    // v6.11.0: fiyat/pozisyon koruma döngüsü hızlı kalır; 500ms spin ve ağ baskısı azaltılır.
    pingInterval: 1000,
    taranacakCoinSayisi: 200,
    // null/0 bırakılırsa varsayılan süre kullanılır. Canlı sniper tetik aktif olduğu için ST cache 10 sn'de bir tazelenir,
    // emir kararı ise her ana döngüde canlı fiyatla tekrar hesaplanır.
    pusuVeriTazelemeMs: null,
    superTrendTazelemeMs: null,
    // R13: Golden Renko çekirdeği ST1 3m shadow ağ taramasından izole edilir.
    st1ShadowPeriyodikAktif: true,
    st1ShadowIlkTaramaGecikmeMs: 60000,
    st1ShadowTazelemeMs: 180000,
    st1ShadowIstekTimeoutMs: 6000,
    st1ShadowIstekRetry: 0,
    st2MainLoopWatchdogMs: 20000,
    st2MainLoopWatchdogLogAralikMs: 30000,
    // R18: signed Binance positionRisk mutabakatı Renko/pusu ana döngüsünü bekletmez.
    // Gerçek emir yalnız son başarılı mutabakat tazeyse fail-closed açılabilir.
    st2ExchangeReconcileIntervalMs: 5000,
    st2ExchangeReconcileFreshMs: 15000,
    durumLogAraligiMs: 5000,

    trendBehaviorAktif: true,
    trendBehaviorMinOrnek: 10,

    // v3.7.0 Volatility Behavior: kaydedilmiş PnL/fiyat yolundan gerçekleşen oynaklık karakterini öğrenir.
    // Trade Engine'e müdahale etmez; ATR/OHLC yoksa sahte gösterge üretmez.
    volatilityBehaviorAktif: true,
    volatilityBehaviorMinOrnek: 10,

    // v3.8.0 Kademe Behavior: gerçekleşmiş kademeHistory yolundan DNA'nın
    // maksimum kademe, geçiş süresi, kademe sonrası sonuç ve geri dönüş karakterini öğrenir.
    // Trade Engine'e müdahale etmez; yalnızca öğrenme ve raporlama katmanıdır.
    ladderBehaviorAktif: true,
    ladderBehaviorMinOrnek: 10,
    // v3.9-v3.10: Birleşik Behavior Intelligence ve Exit Consensus yalnızca öğrenme/öneri katmanıdır.
    behaviorIntelligenceMinOrnek: 10,
    exitConsensusMinOrnek: 10,

    // Expectancy Revolution A3: Açıklanabilir Meta Score + Confidence v2.
    // Yalnızca analiz/rapor katmanıdır; emir veya filtre uygulamaz.
    confidenceEngineV2Aktif: true,
    confidenceEngineV2MinOrnek: 10,
    confidenceEngineV2HedefOrnek: 50,
    confidenceEngineV2TopAday: 10,
    confidenceEngineV2ExpectancyScale: 0.20,
    confidenceEngineV2NetScale: 10,

    // Expectancy Revolution A4: LONG/SHORT için ayrı 16x16 DNA Heat Map.
    // Yalnızca analiz ve Telegram görünümüdür; işlem filtrelemez.
    dnaHeatMapAktif: true,
    dnaHeatMapMinOrnek: 10,

    // Expectancy Revolution A5: Aynı BTC/Coin DNA koşulunda LONG ve SHORT yönlerini
    // expectancy, PF, net ve örnek güveniyle karşılaştırır. Yalnızca analizdir.
    directionIntelligenceAktif: true,
    directionIntelligenceMinOrnek: 10,
    directionIntelligenceHedefOrnek: 50,
    directionIntelligenceGucluEdge: 20,

    // AGROS v3.7 A6 - DNA Evolution Engine (yalnızca analiz)
    dnaEvolutionAktif: true,
    dnaEvolutionMinOrnek: 10,
    dnaEvolutionTopAday: 3,

    // AGROS A8 - mevcut analiz motorlarını tek açıklanabilir kararda birleştirir.
    // Yalnızca rapor/karar desteğidir; emir veya otomatik filtre uygulamaz.
    agrosConsensusAktif: true,
    agrosConsensusMinOrnek: 10,
    agrosConsensusTopAday: 3,

    // A8.1 - Consensus Live Validation (yalnızca ileriye dönük analiz)
    consensusValidationAktif: true,
    consensusValidationSnapshotSaat: 6,
    consensusValidationMaksTahmin: 5000,
    consensusValidationMaksSonuc: 10000,


    // A8.2 - A5/A6/A8/A8.1 sonuçlarını tek kısa Telegram dashboard'unda birleştirir.
    // Eski motorlar çalışmaya devam eder; yalnızca ayrı uzun raporlar yerine tek görünüm sunulur.
    intelligenceDashboardAktif: true,
    intelligenceDashboardTopAday: 3,

    // A9 - Her zekâ motorunun ileriye dönük doğruluk ve net katkısını karşılaştırır.
    // Yalnızca analizdir; işlem motoruna veya filtrelere uygulanmaz.
    performanceValidationAktif: true,
    performanceValidationMinKarar: 10,

    // v3.11.0 DNA Exit Selector - SHADOW MODE
    // Replay/Consensus sonucundan DNA bazlı exit planı seçer; gerçek SL/TP/kademe davranışını değiştirmez.
    dnaExitSelectorAktif: true,
    dnaExitSelectorTelegramAktif: true,
    dnaExitSelectorMinOrnek: 20,
    dnaExitSelectorMinBeatRate: 60,
    dnaExitSelectorMinDeltaUsdt: 1.00,
    dnaExitSelectorMinProfitFactor: 1.10,
    dnaExitSelectorMinConsensus: 60,



    // v3.13.0 - Dinamik DNA Exit (shadow)
    dynamicExitEngineAktif: true,
    dynamicExitMinOrnek: 5,
    dynamicExitFallbackMinOrnek: 5,
    dynamicExitMinBeatRate: 55,
    dynamicExitMinRecentAvg: 0,
    dynamicExitCurrentRegimeWindow: 30,
    // v4.0.1 RAM-SAFE: büyük replay geçmişini her kapanışta yeniden kurma.
    dynamicExitModelGuncellemeKapanisAraligi: 5,
    dynamicExitHighVolStepPct: 0.12,
    dynamicExitLowVolStepPct: 0.045,
    dynamicExitHighVolRangePct: 1.50,
    dynamicExitLowVolRangePct: 0.65,
    // v4.2.1: Yalnızca SANAL pozisyonlarda kanıtlı dinamik exit planını gerçekten uygula.
    // Gerçek emir çıkışlarına dokunmaz. Plan yoksa veya model canlı uygulanabilir değilse kademe fallback çalışır.
    sanalDynamicExitAktif: true,
    sanalDynamicExitMaksPathNoktasi: 240,
    // Gerçek emir modu ayrıca açıldığında Premier işlem aynı dinamik exit planıyla yönetilebilir.
    // Varsayılan kapalıdır; gerçek emir yetkisi ve test onayı olmadan etkinleşmez.
    gercekDynamicExitAktif: true,
    // v3.12.0 DNA League Engine - otomatik Premier/Championship/Gelişim/Tarihsel ligleri.
    // İlk sürüm karar ve metadata katmanıdır; gerçek emir filtresi ayrıca açılacaktır.
    dnaLeagueAktif: true,
    dnaLeagueTelegramAktif: true,
    dnaLeagueTelegramTopAday: 3,
    // v3.14: geriye uyumluluk için korunur; Premier seçiminde artık kapasite uygulanmaz.
    dnaLeaguePremierKapasite: 0,
    dnaLeagueChampionshipKapasite: 50,
    dnaLeaguePremierMinOrnek: 5,
    dnaLeagueChampionshipMinOrnek: 5,
    dnaLeagueHistoricalMinOrnek: 20,
    dnaLeaguePremierMinGuven: 50,
    dnaLeaguePremierMinSon20Exp: 0,
    dnaLeaguePremierExitKanitiZorunlu: false,
    // v4.2.2: SANAL test havuzu dinamiktir; o anki Premier + Championship üyeleri işlem açabilir.
    // Gerçek emir kapısı yalnızca Premier olarak fail-closed kalır. Sabit DNA sayısı yoktur.
    // v4.2.6: Eski sanal lig filtresi devre dışı. Tüm geçerli DNA'lar alt öğrenme katmanında sanal açılır.
    premierSanalEmirFiltresiAktif: false,
    sanalTestPremierAktif: true,
    sanalTestChampionshipAktif: true,
    premierTestExperimentId: 'DYNAMIC-LEAGUE-EXIT-2026-07-17',
    premierObservationAktif: true,
    premierObservationTelegramAktif: true,
    premierObservationRaporHerKapanis: 5,
    premierObservationTelegramTopAktif: 8,

    // v4.2.0 REAL ORDER READINESS BRIDGE
    // v4.2.7: Premier ana gerçek katman; kârlı Championship kontrollü küçük boyutla gerçek test alır.
    gercekEmirPremierKapisiAktif: true,
    // v4.8.0: Family ligleri emir yetkisi vermez. Gerçek emir kapısı LAB Premier kanıtı bağlanana kadar kapalıdır.
    gercekEmirChampionshipKapisiAktif: false,
    gercekEmirPremierBoyutCarpani: 1.00,
    gercekEmirChampionshipBoyutCarpani: 1.00,
    // Canlı portföy ekranında eski 2246+ işlem muhasebesini gösterme; veri dosyada korunur.
    canliRaporEskiMuhasebeGoster: false,
    // Üç günlük doğrulama tamamlanmadan true yapılmaz.
    gercekEmirYetkilendirmeAktif: true,
    // AWS .env güvenlik kilidi yalnız canlı modu bilinçli açar; işlem risk değerlerini sabitlemez.
    // Zorunlu: AGROS_REAL_ORDER_ARM=LIVE_TRADING_CONFIRMED ve AGROS_REAL_ORDER_ENV=MAINNET.
    // Tutar, kaldıraç, marjin ve aktif pozisyon limiti aşağıdaki ayarlardan yönetilir.
    gercekEmirOnayKodu: 'LIVE_TRADING_CONFIRMED',
    // Gerçek işlem riski yalnız bu AYARLAR SAYFASI üzerinden yönetilir.
    // Marjin: calisilmakIstenenUsdtMiktar (4), kaldıraç: mevcutKaldirac (5); notional 20 USDT türetilir.
    gercekEmirMarjinTipi: 'ISOLATED',
    // R25: canlı ekonomi tek kaldıraçla karşılaştırılabilir kalsın. Binance istenen 2x'i
    // doğrulamazsa sessizce 1x'e düşmek yerine gerçek giriş fail-closed olur.
    gercekEmirKaldiracFallbackAktif: false,
    // 0 yeni gerçek pozisyonları durdurur; mevcut pozisyon yönetimi devam eder.
    // v6.11.2: değer sabit kurala bağlı değildir; 0 yeni girişi kapatır, 1/2/3... ayarlardan seçilir.
    // R25.3 kontrollü canlı gerçek pozisyon kapasitesi 20'dir; pozisyon başına notional 20 USDT değişmez.
    gercekEmirMaxAktifPozisyon: 20,
    // Canlı modda Binance risk slotundan bağımsız sanal öğrenme havuzu.
    // Sembol başına tek gözlem, toplam en fazla 200; Binance emri göndermez.
    canliShadowOgrenmeAktif: true,
    canliShadowMaksAktifGozlem: 200,
    canliShadowTelegramAcilisMesaji: false,
    // R23.1: R22.2'de eklenen post-close worker korunur; gerçek kapanıştan sonra 24 saat bilimsel fiyat-yolu takibi.
    // Canlı emir/stop/TP üzerinde hiçbir yetkisi yoktur; mevcut canliFiyatlar cache'ini okur, yeni ağ isteği üretmez.
    postClose24hTakipAktif: true,
    postCloseTakipSaat: 24,
    postCloseTakipOrneklemeMs: 60000,
    postCloseTakipStateKayitAraligiMs: 60000,
    postCloseTakipTamamlananSakla: 1000,
    gercekEmirKorumaEmirleriZorunlu: true,
    // Gerçek fill/fiyat sapması için sert güvenlik limiti; R24.2 hotfix bunu değiştirmez.
    gercekEmirMaksNotionalSapmaYuzde: 2,
    // Binance LOT_SIZE nedeniyle hedef notionalın ALTINDA kalan geçerli miktara ayrı tolerans.
    // Hedef notionalın üstüne çıkılmaz; yalnız aşağı sapma en fazla %5 kabul edilir.
    gercekEmirLotSizeAsagiSapmaYuzde: 5,
    gercekEmirAnaAgZorunlu: true,
    // Lig modeli bu süreden eskiyse gerçek emir fail-closed engellenir.
    gercekEmirLigModelMaksYasDakika: 360,
    // v4.6.1 - Tarihsel Premier + Exit tek başına gerçek emir kanıtı sayılmaz.
    // Aynı DNA üst katman sanal kasasında en az 5 kapanışta pozitif PF/Net/Exp üretmelidir.
    gercekEmirIleriDogrulamaAktif: true,
    gercekEmirIleriDogrulamaMinKapanis: 5,
    gercekEmirIleriDogrulamaMinPF: 1,
    gercekEmirIleriDogrulamaMinNet: 0,
    gercekEmirIleriDogrulamaMinExpectancy: 0,
    dnaLeagueChampionshipMinPf: 0.85,
    dnaLeagueChampionshipMinExp: -0.05,
    dnaLeagueTransferKapanisAraligi: 5,
    dnaLeagueWorstDnaLimit: 10,
    dnaLeagueWorstMinOrnek: 5,
    dnaLeagueRejimPenceresi: 60,
    dnaLeagueRejimEdgeEsik: 0.025,
    dnaLeagueExitMinOrnek: 5,
    dnaLeagueExitMinBeatRate: 55,

    // v5.0.2 - Tüm halka açık Binance verisi tek global kuyruktan geçer.
    // Trade Engine değişmez; asılı istekler iptal edilir, aynı mum istekleri birleştirilir.
    binanceAgEszamanlilik: 3,
    binanceAgIsciSayisi: 8,
    // v6.12.1: yalnız başlangıç çekirdeği (15m Renko + 3m ST1) için kontrollü hız; canlı döngü 3 bağlantıda kalır.
    // v6.13.5-R8: R5/R6/R7 FAST-REFRESH scheduler tamamen emekliye ayrıldı; R4'e kadar sahada çalışan profil geri yüklendi.
    binanceStartupAgEszamanlilik: 8,
    // Worker havuzu 8 kalabilir; gerçek shared Binance socket concurrency startup'ta 4 ile sınırlıdır.
    binanceStartupNetworkConcurrency: 4,
    binanceStartupAgIsciSayisi: 16,
    // R25.4: Tek sembolün beklenmeyen/asılı startup işi tüm çekirdek warmup + derin onarımı bloke edemez.
    // Normal Binance request retry bütçesinden geniş tutulur; yalnız gerçek straggler için fail-forward çalışır.
    binanceStartupSymbolDeadlineMs: 180000,
    binanceStartupRepairSymbolDeadlineMs: 180000,
    startupMarketReadyOrani: 0.95,
    startupMarketGuardLogAralikMs: 60000,
    // İmzalı Futures çağrıları Binance sunucu saatine bağlanır; -1021'de bir kez zorunlu senkron + tek retry.
    binanceSignedRecvWindowMs: 15000,
    binanceTimeSyncIntervalMs: 300000,
    binanceTimeMaxAgeMs: 600000,
    binanceTimeSyncTimeoutMs: 5000,
    binanceTimeSyncSamples: 3,
    // Stop yalnız tamamlanmış Renko adımında ve bu minimum aralıktan sonra borsada yenilenir.
    gercekStopMinGuncellemeAralikMs: 3000,
    binanceAgTimeoutMs: 15000,
    // R15: global ticker dedicated agent kullanır; startup boşken çağrılmaz ve canlı döngüde hızlı fail eder.
    futuresTickerTimeoutMs: 6000,
    futuresTickerRetry: 0,
    // Unified live recovery: giriş taraması global ticker geçici bozulduğunda yalnız taze kapanmış 1m snapshot ile devam edebilir.
    // Gerçek açık pozisyon varsa network fiyatı zorunlu kalır; yalnız borsa pozisyon mutabakatı ticker'dan bağımsızdır.
    st2FallbackPriceMaxAgeMs: 120000,
    st2FallbackPriceLogIntervalMs: 30000,
    futuresTickerBackoffBaseMs: 10000,
    futuresTickerBackoffMaxMs: 60000,
    gercekPozisyonMutabakatTimeoutMs: 8000,
    binanceAgRetry: 2,
    binanceAgRetryTabanMs: 900,
    // v6.10.7 - Kapanmış mum yoksa 200 coinlik toplu indirme yapılmaz.
    kapanmisMumYayinGecikmesiMs: 3000,
    binanceTopluVeriRetryMs: 90000,
    globalHistoricalStartupWarmupMs: 600000,

    // v4.7.0 - 2000+ öğrenmenin tam DNA sonuçlarını Family/LAB/FULL katmanlarında korur.
    // Yalnız sanal/gölge ileri doğrulama yapar; ikinci emir açmaz ve gerçek emir yetkisi vermez.
    labChampionAktif: true,
    labChampionTelegramAktif: true,
    labChampionTelegramTopAday: 10,
    labChampionRaporHerKapanis: 5,
    labChampionMinOrnek: 10,
    labChampionMinBasari: 65,
    labChampionMinNet: 0,
    labChampionMinPF: 1,
    labChampionMinExpectancy: 0,
    labChampionExitMinOrnek: 5,
    labChampionExitMinPF: 1,
    labChampionExitMinNet: 0,
    labChampionForwardMinKapanis: 5,
    labChampionForwardMinPF: 1,
    labChampionForwardMinNet: 0,
    labChampionForwardMinExpectancy: 0,

    // v4.9.1 - Tüm stratejilerin kendi verisiyle kullanabileceği ortak Warm Start kanıt motoru.
    evidenceWarmStartAktif: true,
    evidenceWarmStartMinHistorical: 5,
    evidenceWarmStartTargetHistorical: 20,
    evidenceWarmStartMinWinRate: 60,
    evidenceWarmStartMinPF: 1,
    evidenceWarmStartMinNet: 0,
    evidenceWarmStartMinExpectancy: 0,
    evidenceWarmStartExitMinSamples: 5,
    evidenceWarmStartMinConfidence: 60, // yalnız sıralama/audit; sanal Premier için sert kapı değildir
    evidenceConfidenceGateAktif: false,
    evidenceRecent5Aktif: false,
    labRecent5UpperLayerAktif: false, // v5.3.0: Son-5 deney yolu kapatıldı
    evidenceRecentMinSamples: 5,

    // v4.8.0 - Family yalnız kalıcı piyasa hafızasıdır; gerçek lig yarışmacısı LAB DNA'dır.
    // Şimdiki geniş sanal testte tarihsel güçlü + kendi pozitif Exit'i olan LAB doğrudan Premier test havuzuna girer.
    // 5 ileri pozitif kapanış proof seviyesini FORWARD_VERIFIED yapar; daha sonra tek ayarla zorunlu hale getirilebilir.
    labPremierAktif: true,
    labPremierTelegramAktif: true,
    labPremierTelegramTopAday: 9,
    labPremierRaporHerKapanis: 5,
    // v5.4.1 — Kısa ve kesilmeyen ST1 final bilimsel denetim mesajı.
    st1FinalCertificationTelegramAktif: true,
    labPremierModelCacheMs: 30000,
    labPremierExperimentId: 'LAB-PREMIER-DYNAMIC-LEAGUE-2026-07-21',
    labPremierCanliTopTarihsel: 6,
    labPremierTarihselTestAktif: true,
    // v5.0.10: Güçlü giriş DNA, özel Exit beklerken mevcut kademe ile Premier sanal teste katılır.
    labPremierEntryProvenFallbackAktif: true,
    labPremierIleriDogrulamaZorunlu: false,
    labPremierChampionshipUstKatmanAktif: false,
    labPremierGercekEmirYetkisi: true,

    // v5.2.0 - Gerçek emir öncesi bilimsel Stop/BE/Exit/Shadow/Premier denetimi.
    // Yalnız raporlama yapar; Trade Engine ve gerçek emir yetkisi değişmez.
    realOrderPreparationIntelligenceAktif: true,
    realOrderPreparationTelegramAktif: true,

    // v5.1.0 - Sistematik kaybeden LAB aynı sinyalde yalnız sanal ters yön testi açar.
    labReversePremierAktif: true,
    labReverseMinOrnek: 10,
    labReverseShadowMinOrnek: 5,
    labReverseMaxBasari: 35,
    labReverseMaxNet: 0,
    labReverseMaxPF: 1,

    // v5.4.0 — Ana Premier'i etkilemeyen Bottom Premier LONG/SHORT bilimsel ligleri.
    labBottomPremierAktif: true,
    labBottomPremierKapasiteYon: 10,
    labBottomPremierMinOrnek: 5,
    labBottomPremierMaxNet: 0,
    labBottomPremierMaxPF: 1,
    labBottomPremierMaxExpectancy: 0,
    labBottomPremierOwnExitAktif: true,
    familyLeagueEmirYetkisiAktif: false,

    // v4.0 Adaptive Trading League - nihai üç günlük gözlem katmanı.
    adaptiveTradingLeagueAktif: true,
    adaptiveTradingLeagueTelegramAktif: true,
    adaptiveTradingLeagueRaporHerKapanis: 10,


    // v6.10.6 — Güvenli başlangıç korunur; takeover sonrası profil küçük kârı boğmak
    // yerine net expectancy ve uzun kazanan üretme ekonomisine göre seçilir.
    renkoCikisEvolutionAktif: true,
    // v6.10.8: Canlı stop tekrar kanıtlanmış modele döndü: komisyon sonrası güvenli taban + zirveden öğrenilmiş Renko tuğla mesafesi.
    // ATR/MFE adayları bilimsel replay üretir; canlı stopu doğrudan yönetmez.
    // v6.10.9: canlı stop yalnız komisyon-güvenli Renko tuğla takibidir.
    // Her pozisyon açılışta kendi mesafesini alır ve kapanana kadar dondurulur.
    renkoCikisCanliModu: 'SAFE_COMMISSION_BRICK_TRAIL',
    renkoCikisAdayTugla: [0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00],
    renkoCikisVarsayilanTugla: 1.00,
    // v6.11.2: 1.00T güncelleme adımı güçlü hareketlerde fazla giveback üretiyordu; yalnız tamamlanmış 0.50T adımında ilerler.
    renkoCikisStopGuncellemeAdimTugla: 0.50,
    // Tek kapanışın aşırı sıkı profili canlıya taşımasını engeller. İşlem açılışını engellemez;
    // yeterli kanıt yoksa güvenli varsayılan exit profili kullanılır.
    // N5 mevcut öğrenilmiş profili kullanmak için bekleme değildir.
    // Yalnız yeni bir aday tuğla mesafesinin gelecekteki pozisyonlara terfi kapısıdır.
    renkoCikisIlkAtamaKapanis: 5,
    renkoCikisMfeKorumaTetikYuzde: 0.40,
    renkoCikisMinMfeKorumaOrani: 0.55,
    // ATR 1.00× ve MFE %80–90 profilleri normal geri çekilmelerde uzun kazananı kesiyordu.
    // Aday uzayı ekonomik olarak nefes alan fakat güvenli tabanı koruyan aralığa çekildi.
    renkoCikisAtrCarpanAdaylari: [1.25, 1.50, 1.75, 2.00, 2.50, 3.00],
    renkoCikisMfeYakalamaAdaylari: [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70],
    renkoCikisVarsayilanAtrCarpani: 1.50,
    renkoCikisVarsayilanMfeYakalamaOrani: 0.55,
    renkoCikisMinimumMfeYakalamaOrani: 0.40,
    renkoCikisMaksimumMfeYakalamaOrani: 0.70,
    // v6.11.2: Canlı kâr tabanı ve Renko devralması doğrudan ayarlardan yönetilir.
    // Hiçbir eşik tpAdimYuzdesi × kademe veya başka bir '2 katı' kuralından türetilmez.
    // v6.13.5-R3: Erken ekonomi koruması K1 güvenli tabandan AYRIDIR.
    // +%0.25 MFE görülünce başlangıç -%1.50 stop artık korunmaz; brüt +%0.20
    // erken ekonomi tabanı kilitlenir (yaklaşık net +%0.10). Eski komisyon-güvenli
    // K1 sözleşmesi +%0.50 -> +%0.40 ve K2 Renko aktivasyonu +%0.60 aynen korunur.
    renkoCikisErkenEkonomiTetikYuzde: 0.25,
    renkoCikisErkenEkonomiTabanYuzde: 0.20,
    renkoCikisErkenEkonomiMinimumNetKarYuzde: 0.10,

    // v6.13.5-R23 — CONFIRMED LONG LIFE (yalnız yeni pozisyon atamasında dondurulur).
    // LONG/SHORT yönünden bağımsızdır; "LONG LIFE" pozisyon ömrü anlamındadır.
    // CONFIRMED K0.5 +%0.25 -> +%0.20 erken ekonomi kilidini kullanmaz.
    // K1 +%0.50 -> +%0.40 ve K2 +%0.60 Renko takeover aynen korunur.
    // +%1.50 sabit TP değildir; ölçüm hedefidir. Renko güçlüyse runner devam eder.
    renkoConfirmedLongLifeAktif: true,
    renkoConfirmedLongLifeTarget1Yuzde: 1.50,

    // R25 — erken kâr koruma ekonomisi. Başlangıç risk SL'si -%2.50 korunur.
    // +%1.50 görülünce +%1.00; +%2.00 görülünce +%1.50; +%2.50 görülünce +%2.00.
    // Sonra her +%0.50 yeni kâr kademesinde stop +%0.50 ilerler; yaklaşık %0.50 geriden.
    // Gerçek Premier ve ana sanal/shadow yaşamlar aynı metodla yönetilir; stop asla gevşemez.
    confirmedYuzdeselEkonomiAktif: true,
    confirmedYuzdeselEkonomiAktivasyonYuzde: 1.50,
    confirmedYuzdeselEkonomiIlkKilitYuzde: 1.00,
    confirmedYuzdeselEkonomiTakipMesafeYuzde: 0.50,
    confirmedYuzdeselEkonomiAdimYuzde: 0.50,

    renkoCikisKarTabaniAktivasyonYuzde: 0.50,
    renkoCikisCanliAktivasyonYuzde: 0.60,
    renkoCikisGuvenliKarTabaniYuzde: 0.40,
    renkoCikisMinimumNetKarYuzde: 0.30,
    // ATR/MFE yalnız gölge replay'dir; runner arm seviyesi de çarpanla değil doğrudan ayarlanır.
    renkoCikisMfeKorumaAktivasyonYuzde: 1.20,
    renkoCikisMinimumDevralmaYuzde: 0.25,
    renkoCikisMinimumAtrCarpani: 1.25,
    renkoCikisOnlineEmaAlpha: 0.35,
    renkoCikisOnlineGuvenOnculN: 6,
    // v6.5.0 — Canlı davranışı değiştirmeyen devralma + takip ortak shadow replay.
    renkoDevralmaAdayKarYuzde: [0.25, 0.40, 0.50, 0.75, 1.00, 1.25],
    renkoSuperLigMinKapanis: 5,
    renkoSuperLigMinPf: 1.30,
    renkoSuperLigMinMfeCapture: 25,
    renkoSuperLigMinUstunlukYuzde: 10,
    telegramIslemAcilisMesaji: true,
    telegramPusuMesaji: false,
    telegramRenkoDevralmaMesaji: true,
    manuelKapanisYenidenGirisKilidiMs: 3600000,

    // v3.11.2 Exit Evolution Telegram Dashboard:
    exitEvolutionDashboardAktif: true,
    exitEvolutionDashboardTopModel: 5,
    exitEvolutionDashboardTopDna: 5,
    exitEvolutionDashboardMinDnaOrnek: 10,
};


// v5.9.0 Adaptive Pattern DNA Entry: son-3 canlı replay lideri için anlamlı üstünlük kapıları.
ayarlar.renkoDnaSon3MinNetFarki = Number(process.env.AGROS_RENKO_DNA_LAST3_MIN_NET_EDGE || 0.10);
ayarlar.renkoDnaSon3MinOransalFark = Number(process.env.AGROS_RENKO_DNA_LAST3_MIN_RELATIVE_EDGE || 0.15);

module.exports = ayarlar;
