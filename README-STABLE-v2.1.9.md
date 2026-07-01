# Para Makinesi Binance - AWS Stable v2.1.9

## Amaç

Bu sürüm stratejiyi değiştirmeden veri toplama katmanını güçlendirir.
Ana çalışma periyodu artık:

- Pusu: `30m`
- Sniper: `3m`

## Eklenen Ölçümler

Pusu Kalite Motoru korunmuştur. Buna ek olarak SuperTrend Etki Analizi açılış ve kapanış kayıtlarına yazılır:

- `stUyumlu`: Pusu yönü ile SuperTrend yönü uyumlu mu?
- `stYasMum`: SuperTrend kaç kapanmış sniper mumu boyunca aynı yönde?
- `stMesafeYuzde`: Giriş fiyatının SuperTrend çizgisine uzaklığı
- `stKaynak`: CANLI veya KAPANMIS
- `stDurum`: YENI_DONUS / GECIS_BOLGESI / OTURMUS_TREND
- `stEtkiPuani`: 0-20 arası ölçüm puanı

## Önemli Not

Bu sürümde SuperTrend puanı filtre değildir. İşlem engellemez.
Amaç 100-300 işlem boyunca 30m/3m yapıda SuperTrend gerçekten katkı veriyor mu, bunu istatistiksel olarak görmektir.

## Log Dosyaları

- `data/pusu-kalite-islemler.jsonl`
- `data/pusu-kalite-islemler.csv`

