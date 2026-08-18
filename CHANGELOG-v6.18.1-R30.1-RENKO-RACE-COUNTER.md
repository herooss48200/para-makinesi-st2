# AGROS ST2 v6.18.1-R30.1 — RENKO RACE COUNTER

- Reporting-only patch; trading, Premier/N5, entry, exit, stop, order execution and slot logic are unchanged.
- Main Telegram RENKO counter now continues from the authoritative R29.2 race snapshot observed at 18.08.2026 10:38:34 Europe/Istanbul:
  - Aç 12 | Kap 9 | W/L/BE 8/1/0 | WR %88.9 | Net +1.3272 | Kom 0.0890
- After the snapshot, only verified RENKO records are added.
- Open count requires an actual openedAt; failed reservations are not counted as opens.
- Close count uses closedAt, so positions already open at the snapshot (for example HYPE) correctly add their later close result without being counted as a second open.
- Historical execution state is not deleted or rewritten.
