# AGROS ST2 v6.9.2 — FAST PREMIER CALIBRATION

## Amaç
v6.9.1 kronolojik Premier kalibrasyonunun bilimsel kurallarını değiştirmeden, 206 civarı kapanışta gereksiz uzun süren brute-force hesaplamayı hızlandırır.

## Değişiklik
- 1.400 ağırlık ve 280 politika kombinasyonu korunur: toplam 392.000 model.
- Kapanış bileşenleri tek kez sayısal matrise dönüştürülür.
- Her ağırlık vektörünün vaka ve kohort skorları tek kez hesaplanır.
- Aynı sonuca çıkan eşik politikaları önbellekten okunur.
- Bellekte yalnız en iyi 10 aday tutulur.
- Komut ilerlemeyi yüzde, model sayısı, tekil değerlendirme ve süreyle gösterir.
- Kalibrasyon uygulanmadan sürüm etiketi `CALIBRATION-READY` olarak görünür.

## Güvenlik
- Dry run aktif modeli değiştirmez.
- `--apply` yalnız fail-closed validation koşulları geçerse calibration dosyasını atomik yazar.
- Trade Engine, giriş, stop, BE, exit, state ve ledger formatları değişmez.

## AWS sırası
```bash
cd ~/apps/para-makinesi-st2
git pull --ff-only origin main
npm ci
npm test
npm run calibrate:premier
```

Sonuç `UYGULANABİLİR` ise ancak incelemeden sonra:
```bash
npm run calibrate:premier:apply
pm2 restart agros-st2 --update-env
pm2 save
```
