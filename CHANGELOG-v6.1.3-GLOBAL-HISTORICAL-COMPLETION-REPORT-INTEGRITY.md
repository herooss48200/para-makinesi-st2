# AGROS ST2 v6.1.3 — Global Historical Completion & Report Integrity

- 30 coin historical worker uses the canonical reconciliation pool.
- Per-coin START/OK/FAIL and final completion telemetry added.
- One failed coin no longer stops the remaining training pool.
- Runtime state is atomically updated after every coin.
- Global status is EMPTY / PARTIAL_READY / READY; 3/30 is never called READY.
- Remaining ST1 Final Certification runtime labels renamed to ST2.
- Existing canonical GAP reconciliation and Telegram timeout de-duplication retained.
- Trade Engine, Renko pusu, stop, BE, exit and real-order authority unchanged.
