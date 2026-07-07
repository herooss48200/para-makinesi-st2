# Para Makinesi Binance v2.5.3 - AGROS STRATEGY LAB

Bu sürüm işlem motoruna dokunmadan BlackBox analiz katmanını Strategy Lab seviyesine taşır.

## Amaç

Stratejiyi tahminle değiştirmek yerine, hangi zaman dilimi / Bollinger / pusu kalite / senaryo kombinasyonlarının gerçekten kazandırdığını Telegram ve CSV/JSONL kayıtlarından görmek.

## Eklenenler

- Aktif deney kimliği ve deney etiketi.
- Trend/SuperTrend TF, pusu TF, sniper TF, ST ayarları, BB ayarları, stop modu ve kaldıraç her BlackBox kapanışına yazılır.
- Telegram raporlarında aktif deney bilgisi görünür.
- Her 10 kapanışta ayrı BlackBox istatistik raporu gelir.
- Deney / periyot karşılaştırması eklendi.
- BTC 5m/15m/1h/4h etkisi ayrı ayrı UP/DOWN + LONG/SHORT kırılımıyla raporlanır.
- Coin 5m/15m/1h/4h etkisi ayrı ayrı UP/DOWN + LONG/SHORT kırılımıyla raporlanır.
- Agros Bulgusu: en güçlü ve en zayıf ölçümü örnek sayısı, başarı oranı, net PNL ve güven seviyesiyle özetler.

## Önemli

- Emir yönü revizyonu yoktur.
- TP/SL/BE, kasa, iz süren stop ve pozisyon açma kuralları değiştirilmedi.
- Bu sürüm ölçüm ve karar laboratuvarıdır.

## Deney etiketi kullanımı

Ayarlar dosyasında istenirse şu alanlar doldurulabilir:

```js
strategyLabDeneyId: 'EXP-3m-15m-3m-001',
strategyLabDeneyAdi: '3m trend + 15m pusu + 3m sniper test',
```

Boş bırakılırsa bot ayarlardan otomatik deney ID üretir.

## Takip edilecek Telegram bölümleri

- AKTİF DENEY
- BLACKBOX TREND ETKİSİ
- AGROS KARAR LABORATUVARI
- BTC TF Detay Haritası
- Coin TF Detay Haritası
- AGROS BULGUSU

## Kontrol

`npm run check` başarıyla geçmiştir.
