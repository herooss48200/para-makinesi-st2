# AWS deployment — AGROS ST2 v6.12.1

## Safety
- Deploy only after `npm test` passes on AWS development or live source directory.
- Real open position count must be checked before restart.
- `.env`, `data/`, state, ledger and logs are not part of this update.

## Expected startup proof
After restart, logs must progress through lines similar to:

```text
[AŞAMALI BAŞLANGIÇ] Çekirdek piyasa verisi hazırlanıyor | 15m Renko + 3m ST1
[AŞAMALI BAŞLANGIÇ İLERLEME] İşlenen 25/...
[STARTUP ENTRY GATE] AÇILDI | Mum ... | ST ... | Eşik %95
[AŞAMALI BAŞLANGIÇ] ÇEKİRDEK TAMAM
[SNIPER GÖLGE ISINMA] ... | Giriş yetkisine etkisi YOK
[ST2 İLK TARAMA TAMAMLANDI]
```

## Acceptance
- PM2 online and not in restart loop.
- `Mum` and `ST` counters increase instead of remaining 0.
- Entry Gate becomes READY.
- First ST2 Renko audit completes.
- No new critical startup error appears after the v6.12.1 version line.
