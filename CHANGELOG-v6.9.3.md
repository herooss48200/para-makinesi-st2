# AGROS ST2 v6.9.3 — LIVE 5X / 25 USDT + PREMIER LEDGER FINAL

- `PREMIER_SCORE_RANKED` ana Premier kasa track listesine eklendi; yeni kalibre Premier kapanışları N/Net/PF hesabına yazılır.
- Gerçek emir yalnız `CALIBRATED + PREMIER_SCORE_SELECTED` adayında açılır.
- Gerçek emir boyutu 25 USDT notional, kaldıraç 5x, marjin tipi ISOLATED olarak sabitlendi.
- Aynı anda en fazla 1 gerçek pozisyon açılır.
- AWS ortamında `AGROS_REAL_ORDER_ARM=LIVE_5X_25USDT`, `AGROS_REAL_ORDER_ENV=MAINNET` ve production Binance Futures base URL zorunludur.
- Market dolum fiyatı, gerçekleşen miktar, notional sapması ve slippage kaydedilir.
- SL veya TP koruma emrinden biri kurulamazsa açık emirler iptal edilir ve pozisyon reduce-only MARKET ile fail-closed kapatılır.
- Trade Engine giriş, stop, BE, Entry/Exit/Takeover öğrenme matematiği değiştirilmedi.
