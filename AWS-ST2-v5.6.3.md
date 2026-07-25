# AWS Komutları

## Güvenli deploy
```bash
bash scripts/deploy-st2-safe.sh /tmp/AGROS-ST2-v5.6.3.zip
```

## Temiz bilimsel reset (yalnız bilinçli başlangıçta)
```bash
cd ~/apps/para-makinesi-st2
AGROS_DATA_DIR=~/apps/para-makinesi-st2/data npm run reset:st2-science
pm2 restart agros-st2 --update-env
pm2 save
```

## Doğrulama
```bash
npm run verify:v563
pm2 logs agros-st2 --lines 200
```

## Beklenen ilk durum
Aktif pozisyon 0, Restart GAP 0, aktif pusu 0; Entry Evolution Pattern 0/16, bilimsel kapanış 0, öğrenilmiş giriş 0; Premier bilimsel aktif/kapanan ve TP/SL/BE N0. Telegram karar zinciri “Henüz doğrulanmış örnek yok” gösterir.
