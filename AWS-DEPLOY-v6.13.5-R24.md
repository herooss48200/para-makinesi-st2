# AWS DEPLOY — AGROS ST2 v6.13.5-R24

Bu paket mevcut `~/apps/para-makinesi-st2-gercek` klasörünün içine açılır. Yeni çalışma klasörü oluşturmaz.

## Sözleşme
- Giriş otoritesi: R23.2 CONFIRMED first-reversal + fresh-window korunur.
- Gerçek kapasite: 10 eşzamanlı pozisyon.
- İşlem: 10 USDT marjin x 2x = 20 USDT notional.
- Başlangıç SL: -%2.50.
- +%2.50 öncesi erken kâr kilidi / K1 / K2 / canlı Renko / Dynamic Exit yok.
- +%2.50 -> stop +%1.50.
- +%3.00 -> stop +%2.00; +%3.50 -> +%2.50; devamında 0.50 puan adımla yaklaşık %1 geriden takip.
- Binance uzak güvenlik TP: +%50; normal ekonomi kapanışı stop üzerinden.
- Aynı ekonomi gerçek Premier ve sanal/Shadow yaşamda uygulanır.
- 30 sn panel: PREMIER / GERÇEK PREMIER / SHADOW N, W/L/BE, WR, Net, PF + aktif Premier/Shadow listeleri.

## Kurulum
```bash
cd ~/apps/para-makinesi-st2-gercek
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p /tmp/st2-r24-backup-$TS
cp ayarlar.js 4_pozisyon.js 2_rapor.js 69_operation_intelligence_dashboard.js 82_st2_operation_transparency.js versiyon.js package.json test_v6166_r232_confirmed_first_reversal_fresh_window.js /tmp/st2-r24-backup-$TS/ 2>/dev/null || true

unzip -o /tmp/AGROS-ST2-v6.13.5-R24-EXTRACT-DIRECTLY-INTO-ST2.zip -d ~/apps/para-makinesi-st2-gercek

node test_v6167_r24_confirmed_percent_economy.js
node test_v6166_r232_confirmed_first_reversal_fresh_window.js
node test_v610_real_order_execution_safety.js
node test_v694_configurable_live_risk.js
node test_v674_full_source_syntax.js

pm2 restart agros-st2-gercek --update-env
pm2 logs agros-st2-gercek --lines 180 --nostream
```
