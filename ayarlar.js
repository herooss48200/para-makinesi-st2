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
    calisilmakIstenenUsdtMiktar: 5,
    mevcutKaldirac: 10,
    maxPozisyonSayisi: 100,

    // ========================================
    // EMİR MODU
    // ========================================
    // true  = Binance'e emir göndermez, sanal pozisyon açar/kapatır.
    // false = Binance Futures'a gerçek/testnet emir gönderir.
    sanalEmirModu: true,
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
    izSurenStopTakipYuzdesi: 0.4,
    izSurenStopAktivasyon: 0.8,
    stopBildirimMinYuzde: 0.01,
    stopBildirimMinSaniye: 0,

    // ========================================
    // KAR KADEMELERİ
    // ========================================
    tpAdimYuzdesi: 0.4,
    maxTpYuzdesi: 10.0,
    tpKademeSayisi: 25,

    // ========================================
    // SABİT STOP LOSS VE TAKE PROFIT
    // ========================================
    sabitStopYuzdesi: 1.5,
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
    sniperPeriyodu: '3m',
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
    dnaFilterSimulatorKumulatifAday: 5,
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

    // ========================================
    // TELEGRAM RAPORLAMA
    // ========================================
    canliRaporAktif: true,
    canliRaporGuncellemeMs: 30000,
    // Telegram editMessageText eski mesajı aşağı taşımaz. Bu süre dolunca eski ana tablo silinir ve yeni tablo en alta gönderilir.
    canliRaporYenidenGondermeMs: 180000,
    canliRaporEskiMesajiSil: true,
    telegramStopGuncellemeMesaji: true,

    // ========================================
    // SİSTEM VE VERİ TARAMA
    // ========================================
    pingInterval: 500,
    taranacakCoinSayisi: 100,
    // null/0 bırakılırsa varsayılan süre kullanılır. Canlı sniper tetik aktif olduğu için ST cache 10 sn'de bir tazelenir,
    // emir kararı ise her ana döngüde canlı fiyatla tekrar hesaplanır.
    pusuVeriTazelemeMs: null,
    superTrendTazelemeMs: null,
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

};

module.exports = ayarlar;
