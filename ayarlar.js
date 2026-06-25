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
    maxPozisyonSayisi: 40,

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

    // KADEME modunda 1. kademe girişe çeker, 2. kademe 1. kademeyi korur.
    breakevenTetikYuzde: 0.4,
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
    // Pusu ve sniper periyotları birbirinden tamamen bağımsızdır.
    // Örnekler: '5m', '15m', '1h', '4h'.
    pusuPeriyodu: '4h',
    sniperPeriyodu: '5m',

    // ========================================
    // PUSU VE TETİKLEME KURALLARI
    // ========================================
    proximityYuzdesi: 0.5,
    tetikYuzdesi: 0.25,
    maxPusuBeklemeMum: 3,
    // Pusu süresi içinde fiyat kırılımı ve SuperTrend onayı hangi sırayla gelirse gelsin,
    // ikisi de tamamlandığı anda işlem açılır. Pusu sadece maxPusuBeklemeMum dolunca iptal edilir.
    pusuTetikSirasiSerbest: true,

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
    // null/0 bırakılırsa bot bu süreleri seçilen periyoda göre otomatik ayarlar.
    pusuVeriTazelemeMs: null,
    superTrendTazelemeMs: null,
    durumLogAraligiMs: 5000
};

module.exports = ayarlar;
