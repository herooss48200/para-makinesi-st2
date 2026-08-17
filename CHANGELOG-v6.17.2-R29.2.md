# AGROS ST2 v6.17.2-R29.2 — HA FORMATION OBSERVABILITY

- R29.1 trading decision/order is unchanged.
- Adds explicit Cup/Handle proof: scale, phase, score, left rim, cup pivot, right rim, depth ATR, handle extreme/depth/recovery.
- Adds explicit Butterfly proof: X/A/B/C/D prices, B/XA, C/AB, D/XA, BC projection, AB=CD, D age and PRZ distance in ATR.
- Emits one detailed `HA FORMASYON KANITI` message when strict body break reaches structure authority, for ALLOW or VETO.
- Telegram proof is configurable with `heikinAshiFormasyonKanitiTelegram`; default true.
- SuperTrend remains the final gate and is not confused with the closed HA confirmation candle.
