# AGROS Strategy Lab v3.0.2 REPORT FIX

Bu sürüm işlem motoruna dokunmadan analiz ve Telegram raporlama katmanını düzeltir.

## Düzeltmeler

- `Aynı Tam Kombinasyon + BB` bölümünde ADA/YFI gibi işlemlerde `DOGEUSDT` görünmesine yol açan coin adı karışıklığı düzeltildi.
- Tam kombinasyon etiketi coin bağımsız hale getirildi: aynı imza farklı coinlerde birikmeye devam eder, raporda yanlış coin adı yazmaz.
- Strategy Lab toplu başarı/uyum analizi artık sadece `her 10 kapanış` şartına bağlı değildir.
- `ayarlar.js` içine dakika bazlı ayrı Telegram raporu eklendi:
  - `blackboxIstatistikDakikaRaporuAktif: true`
  - `blackboxIstatistikRaporAraligiDakika: 10`
- Pusu raporu Telegram kirliliğini azaltmak için sadece bot açılışından sonraki ilk dolu pusu taramasında gönderilir:
  - `pusuRaporuSadeceBaslangicta: true`

## Not

Bu sürüm emir açma, kapama, SL/TP, kademeli stop ve strateji karar motoruna müdahale etmez.
