# AGROS ST2 v6.3.5 — Non-Blocking Telegram Startup Reconciliation

- Starts the market/entry loop without awaiting Telegram startup or initial reports.
- Uses one fast 8-second, zero-retry attempt for the startup banner.
- Writes `st2-startup-telegram.json` only after a confirmed successful send.
- Runs periodic live reports in the background with overlap protection so Telegram latency cannot pause price scans.
- Preserves durable retry behavior for critical trade messages.
- Renames the legacy pattern-level candidate heading to `PATTERN GİRİŞ EVRİMİNDE N5'E EN YAKIN`.
- No Trade Engine, Renko pusu, stop, BE, exit, state, ledger, exact DNA, Premier or Shadow authority changes.
