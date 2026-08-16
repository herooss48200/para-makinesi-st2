# AGROS ST2 v6.13.5-R25.3 — PREMIER SELECTION RECOVERY

- R25.2 incremental 1m liveness, R24.2 unified execution stop authority, CONFIRMED and MACD shadow logic are preserved.
- Real capacity increased from 10 to 20 concurrent real positions; margin remains 4 USDT x exact 5x = 20 USDT notional per position.
- N5 LAB live lifecycle remains 5 closes.
- OOS audit cohort filter: COIN=1000/1001 cannot enter via ordinary PREMIER_SCORE_RANKED selection alone.
- Exact LAB context can recover from Shadow when N5 live economy is positive (Net>0, PF>1, Expectancy>0).
- N5 negative live economy vetoes a high Score for subsequent entries.
- RENKO_PATTERN_PREMIER is preserved before N5 evidence instead of being overwritten by a weak Score.
- Structural exact-context/canonical-pool failures remain fail-closed.
- Final league identity is frozen at opening; later lifecycle changes affect new entries, not the classification of an already-open position.
