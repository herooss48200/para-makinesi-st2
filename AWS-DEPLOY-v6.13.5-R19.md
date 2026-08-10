# AWS Deploy — R19

Taban: R18 commit 180b80a642215adc066e56e0ef12c1de583371ef

Kabul koşulları:
- npm test PASS
- mümkünse npm run test:full PASS (AWS node_modules mevcut)
- startup 200/200 mum + 200/200 1m Renko ST
- ilk Renko taraması ilerleme 25/50/.../200 ve tamamlanma
- CPU sürekli %100'e yapışmamalı
- panelde `Panel CPU=RAM-ONLY`
- Telegram cadence dakikalarca susmamalı
- pusu/huni taraması ilerlemeli
- gerçek entry control-plane doğrulanmadığında fail-closed kalmalı

Canlı log filtresi:
pm2 logs agros-st2-gercek --lines 0 --timestamp | grep --line-buffered -E "R19|BOT AKTİF|RENKO SCAN İLERLEME|ST2 RENKO AUDIT|ST2 GİRİŞ HUNİSİ|ST2 RENKO YENİ PUSU|EVENT LOOP STARVATION|RENKO SLOW SYMBOL|TELEGRAM|HARD_TIMEOUT|WATCHDOG|Döngü çalışma hatası|ERROR"
