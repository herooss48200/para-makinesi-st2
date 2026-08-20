# AGROS ST2 v6.19.1-R31.1 deploy

## Sabit yerel repo
`C:\Users\ASUS\OneDrive\Desktop\ArgosPlatform\Repositories\ParaMakinesiBinance\ST2`

## 1. Yerelde paketi uygula
Paket içindeki kod dosyalarını mevcut ST2 klasörüne overwrite et. `.git`, `.env`, `data`, `logs-st2`, `node_modules` korunmalıdır.

## 2. Yerel test
```powershell
cd "C:\Users\ASUS\OneDrive\Desktop\ArgosPlatform\Repositories\ParaMakinesiBinance\ST2"
npm test
git diff --check
git status --short
```

## 3. GitHub
```powershell
git add -A
git commit -m "fix(st2): v6.19.1 R31.1 15m stable Onur guard Telegram"
git push origin main
```

## 4. AWS
```bash
cd ~/apps/para-makinesi-st2-gercek && git pull --ff-only origin main && npm test && pm2 restart agros-st2-gercek
```

## 5. Canlı kanıt
```bash
cd ~/apps/para-makinesi-st2-gercek && pm2 logs agros-st2-gercek --lines 300 --nostream | grep -E "6.19.1-R31.1|MARKET READY|FULL MUTABAKAT|Entry Gate: READY|ONUR SHORT|GERÇEK AÇILIŞ TELEGRAM|GERÇEK KAPANIŞ TELEGRAM|ERROR|HATA" | tail -80
```

Beklenen panel zinciri:
`15m ATR-Renko/BB -> CONFIRMED -> 1m Renko ST -> Premier/N5 -> Onur Guard -> REAL`
