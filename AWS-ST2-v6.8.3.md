# AWS Dağıtımı — AGROS ST2 v6.8.3

## Ön koşul
Yerel bilgisayarda paket uygulanmış, `npm test` geçmiş ve GitHub `main` dalına push edilmiş olmalıdır.

## AWS adımları
```bash
cd ~/apps/para-makinesi-st2
git status --short
git fetch origin
git pull --ff-only origin main
npm test
pm2 restart agros-st2 --update-env
sleep 20
pm2 describe agros-st2 | grep -E "status|uptime|restarts|unstable restarts|created at|script path"
pm2 save
```

## Doğrulama
```bash
grep -E "BOT AKTİF|ST2 RENKO AUDIT|GİRİŞ HUNİSİ|SAFE STARTUP|MINIMAL TELEGRAM" logs-st2/agros-st2-out.log | tail -40
tail -n 40 logs-st2/agros-st2-error.log
```

Beklenen:
- PM2 `online`
- uptime artıyor
- restart sayısı sabit
- `unstable restarts: 0`
- `Bad Request: message is too long` oluşmuyor
- bilimsel ayrıntılar log/state/ledger içinde devam ediyor
