# Para Makinesi Binance - AWS Stable v2.1.8

## Ana hedef

v2.1.8 sürümü stratejiyi değiştirmeden Pusu Kalite Motoru'nu ölçüm ve analiz katmanı olarak tamamlar.

Bu sürümde kalite sınıfı emir engellemez. A/B/C/D sınıfları sadece veri toplamak için kullanılır.

## Eklenen kalite metrikleri

- Mum gövde oranı
- Üst fitil oranı
- Alt fitil oranı
- Yönlü kapanış gücü
- Bollinger band temas kalitesi
- Bollinger orta banda uzaklık
- Bollinger band genişliği
- Senaryo tipi
- 0-100 kalite puanı
- A/B/C/D kalite sınıfı

## Kayıt dosyaları

Bot çalışırken analiz kayıtları otomatik olarak şu dosyalara yazılır:

- `data/pusu-kalite-islemler.jsonl`
- `data/pusu-kalite-islemler.csv`

Her işlem için iki kayıt üretilir:

1. `ACILIS`: İşlem açıldığı andaki pusu kalitesi
2. `KAPANIS`: İşlem kapandığında TP/SL/BE sonucu ve PNL bilgisi

## Strateji notu

- 15m pusu yalnızca kapanmış mumdan kurulur.
- 1m sniper canlı tetik mantığı korunur.
- Hedef = Tetik mantığı korunur.
- Pusu kalite puanı şimdilik filtre değildir.

## Sonraki aşama

100-300 işlem verisi toplandıktan sonra A/B/C/D sınıflarının TP/SL performansı analiz edilip v2.2.x sürümünde istatistiksel kalite filtresi geliştirilebilir.
