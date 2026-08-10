# AGROS ST2 v6.13.5-R18 — NONBLOCKING CONTROL PLANE — CORRECTED FINAL

Base: v6.13.5-R17 commit `a5e2cc3`.

## Runtime purpose
- Exchange reconciliation is removed from the blocking main-loop stage.
- Renko/pusu scan continues while signed exchange reconciliation is slow or hung.
- Real entry remains fail-closed unless reconciliation is fresh and network price is verified.
- Real stop/trail advancement remains fail-closed when reconciliation or network price is not trustworthy.
- Telegram Native transport has a wall-clock hard deadline so a panel request cannot wait indefinitely on socket/DNS/connect behavior.
- Live panel exposes control-plane reconciliation and real-entry safety state.

## Correction in this package
The first R18 archive changed the runtime version to R18 but left several R17 regression tests with exact R17 version assertions. That caused `npm test` to fail before reaching the R18 liveness test even though the runtime files were R18.

This corrected archive updates those regression expectations and updates the R17 unified-recovery compatibility assertion to the R18 nonblocking architecture.

## Verification
`npm test` PASS on the reconstructed R17 base with this corrected R18 package applied.
Final tests include:
- Telegram startup/panel delivery and 30s scheduler contracts
- real-order safety
- active-exit reconciliation
- final entry/exit chain
- Golden Renko / Williams shadow / confirmation lifecycle
- market-data contract
- main-loop lifecycle
- live liveness recovery
- Renko scan CPU liveness
- 1m ST fail-closed scan
- market price fallback
- DIRECT + CONFIRMED shared entry authority
- ghost position recovery
- R18 hung-reconciliation nonblocking control-plane liveness
