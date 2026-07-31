# AWS Dağıtımı — AGROS ST2 v6.10.1

## 1. Gerçek botu durdur

```bash
pm2 stop agros-st2-gercek
```

## 2. Kodu güncelle ve test et

```bash
cd ~/apps/para-makinesi-st2-gercek
git pull --ff-only origin live-v6.9.3
npm ci
npm test
```

Beklenen son test:

```text
✅ v6.10.1 Binance Futures endpoint authority tests passed
```

## 3. Endpointi ARM kapalıyken açıkça tanımla

```dotenv
AGROS_REAL_ORDER_ENV=MAINNET
BINANCE_FUTURES_HTTP_BASE=https://fapi.binance.com
AGROS_REAL_ORDER_ARM=DISABLED
AGROS_REAL_ORDER_EXECUTION_ACK=DISABLED
```

Eski `BINANCE_BASE_URL` geriye uyum için okunur; yeni kurulumda `BINANCE_FUTURES_HTTP_BASE` tercih edilir.

## 4. ARM kapalı başlangıç

```bash
pm2 start ecosystem.real.config.js --only agros-st2-gercek --update-env
pm2 logs agros-st2-gercek --lines 120 --nostream
```

Beklenen endpoint kanıtı:

```text
Binance Futures MAINNET ... | https://fapi.binance.com
```

Beklenen restart kanıtı:

```text
[GERÇEK RESTART MUTABAKATI] ... Koruma hatası 0
```

Bu aşamada yeni gerçek emir açılamaz.
