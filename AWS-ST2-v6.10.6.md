# AWS Dağıtımı — AGROS ST2 v6.10.6

## Dağıtım öncesi

Gerçek açık pozisyon varsa Binance üzerindeki SL/TP korumalarını doğrula. En güvenli dağıtım anı açık gerçek pozisyon bulunmayan andır.

```bash
cd ~/apps/para-makinesi-st2
pm2 status
git status --short
```

## Patch kurulumu

Patch ZIP dosyasını repo köküne yükledikten sonra:

```bash
cd ~/apps/para-makinesi-st2
mkdir -p ~/agros-backups/v6.10.6-pre
cp 74_st2_renko_exit_evolution.js 85_st2_real_order_execution.js ayarlar.js versiyon.js package.json package-lock.json ~/agros-backups/v6.10.6-pre/
unzip -o AGROS-ST2-v6.10.6-MANUAL-CLOSE-AUTO-REARM-PROFIT-ECONOMY-PATCH.zip
npm test
pm2 restart agros-st2 --update-env
pm2 status
pm2 logs agros-st2 --lines 120
```

## Beklenen doğrulamalar

```bash
grep -n "6.10.6-MANUAL-CLOSE-AUTO-REARM-PROFIT-ECONOMY" versiyon.js
grep -n "MANUAL_EXTERNAL_CLOSE_AUTO_REARM" 85_st2_real_order_execution.js
grep -n "PROFIT_RUNNER_ARM_WAIT" 74_st2_renko_exit_evolution.js
```

## Manuel gerçek kapanış kabul testi

1. Küçük gerçek pozisyonu Binance ekranından manuel kapat.
2. Botun kapanışı `MANUAL_EXTERNAL_CLOSE` olarak mutabakat etmesini bekle.
3. `globalBlock` alanında `MANUAL_EXTERNAL_CLOSE_REARM_REQUIRED` oluşmamalı.
4. Başka uygun sembolde yeni gerçek emir restart gerektirmeden açılabilmeli.
5. Aynı sembol/yön mevcut yerel cooldown süresince tekrar açılmamalı.

## Kâr ekonomisi kabul testi

- Takeover gerçekleştiğinde ilk stop güvenli `+%0.15` tabanına gelmeli.
- Peak runner eşiğine ulaşmadan ATR/MFE stopu sıkılaşmamalı.
- Runner başladıktan sonra uygulanan stop peak kârın `%70`inden daha sıkı olmamalı.
- Yeni online profil N5 ve pozitif ekonomi kanıtı olmadan aktif olmamalı.
- Telegram'da eski `ATR 1.05× / MFE %87` profilinin yeni pozisyonda devam etmemesi beklenir.

## Geri alma

```bash
cd ~/apps/para-makinesi-st2
cp ~/agros-backups/v6.10.6-pre/* .
pm test
pm2 restart agros-st2 --update-env
```
