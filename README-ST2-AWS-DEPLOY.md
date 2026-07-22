# AGROS ST2 — AWS Parallel Deployment

ST1 must remain untouched. Use a separate AWS folder and PM2 process.

## Required target

- Repository: `herooss48200/para-makinesi-st2`
- AWS folder: `/home/ubuntu/apps/para-makinesi-st2`
- PM2 process: `agros-st2`
- Logs: `/home/ubuntu/apps/para-makinesi-st2/logs-st2/`
- Data: `/home/ubuntu/apps/para-makinesi-st2/data/`

## First deployment

```bash
cd /home/ubuntu/apps
git clone https://github.com/herooss48200/para-makinesi-st2.git para-makinesi-st2
cd /home/ubuntu/apps/para-makinesi-st2
npm ci
cp .env.example .env
nano .env
npm run verify:st2
pm2 start ecosystem.config.js
pm2 save
```

Set `AGROS_ST2_TELEGRAM_TOKEN` and `AGROS_ST2_TELEGRAM_CHAT_ID` with ST2-specific Telegram credentials. Keep `AGROS_INSTANCE_ID=ST2` and all identity values unchanged.

## Verification

```bash
pm2 status
pm2 describe agros-st2
pm2 logs agros-st2 --lines 100
cat data/.agros-instance
git remote -v
```

Expected identity: `AGROS ST2`, repository `para-makinesi-st2`, PM2 `agros-st2`, data marker `ST2`.

## Updates

```bash
cd /home/ubuntu/apps/para-makinesi-st2
git pull
npm ci
npm run verify:st2
pm2 restart agros-st2 --update-env
pm2 save
```

Never run `pm2 restart para-makinesi-binance` during ST2 deployment.
