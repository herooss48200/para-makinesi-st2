# AGROS ST2 v6.13.5-R25.9 — BOOTSTRAP RECONCILE DECOUPLED

## Root cause proven live
R25.8 reached Binance Time Authority but stopped before GERÇEK RESTART MUTABAKATI / market warmup. Source order proved the synchronous startup blocker was `await piyasa.acikPozisyonlariBorsadanDevral()`, whose first signed exchange read is `futuresPositionRisk()`.

## Changes
- Real restart reconciliation no longer blocks the bootstrap lifecycle.
- Persisted real positions remain in memory and their symbols are kept in the protection universe immediately.
- Real entry remains fail-closed while startup reconciliation is pending/degraded.
- Startup reconciliation runs in background and marks exchange reconciliation READY only on successful completion.
- The first signed `futuresPositionRisk()` read is bounded by the existing real-position reconciliation timeout (default 8000 ms).
- Market warmup, Telegram scheduler and main-loop installation can proceed even when startup reconciliation is slow/unavailable.

## Explicit non-changes
- Premier/N5 selection unchanged.
- Confirmed/Direct entry architecture unchanged.
- Stop economy unchanged: -2.5%, +1.50 -> +1.00, then 0.50% trail / 0.50 point step.
- 20 real slots x 20 USDT unchanged.
- MACD remains shadow-only.
