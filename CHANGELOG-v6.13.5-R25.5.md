# CHANGELOG v6.13.5-R25.5 — STARTUP FAST-FAIL REPAIR

- R25.4 200-core startup authority korunur.
- Startup worker 16 -> 8; shared Binance network concurrency 4 korunur.
- İlk 15m/1m istekleri 7 sn, 0 retry ile hızlı fail-forward çalışır.
- Sembol deadline 180 sn -> 35 sn; repair deadline 45 sn.
- İlk turda alınamayan 15m mumlar ayrı bounded repair turunda geri kazanılır.
- 1m Renko ST mevcut 240 -> 480 derin repair zinciriyle tamamlanır.
- Koruma-extra semboller işlenir ama 200-core readiness denominatorunu büyütmez.
- R25.3 Premier N5/20-slot ve R24.2 yüzde-ekonomi stop otoritesi değiştirilmedi.
- MACD R25.1 SHADOW-only kalır; canlı giriş/stop yetkisi YOK.
