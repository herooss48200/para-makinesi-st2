# AGROS ST2 v6.13.5-R25.2 — LIVENESS + INCREMENTAL 1M

- R25.1 CONFIRMED gerçek giriş, 5x/20USDT, erken yüzde-ekonomi stopu ve MACD SHADOW aynen korunur.
- 1m Renko-ST startup 80→240→480 readiness matematiği korunur.
- Periyodik 1m refresh artık 240/480 geçmişi her dakika tekrar çekmez; yalnız küçük kapanmış pencereyi mevcut geçmişe birleştirir.
- Runtime 1m refresh LOW priority, 6s timeout, 0 retry; başarısız refresh mevcut known-good cache'i silmez.
- Startup worker havuzu ile shared Binance socket concurrency ayrıldı; startup network concurrency 4 ile sınırlandı, runtime 3 kalır.
- ST2 Telegram paneli Entry Gate READY beklemeden startup/degraded durumunu da 30sn cadence ile gösterebilir; bu yalnız görünürlük katmanıdır, trade gate değişmez.
- Exchange reconciliation 5s / 15s fail-closed sözleşmesi değiştirilmedi.
