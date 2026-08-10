# R18 Deployment — base must be a5e2cc3 (R17)

## Work PC
```powershell
cd "C:\Users\win11\Desktop\ArgosPlatform\Repositories\ParaMakinesiBinance\ST2"
git status
# Working tree must be clean and HEAD must be a5e2cc3 before overlay.
Expand-Archive -Path ".\AGROS-ST2-v6.13.5-R18-NONBLOCKING-CONTROL-PLANE-FINAL.zip" -DestinationPath . -Force
npm test
git diff --check
git status --short
git add 1_hafiza.js 2_rapor.js ayarlar.js bot.js motor.js package.json package-lock.json versiyon.js test_v6158_nonblocking_control_plane_liveness.js AWS-DEPLOY-v6.13.5-R18.md CHANGELOG-v6.13.5-R18.md PACKAGE-FILE-LIST-v6.13.5-R18.txt TEST-RESULT-v6.13.5-R18.txt
git commit -m "fix(st2): v6.13.5-R18 nonblocking control plane"
git push origin main
```

## AWS
```bash
cd ~/apps/para-makinesi-st2-gercek
git status
git fetch origin
pm2 stop agros-st2-gercek
git pull --ff-only origin main
npm test
pm2 restart agros-st2-gercek
```

## Fresh live proof (old logs excluded)
```bash
timeout 180s pm2 logs agros-st2-gercek --lines 0 --timestamp | \
grep --line-buffered -E "BOT AKTİF|ST2 İLK TARAMA TAMAMLANDI|RENKO|PUSU|Giriş hunisi|Control Plane|GERÇEK ENTRY FAIL-CLOSED|EXCHANGE RECONCILE|TELEGRAM|HARD_TIMEOUT|WATCHDOG|Döngü çalışma hatası|HATA|ERROR"
```

Expected: exchange reconciliation may be RUNNING/DEGRADED, but `RENKO_SCAN`/pusu must continue. A stale control plane blocks REAL ENTRY and stop/trail advancement, not scientific scanning.
