# AGROS ST2 v6.13.5-R23.1 — AWS deploy notes

This release is a source package. It intentionally excludes `.env`, `node_modules`, runtime `data/` and log directories.

## Safe deployment sequence

1. Back up the currently running ST2 source directory and its runtime data before replacing source files.
2. Preserve the server's existing `.env` and `data/` directory.
3. Copy the R23.1 source files into the existing ST2 application directory; do not create a second runtime application directory.
4. Install dependencies from the lockfile if needed: `npm ci --omit=dev`.
5. Run `npm test` before restart.
6. Restart the existing PM2 ST2 process only after tests pass.
7. Verify the startup header is exactly:
   `6.13.5-R23.1-CONFIRMED-FROZEN-LONG-LIFE-10USDT-POSTCLOSE-24H-FINAL`
8. Verify the first new eligible entry reports `Giriş modu: CONFIRMED` and a non-zero CONFIRMED offset.

## Do not overwrite

- `.env`
- live `data/` ledgers/state
- PM2 ecosystem/runtime secrets
- exchange API credentials

## Expected live contract

- Real entry: forced CONFIRMED, frozen per pusu.
- CONFIRMED timing: closed 15m Renko reversal + selected offset.
- Final sniper: 1m Renko SuperTrend same direction.
- Risk: 5 USDT margin, 2x leverage, 10 USDT notional, max 5 real slots.
- CONFIRMED early +0.25% floor: bypassed.
- K1: +0.50% arm, approximately +0.40% gross floor.
- K2: +0.60% Renko management activation.
- Target-1: +1.50% observation milestone only, not a fixed TP.
- 24h post-close tracker: scientific/no order authority.
