# AGROS ST1 v5.4.0 — Scientific Audit

## Scope

This release keeps real-order authority fail-closed and preserves the Trade Engine while auditing and strengthening the virtual scientific layers.

## Delivered

- Live report now prioritizes active Historical Premier positions and the Premier cash/performance ledger.
- Most-profitable and most-risky lists use live PnL, include only active Historical Premier positions, exclude Shadow/Bottom/Reverse/GAP, and show up to 10 or the active count.
- Bottom Premier LONG and Bottom Premier SHORT are independent top-10 experiment leagues with separate Net, PF, Expectancy and ledgers.
- Reverse execution remains a single reversed virtual position and has an independent audit pipeline and ledger.
- Legacy Reverse records are prevented from leaking into the main Premier aggregate.
- Bottom and Reverse positions use their own eligible LAB Exit or safe current-ladder fallback; open-position Exit assignment remains immutable.
- LAB lifecycle Stop and BE/BE+ learning starts at N=5, recalculates every 5 closes, marks deep evaluation every 10 closes, preserves history and weights recent N=20 at 60%.
- Stop candidates: 0.90%, 1.10%, 1.35%, 1.50%, 1.70%.
- BE trigger and buffer combinations are evaluated separately per Premier/Bottom/Reverse/LAB scope.
- Exit Victory Audit now reports model fingerprint/mtime, deterministic self-test explanation, active assignment IDs, frozen-vs-shadow consistency and fallback reasons.
- Live report moves accounting/GAP reconciliation below the performance and experiment ledgers.

## Safety

- `sanalEmirModu: true` remains unchanged.
- Real-order authorization remains false.
- Restart-GAP remains outside scientific learning.
- Bottom and Reverse results do not affect the main Premier cash ledger.
- Existing open positions keep frozen Exit/Stop/BE assignments; learned profiles affect only new positions.

## Verification

Run:

```bash
npm ci
npm run verify:st1
```

The release includes `test_v540_st1_scientific_audit.js`, which verifies active-Premier visibility, independent Bottom/Reverse ledgers, adaptive Stop/BE scope isolation, Exit binding, reconciliation and fail-closed virtual mode.
