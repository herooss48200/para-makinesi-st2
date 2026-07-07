# ParaMakinesiBinance v2.5.6 — AGROS STRATEGY LAB RATIO RADAR

Bu sürüm AGROS Strategy Lab raporunu Telegram’dan okunabilir karar formatına taşır.

## Eklenenler

- Her 10 kapanan işlemde Strategy Lab Radar raporu devam eder.
- Her imza için artık açıkça şu bilgiler yazılır:
  - `🎯 İmza başarı oranı: %...`
  - başarısızlık oranı
  - BE oranı
  - örnek sayısı
  - TP / SL / BE sayısı
  - toplam net ve ortalama net
  - güven seviyesi
  - karar satırı
- %100 başarısız veya çok büyük oranda başarısız imzalar için ters yön test adayı daha görünür yazılır.

## Güvenlik notu

Bu sürüm işlem motoruna dokunmaz. SHORT yerine LONG veya LONG yerine SHORT otomatik açmaz. Sadece AGROS Strategy Lab içinde bilimsel deney önerisi üretir.

## Kontrol

```bash
npm run check
```

## AWS start

```bash
cd ~/para-makinesi-binance
git pull
npm install
pm2 restart para-makinesi
pm2 logs para-makinesi
```
