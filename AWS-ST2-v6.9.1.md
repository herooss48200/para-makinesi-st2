# AWS Dağıtımı — AGROS ST2 v6.9.1

## Dağıtım

```bash
cd ~/apps/para-makinesi-st2
pm2 stop agros-st2
git pull --ff-only origin main
npm ci
npm test
```

## Önce kuru audit

```bash
npm run calibrate:premier
cat data/st2-premier-score-calibration-report.md
```

Bu komut canlı ayarı değiştirmez. Eski katı sistem, v6.9.0 ve optimize adayın train/validation sonuçlarını üretir.

## Güvenli ise etkinleştirme

Kuru audit çıktısında `UYGULANABİLİR` yazıyorsa:

```bash
npm run calibrate:premier:apply
pm2 start ecosystem.config.js --only agros-st2 --update-env
pm2 save
```

Kalibrasyon güvenli değilse `data/st2-premier-score-calibration.json` yazılmaz ve v6.9.0 varsayılan modeli korunur.

## Doğrulama

```bash
pm2 status
pm2 logs agros-st2 --lines 120 --nostream
```

Operasyon raporunda `Premier modeli: CALIBRATED` veya `DEFAULT` görünür. Yeni pusu mesajında skorun neden oluştuğu açıkça gösterilir.
