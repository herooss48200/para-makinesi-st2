# AGROS ST2 v6.13.5-R24 — CONFIRMED PERCENT ECONOMY

- R23.2 CONFIRMED entry/fresh-window authority preserved.
- Real capacity: 10 concurrent positions.
- Position size: 10 USDT margin × 2x = 20 USDT notional.
- Initial stop: -2.50%.
- No early K1/K2/Renko/Dynamic Exit while percent economy is enabled.
- At +2.50% gross profit, stop locks +1.50%.
- Each additional +0.50 percentage point advances the protected profit by +0.50 point, maintaining about a 1.00-point gap.
- Binance safety TP moved to +50% so normal exits are controlled by the percentage stop rather than an early fixed TP.
- Same economy method is applied to real Premier and virtual/shadow positions.
- 30s live panel shows separate Premier / Real Premier / Shadow N, W/L/BE, WR, Net and PF using a 30s cached scientific-ledger partition.
- 24h post-close learning preserved.

## Corrected package
- Legacy R23.2 version/risk tests aligned with R24.
- 30s live panel remains RAM-only: heavy scientific ledger partition scan removed from panel.
- Added persistent live cohort economy cache (`96_st2_live_cohort_economy.js`), rebuilt once at startup and incremented on scientific closes.
- Panel exposes PREMIER / GERÇEK PREMIER / SHADOW N, WR, Net, PF plus active Shadow positions.
