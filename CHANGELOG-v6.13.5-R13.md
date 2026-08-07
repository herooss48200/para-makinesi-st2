# AGROS ST2 v6.13.5-R13 — CORE LOOP LIVENESS & ST1 SHADOW ISOLATION

## Canlı kök neden
R12 canlıda gerçek 1m ATR-Renko SuperTrend readiness'i 40 sembolde 240 mum ve kalan 2 sembolde 480 mum onarımıyla 200/200'e çıkardı.
Ancak READY sonrasında ilk yeni `ST2 RENKO AUDIT` oluşmadı. Loglarda bağımsız Telegram paneli çalışırken sürekli
`Önceki SuperTrend tazelemesi sürüyor` görülüyordu.

Kaynak auditinde startup tamamlanır tamamlanmaz 200 sembollük ST1 3m shadow warmup'ın aynı Binance ağ motoru ve
aynı SuperTrend refresh mutex'i üzerinde başlatıldığı görüldü. ST1 shadow giriş yetkisine sahip olmadığı halde
Golden Renko çekirdeğinin ilk canlı taramasından önce ağır ağ yükü oluşturuyordu.

## R13 düzeltmesi
- İlk Golden Renko auditinden ÖNCE ST1 3m shadow ağ taraması artık başlamaz.
- Periyodik çekirdek refresh yalnız 1m ATR-Renko ST için `skipTrend:true, priority:HIGH` çalışır.
- ST1 shadow ilk gerçek Renko auditinden sonra ayrıca planlanır.
- ST1 shadow ilk çalışma gecikmesi 60 sn, periyodu 180 sn, timeout 6 sn, retry 0.
- ST1 shadow hâlâ yalnız shadow; giriş/emir yetkisi YOK.
- Ana loop watchdog eklendi: FUTURES_PRICES / POSITION_PROTECTION / RENKO_SCAN / POST_RENKO aşamaları.
- Watchdog yalnız telemetri sağlar; işlem matematiğini değiştirmez.

## Korunan R12 davranışları
- 1m ATR-Renko ST 80 -> 240 -> 480 derin readiness onarımı.
- Entry Gate gerçek Renko-ST readiness'e göre açılır.
- Entry Funnel görünürlüğü.
- R11 bağımsız 30 sn Telegram live-panel scheduler.
- Entry Evolution, DIRECT/CONFIRMED Mode Policy, Williams shadow.
- Gerçek emir, stop, profit-floor ve exit matematiği değişmedi.
