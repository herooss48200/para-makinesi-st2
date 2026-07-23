# AGROS ST2 v5.5.0 — Identity & PM2 Finalization

- PM2 process name fixed to `agros-st2`.
- PM2 working directory fixed to repository root via `cwd: __dirname`.
- Dedicated ST2 output/error logs configured under `logs-st2/`.
- PM2 runtime environment now explicitly pins ST2 identity variables.
- Telegram runtime now reads only `AGROS_ST2_TELEGRAM_TOKEN` and `AGROS_ST2_TELEGRAM_CHAT_ID`.
- Added `test:st2-identity` and included it in `verify:st2`.
- ST2 identity isolation and Renko entry contract tests pass.
