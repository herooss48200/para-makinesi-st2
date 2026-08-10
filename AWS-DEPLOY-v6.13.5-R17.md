# AWS Deploy — AGROS ST2 v6.13.5-R17

Current working directory must remain the existing ST2 directory. Do not create a second bot directory.

```bash
cd ~/apps/para-makinesi-st2-gercek

# Optional safety snapshot of code only; do not overwrite data/state/ledger.
tar -czf /tmp/st2-before-r17-code-$(date +%Y%m%d-%H%M%S).tar.gz \
  1_hafiza.js 2_rapor.js 4_pozisyon.js ayarlar.js bot.js revizyon.js versiyon.js package.json package-lock.json 93_st2_market_price_runtime.js

# Copy the R17 ZIP to this directory, then:
unzip -o AGROS-ST2-v6.13.5-R17-UNIFIED-LIVE-RECOVERY-FINAL.zip -d .

npm test
pm2 restart agros-st2-gercek
pm2 logs agros-st2-gercek --lines 180 --timestamp
```

Expected startup/runtime evidence:

- version: `6.13.5-R17-UNIFIED-LIVE-RECOVERY-FINAL`
- `[STARTUP ENTRY GATE]` progresses to READY
- `[ST2 İLK TARAMA TAMAMLANDI]`
- `[GERÇEK KAPANIŞ MUTABAKATI]` if Binance already closed a locally active position
- panel line includes `Fiyat FIRST_AUDIT_CLOSED_1M`, `FUTURES_TICKER_ALL`, or controlled fallback source
- `Gerçek` count matches Binance after reconciliation
- Telegram Native/Curl health remains visible; panel recovery probe can restore delivery after transport outage

Do not copy or replace `data/`, ledger/state files, logs, `.env`, `.git`, or `node_modules` from this package; they are not included.
