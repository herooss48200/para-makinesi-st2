# Para Makinesi Binance / Argos v2.1.14.1

Bu sürüm son çalışan v2.1.13 paketi baz alınarak hazırlandı. Strateji mantığı değiştirilmedi; ölçüm ve raporlama güçlendirildi.

## Zaman Dilimleri

- SuperTrend / Trend filtresi: `1h`
- Pusu: `1h`
- Sniper: `3m`

## Eklenen Analiz Merkezi

Yeni dosya: `7_analiz_merkezi.js`

Sistem artık her açılış ve kapanış için `data/argos-trade-analiz.jsonl` ve `data/argos-trade-analiz.csv` dosyalarına kayıt yazar.

Kaydedilen başlıca veriler:

- tradeId
- symbol / yon
- trend, pusu, sniper TF
- SuperTrend yönü ve kaynak
- pusu kalite puanı ve sınıfı
- giriş / kapanış fiyatı
- SL / TP
- MFE / MAE
- net PNL / komisyon
- kapanış sebebi

## Telegram Canlı Rapor

Canlı rapora şu bölüm eklendi:

- LONG açılan işlem sayısı
- LONG A/B/C/D kalite dağılımı
- LONG TP/SL/BE ve başarı oranı
- LONG net PNL
- SHORT açılan işlem sayısı
- SHORT A/B/C/D kalite dağılımı
- SHORT TP/SL/BE ve başarı oranı
- SHORT net PNL
- Son 10 kapanan işlem

## Not

Bu sürümün amacı emir iyileştirme veya strateji değişikliği değil, sistemi ölçülebilir hale getirmektir.
