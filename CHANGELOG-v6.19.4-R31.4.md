# AGROS ST2 v6.19.4-R31.4 — RECONCILE SNAPSHOT LIVENESS

- positionRisk snapshot liveness is separated from close accounting/finalize.
- REAL entry freshness is refreshed immediately after a safe exchange position snapshot.
- Unknown exchange positions or side mismatches remain fail-closed.
- Closed-position accounting/fill/algo cleanup runs in a separate single finalize task and no longer holds the whole REAL-entry reconciliation state in RUNNING.
- positionRisk single-flight now rotates after 60s hard-stale age instead of reusing one hung request forever.
- Close-finalize signed API calls use a bounded 6s reconcile client and a shorter fast-reconcile retry profile.
- Panel exposes Snapshot and Finalize states separately.
- Existing 15m live / 1m confirmation, symmetric Onur hard-veto, 20 slots x 20USDT and stop economy are preserved.
