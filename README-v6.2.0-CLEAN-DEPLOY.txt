AGROS ST2 v6.2.0 CLEAN DEPLOYMENT PACKAGE

This package intentionally excludes:
- .git and .env
- node_modules
- data/state/ledger files
- logs and temporary folders
- historical changelogs/readmes/tests

IMPORTANT:
Preserve the AWS .env and data/ directory. Copy this package's ST2 files into the application folder; do not delete live learning data.
Legacy ST1/LAB Telegram report calls are disabled. Runtime compatibility modules may remain because the protected Trade Engine and close/accounting chain still require them internally; they have no active Telegram report authority in v6.2.0.
