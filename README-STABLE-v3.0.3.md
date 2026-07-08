# AGROS Strategy Lab v3.0.3 BTC Uyum Rapor Fix

Bu sürüm işlem motoruna dokunmadan yalnızca raporlama/analiz katmanını düzeltir.

## Düzeltmeler

- BTC/Coin uyum analiz raporu artık dakika bazlı ayrı Telegram mesajı olarak gelir.
- Dakika bazlı rapor, `blackboxIstatistikMinIslem` kapanış minimumuna takılıp sessiz kalmaz.
- İlk dakika raporu bot açılışından hemen sonra değil, `blackboxIstatistikRaporAraligiDakika` süresi dolunca gönderilir.
- Rapor başlığı `BTC/COIN UYUM ANALİZ RAPORU` olarak netleştirildi.
- Kapanış bazlı her N kapanış raporu korunmuştur.
- Pusu raporu davranışı v3.0.2’deki gibi sadece ilk dolu açılış pusu raporu olacak şekilde korunmuştur.

## Beklenen Telegram davranışı

1. Bot açılış mesajı gelir.
2. İlk dolu pusu taramasında 1 kez PUSU RAPORU gelir.
3. Normal canlı rapor kendi periyodunda gelir.
4. Ayarlanan süre dolunca ayrıca BTC/COIN UYUM ANALİZ RAPORU gelir.

Varsayılan ayarlar:

```js
blackboxIstatistikRaporuAktif: true
blackboxIstatistikDakikaRaporuAktif: true
blackboxIstatistikRaporAraligiDakika: 10
```
