AGROS ST2 v6.18.1-R30.1 — RENKO RACE COUNTER

BASE COMMIT: a25154653d6cc185bd916038ee603add6cc1e112
PURPOSE: Telegram reporting counter only.

Authoritative continuation checkpoint:
18.08.2026 10:38:34 Europe/Istanbul = 2026-08-18T07:38:34.000Z
Aç 12 | Kap 9 | W/L/BE 8/1/0 | WR %88.9 | Net +1.3272 | Kom 0.0890

The execution ledger/state is NOT reset, rewritten, or deleted.
After the checkpoint:
- actual RENKO opens are added only when openedAt exists;
- verified CLOSED RENKO records are added by closedAt, including positions opened before the checkpoint and closed after it;
- HA/legacy explicit non-Renko records are excluded;
- failed reservations without openedAt are not counted as opens.

No entry, Premier/N5, exit, stop, execution, reconciliation, risk, slot, or Binance order logic is changed.
