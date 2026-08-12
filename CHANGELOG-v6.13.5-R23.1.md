# AGROS ST2 v6.13.5-R23.1

Release: `6.13.5-R23.1-CONFIRMED-FROZEN-LONG-LIFE-10USDT-POSTCLOSE-24H-FINAL`
Date: 12.08.2026

## Fixed

- Forced-CONFIRMED entry decisions are now frozen per pusu. A pusu can no longer change CONFIRMED offset on every scan as live evidence changes.
- Pre-R23 DIRECT pusus are migrated once to CONFIRMED when force-confirmed is active; subsequent scans preserve the migrated decision.
- Entry mode, timing authority and selected brick distance are synchronized after migration so the real-order chain and reporting use the same authority.
- CONFIRMED opening reports show the actual CONFIRMED offset rather than the Premier/Entry-Evolution qualification brick.
- CONFIRMED long-life reporting no longer claims the early `+0.25% -> +0.20%` economy floor is active when it is intentionally bypassed.
- CONFIRMED Target-1 `+1.50%` is explicitly recorded as an observation milestone, not a fixed take-profit order.
- Exit module keeps the legacy public `VERSION` contract for compatibility and exposes `RUNTIME_VERSION` for the R23.1 policy.
- Current risk/test contracts are aligned to 5 USDT margin x 2 leverage = 10 USDT notional and 5 real slots.
- Legacy 1m confirmation shadow remains diagnostics/learning only; it cannot regain real Entry Mode authority.
- Package/version/test contracts are aligned to R23.1.

## Preserved

- 15m closed Renko reversal + selected offset is the CONFIRMED timing authority.
- 1m Renko SuperTrend remains the final sniper direction confirmation.
- Existing open positions keep their already-frozen exit assignment after restart; R23.1 does not retroactively rewrite an active trade's exit contract.
- K1 commission-safe floor and K2 Renko trailing remain active for new CONFIRMED long-life positions.
- Market-data fail-closed, Telegram non-blocking delivery, restart recovery and 24h post-close scientific tracking remain intact.
