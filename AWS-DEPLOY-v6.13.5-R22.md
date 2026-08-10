# AWS Deploy — AGROS ST2 v6.13.5-R22

## 1. Kod dağıtımı
GitHub main R22 commit'ine geldikten sonra AWS'de:

```bash
cd ~/apps/para-makinesi-st2-gercek
git pull origin main
npm test
node test_v6162_r22_15m_confirmed_bootstrap_evidence.js
node -p "require('./versiyon').botSurumu"
```

Beklenen sürüm:
`6.13.5-R22-15M-CONFIRMED-BOOTSTRAP-LIVE-EVIDENCE-FINAL`

## 2. Bootstrap'ı trade process'ten ayrı üret
Önce R22 dosyaları repo üzerinde bulunmalıdır. Bootstrap state üretimi PM2 botuna require edilmez. AWS aynı makinede çalıştığı için düşük OS önceliği kullanılır:

```bash
cd ~/apps/para-makinesi-st2-gercek
nice -n 19 ionice -c3 node scripts_st2_15m_confirmed_bootstrap.js --lookback-days=60
node scripts_st2_15m_confirmed_bootstrap.js --report
```

İlk hızlı başlangıç istenirse `--lookback-days=30` kullanılabilir; daha sonra 60 güne genişletilebilir. Bootstrap yalnız `data/st2-15m-confirmed-evidence.json` yazar.

## 3. Canlı process kalıcı izolasyon
R22'de Global Historical runtime default OFF'tur. Mevcut PM2 env'de `AGROS_ST2_GLOBAL_HISTORICAL_RUNTIME=false` kalabilir; artık zorunlu değildir.

```bash
pm2 env 2 | grep AGROS_ST2_GLOBAL_HISTORICAL_RUNTIME || true
```

## 4. Restart
Mümkünse `Gerçek 0` iken:

```bash
pm2 restart agros-st2-gercek --update-env
```

## 5. Canlı kabul
```bash
timeout 300s pm2 logs agros-st2-gercek --lines 0 --timestamp | \
grep --line-buffered -E "R22|GLOBAL HISTORICAL RUNTIME|BOT AKTİF|STARTUP ENTRY GATE|RENKO AUDIT|GİRİŞ HUNİSİ|15M ENTRY EVIDENCE LIVE|CONFIRMED 15M DÖNÜŞ HAZIR|GOLDEN RENKO TETİK|TELEGRAM|WATCHDOG|EVENT LOOP STARVATION|ERROR"
```

Beklenen:
- `GLOBAL HISTORICAL RUNTIME DISABLED` / `DISABLED` benzeri durum.
- düzenli `BOT AKTİF`.
- `RENKO AUDIT 200/200`.
- Telegram panel teslimi devam eder.
- Yeni pusu mode kararı artık 15m bootstrap+live evidence'ten gelir.
- Legacy 1m shadow yalnız laboratuvar mesajı üretir.

## Corrected package v2 note
Use the corrected v2 package. It includes the R22-compatible regression-test contracts omitted from the first package. Runtime/trading code is unchanged by this packaging correction.
