# AGROS ST2 v6.13.5-R17 — UNIFIED LIVE RECOVERY FINAL

## Canlıda doğrulanan kök sorunlar

1. Ana döngü global Futures ticker'da sorun yaşadığında `POSITION_PROTECTION` aşamasına ulaşamıyordu.
2. `4_pozisyon.js` gerçek pozisyon mutabakatından önce `canliFiyat` şartı arıyordu. Bu nedenle Binance'ta kapanmış pozisyon, ticker/cache yoksa state'te hayalet pozisyon olarak kalabiliyordu.
3. R16'da hazırlanmış `93_st2_market_price_runtime.js` ve closed-1m fallback sözleşmesi rollback sonrası çalışan `bot.js` / `revizyon.js` zincirinden kopmuştu.
4. Telegram Native + Curl circuit aynı anda açık olduğunda panel işleri doğrudan düşürülüyor, panel hattının kontrollü recovery probe yapması mümkün olmuyordu.
5. Panel, kullanılan fiyat kaynağını göstermediğinden ticker/fallback gerçeği operasyon ekranında görünmüyordu.

## R17 düzeltmeleri

- Binance gerçek pozisyon mutabakatı global ticker'dan önce ve ondan bağımsız çalışır.
- `futuresPositionRisk` okuması wall-clock deadline ile sınırlandırılır; doğrulanamazsa yeni giriş/stop ilerletme fail-closed olur.
- Binance'ta miktarı sıfır olan gerçek pozisyon, canlı fiyat cache'i boş olsa dahi Binance fill/accounting ile kapanış mutabakatına alınır ve slot serbest bırakılır.
- İlk Golden Renko auditinde taze kapanmış 1m snapshot fiyatı kullanılır; global ticker ilk audit'i bloke etmez.
- Normal çalışmada Futures ticker tercih edilir; geçici ticker arızasında, gerçek açık pozisyon yoksa ve closed-1m snapshot yeterince tazeyse Renko entry scan kontrollü devam eder.
- Gerçek açık pozisyon varken network ticker zorunluluğu korunur; stop/trailing güvenliği fail-closed kalır.
- Startup ve 1m refresh, `canliFiyatMeta` + closed-1m fallback kaynağını günceller.
- Telegram dual-circuit durumunda yalnız canlı panel hattı kontrollü aralıkla Native IPv4 recovery probe yapabilir; detail trafik circuit korumasında kalır.
- Canlı panel `Fiyat <SOURCE> fresh/total` bilgisini gösterir.
- Sürüm görünürlüğü `6.13.5-R17-UNIFIED-LIVE-RECOVERY-FINAL` olarak güncellendi.

## Korunan karar matematiği

- Golden Renko pattern/BB mantığı
- Entry Evolution offset matematiği
- DIRECT / CONFIRMED Entry Mode Policy seçim matematiği
- Premier/Shadow gerçek emir yetkisi
- 1m Renko ST readiness ve 80→240→480 onarım mantığı
- Gerçek emir boyutlandırma
- Stop / early economy / profit-floor / Renko trail / dynamic exit matematiği
- Williams %R shadow-only davranışı

## Kritik davranış

- Binance gerçeği ile local state ayrışırsa Binance pozisyon gerçeği önceliklidir.
- Binance positionRisk doğrulanamazsa yeni gerçek giriş yoktur.
- Gerçek açık pozisyon varken network fiyatı doğrulanamazsa stop/trailing ilerletilmez; mevcut Binance koruma emirleri korunur.
- Telegram arızası trade loop'u bloke etmez.
