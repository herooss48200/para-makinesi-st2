# ParaMakinesiBinance v2.5.5 — AGROS STRATEGY LAB RADAR

Bu sürüm işlem motoruna dokunmadan AGROS Strategy Lab'in Telegram öğrenme katmanını güçlendirir.

## Eklenenler

- Her 10 kapanan işlemde ayrı **AGROS Strategy Lab Radar** Telegram raporu gönderilir.
- En başarılı imzalar başarı oranı, TP/SL/BE, net PNL ve güven seviyesiyle gösterilir.
- En başarısız imzalar ayrı listelenir.
- `%100 başarısız imza alarmı` eklendi.
- Büyük oranda başarısız imzalar için **ters yön test adayı** üretildi:
  - SHORT başarısızsa LONG test adayı,
  - LONG başarısızsa SHORT test adayı.
- Bu öneriler sadece analiz/deney uyarısıdır; emir motoru yön değiştirmez.

## Yeni ayarlar

```js
blackboxTersYonMinOrnek: 10,
blackboxTersYonBasariEsigi: 35,
```

## Güvenlik notu

Bu sürüm otomatik ters işlem açmaz. Önce Telegram’dan başarısız kombinasyonları izleyeceğiz. Yeterli örnek birikirse sonraki sürümde bu veriye dayalı kontrollü filtre/ters-yön deney modu ayrıca tasarlanabilir.
