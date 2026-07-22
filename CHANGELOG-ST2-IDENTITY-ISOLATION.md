# AGROS ST2 — Identity Isolation Baseline

Date: 22.07.2026
Version: 5.3.0-ST2.1

## Scope

This release separates the experimental AGROS ST2 runtime identity from ST1 without changing the Trade Engine or strategy decisions.

## Isolation controls

- Package: `para-makinesi-st2`
- GitHub repository: `para-makinesi-st2`
- PM2 process: `agros-st2`
- Telegram prefix: `AGROS ST2` on every message and live panel
- Runtime data: repository-local `data/`, bound by `data/.agros-instance = ST2`
- PM2 logs: repository-local `logs-st2/`
- Root identity marker: `.agros-st2.json`
- Fail-closed startup when instance, package, repository, data, or log identity is inconsistent
- Symlinked/shared data and log directories are rejected

## Data adoption rule

ST2 refuses a non-empty unmarked data directory. This prevents accidental use of ST1 learning state. Intentional data adoption requires a controlled migration and the explicit one-time environment value `AGROS_ST2_ALLOW_DATA_ADOPTION=YES`. It must not be left enabled after migration.

## Trade Engine

No entry, stop, BE, exit, sizing, Premier, or order decision logic was changed.
