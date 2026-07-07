# PARA MAKİNESİ BINANCE — v3.0.0 AGROS STRATEGY LAB 256 MATRIX

## Amaç
Bu sürüm strateji geliştirmez ve işlem motoruna dokunmaz. Hedef, her kapanan işlemden BTC-Coin zaman dilimi ilişkisini saf 256 kombinasyon matrisi olarak öğrenmektir.

## Eklenen ana özellik
Her kapanan işlemde aşağıdaki 8 zaman dilimi imzası ayrı istatistiklenir:

- BTC: 5m / 15m / 1h / 4h
- Coin: 5m / 15m / 1h / 4h

LONG işlemde UP olan TF `1`, ters olan TF `0` sayılır. SHORT işlemde DOWN olan TF `1`, ters olan TF `0` sayılır.

Örnek:

```text
LONG | BTC 5m🟢 15m🟢 1h🟢 4h🟢 | Coin 5m⚫ 15m🟢 1h⚫ 4h⚫
```

Makine imzası:

```text
YON=LONG|BTC=1111|COIN=0100
```

## Telegram raporu
Her 10 kapanan işlemde Telegram raporuna şu bölüm eklenir:

```text
🧬 256 BTC×COIN İMZA MATRİSİ
🏆 En Başarılı 256 İmzaları
☠️ En Başarısız 256 İmzaları
🔁 256 Matris Ters Yön Test Adayları
```

Her imza için şunlar yazılır:

- Bu 256 imzasının başarı oranı
- Başarısızlık oranı
- Örnek sayısı
- TP / SL / BE
- Net ve ortalama net
- Güven seviyesi
- Ters yön test adayı kararı

## Önemli güvenlik notu
Bu sürüm otomatik olarak LONG yerine SHORT veya SHORT yerine LONG açmaz. Sadece Telegram’da bilimsel test adayı olarak işaretler. İşlem motoru, pusu/sniper, TP/SL, trailing ve kasa mantığı değiştirilmemiştir.

## AWS kullanım
```bash
npm install
npm run check
pm2 restart para-makinesi
pm2 logs para-makinesi
```
