# AGROS ST2 v6.13.5-R4 — RESTART PROTECTION REARM

- R3 ekonomi koruması, success-first CONFIRMED ve nearest-step gerçek sizing aynen korunur.
- Restart mutabakatında state içindeki terminal (CANCELED/EXPIRED/FINISHED) Algo client ID artık yeniden kullanılmaz.
- Açık pozisyonda aynı tip/tetikte aktif AGST2 koruma varsa güvenle sahiplenilir.
- Aktif uygun koruma yoksa taze `AGST2X` restart-rearm clientAlgoId ile yeni SL/TP kurulur ve Binance Algo Service üzerinde aktifliği doğrulanır.
- Yeni koruma doğrulanmadan mevcut aktif korumalar iptal edilmez.
- DOGEUSDT örneğindeki `STOP_MARKET_ALGO_DOGRULANAMADI -> RESTART_KORUMA_MUTABAKATI_BASARISIZ` sonsuz restart döngüsü için behavioral regression eklendi.
- Telegram sorununun kökü olan startup döngüsü ortadan kaldırılır; Telegram katmanı ancak başarılı startup sonrası normal şekilde çalışır.
