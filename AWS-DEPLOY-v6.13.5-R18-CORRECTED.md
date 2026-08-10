# AWS Deploy — v6.13.5-R18 Corrected Final

Deploy only after local `npm test` passes.

```bash
cd ~/apps/para-makinesi-st2-gercek
git status
npm test
pm2 restart agros-st2-gercek
```

Live acceptance is not based only on PM2 online status. Verify fresh logs show:
- `ST2 İLK TARAMA TAMAMLANDI`
- Renko scan progresses above `0/200`
- pusu / giriş hunisi updates
- no blocking `Aşama EXCHANGE_RECONCILIATION` watchdog
- Telegram panel cadence continues without multi-minute silence
- real entry shows READY only when control-plane reconciliation is fresh
