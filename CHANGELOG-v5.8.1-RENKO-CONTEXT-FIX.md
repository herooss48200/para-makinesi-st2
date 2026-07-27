# AGROS ST2 v5.8.1 — Renko Context Fix

- Historical Winning Intelligence `RENKO6` extraction now reads canonical Renko brick field `color`.
- Fixes false `RENKO6=RRRRRR` classifications caused by reading nonexistent `renk`.
- Preserves v5.7.0-fix.1 CLI flags (`--report`, `--reset`) and all v5.8.0 context intelligence.
- Historical replay must be rerun with `--reset` because stored feature statistics contain the old false RENKO6 values.
