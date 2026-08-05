# AWS dağıtım özeti — AGROS ST2 v6.12.2 FINAL

> Önceki v6.12.2 paketi kullanılmamalıdır. FINAL paket esas alınır.

1. FINAL paket dosyalarını çalışan tam yerel repoya kopyalayın. `.env`, `data/`, `logs-st2/` korunur.
2. Yerelde `npm test` çalıştırın.
3. Commit ve push:
   - `git add <değişen dosyalar>`
   - `git commit -m "fix(st2): v6.12.2 final golden renko and williams shadow"`
   - `git push origin main`
4. AWS:
   - `cd /home/ubuntu/apps/para-makinesi-st2-gercek`
   - `git pull origin main`
   - `npm ci`
   - `npm test`
   - `pm2 restart agros-st2-gercek --update-env`
   - `pm2 save`
5. Doğrulama:
   - sürüm `6.12.2-GOLDEN-RENKO-FINAL-WILLIAMS-SHADOW`
   - startup: `15m Mum + 1m Renko veri` READY
   - giriş: `GOLDEN RENKO TETİK`
   - öğrenilmiş Entry seviyesi: `0.25T–1.50T`
   - Williams: `W%R SHADOW`, emir etkisi YOK
   - ST1: yalnız shadow; hard ret sayısı 0
