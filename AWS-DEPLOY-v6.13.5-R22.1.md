# AWS Deploy — AGROS ST2 v6.13.5-R22.1

## Güvenli sıra
1. `cd ~/apps/para-makinesi-st2-gercek`
2. `git pull origin main`
3. `node -p "require('./versiyon').botSurumu"`
4. `npm test`
5. `node test_v6163_r221_confirmed_shadow_live_learning.js`
6. Gerçek execution state'te açık Binance kaydı olmadığını doğrula.
7. Tek restart: `pm2 restart agros-st2-gercek --update-env`
8. 10 dakika canlı kabul gözlemi.

## Beklenen sürüm
`6.13.5-R22.1-15M-CONFIRMED-SHADOW-LIVE-LEARNING-OBSERVABILITY-FINAL`

## Kabul kanıtları
- `Entry Gate READY`
- `Gerçek Entry READY`
- Renko audit 200/200 ve düzenli heartbeat
- Telegram `Son teslim` yaklaşık 30 sn edit ritminde
- Panel funnel artık logla uyumlu `Değerlendirilen` ve `Mode D/C` gösterir
- DIRECT pusu döneminde `15m CONFIRMED canlı gölge Aktif ...` sayacı oluşur
- Uygun durumda console'da `15M CONFIRMED SHADOW OPEN/CLOSE` görülür; satır açıkça `GERÇEK EMİR YOK` der
- Legacy 1m laboratuvar mesajı `gerçek Entry Mode seçim yetkisi YOK` der
- `GLOBAL HISTORICAL TRAIN START` canlı trade process içinde görünmemelidir
- WATCHDOG/event-loop starvation tekrar etmemelidir

## Veri sürekliliği
Mevcut `data/st2-15m-confirmed-evidence.json` korunur. R22.1 schema=2 hydrate eski R22 schema=1 bootstrap/live içeriğini kaybetmeden `liveShadow` alanını ekler. Data/state dosyaları paketle taşınmaz veya silinmez.
