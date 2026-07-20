# AGROS v5.0.8 — Active Evidence Reconciliation

- LAB Premier active count now uses the same clean active-position classification as the live portfolio.
- Persisted Premier observations placed into Restart GAP are excluded from active Premier evidence.
- Learning telemetry now shows scientific closes, GAP closes, active GAP quarantine and active learning separately.
- Added an explicit learning reconciliation equation; a zero difference is required.
- Added a regression test covering active and closed Restart GAP transitions.
- `npm run check` now includes both v5.0.7 and v5.0.8 regressions.
