# AGROS ST2 R25 — Uygulama / Deploy

Bu paket yalnız mevcut `eb0a6fa` ST2 köküne doğrudan açılmak üzere hazırlanmıştır. Yeni ST2 klasörü oluşturmaz. `.env`, `data`, `logs-st2`, `node_modules` içermez.

## Windows doğrulama
```powershell
cd "C:\Users\ASUS\OneDrive\Desktop\ArgosPlatform\Repositories\ParaMakinesiBinance\ST2"
git status --short
npm test
npm run check
node -p "require('./versiyon').botSurumu"
```

Beklenen sürüm:
`6.13.5-R25-EARLY-PROFIT-LOCK-MACD-SHADOW-EXACT-LEVERAGE-10SLOT-20USDT-POSTCLOSE-24H`

## Commit / push
```powershell
git add -A
git commit -m "feat(st2): v6.13.5-R25 early profit lock macd shadow exact leverage"
git push origin main
```

## AWS
```bash
cd ~/apps/para-makinesi-st2-gercek
git pull --ff-only
npm test
npm run check
node -p "require('./versiyon').botSurumu"
pm2 restart agros-st2-gercek
pm2 logs agros-st2-gercek --lines 180 --nostream
```

## Canlı ilk kanıtlar
- Yeni gerçek girişte Binance logu 10 USDT marjin x 2x = 20 USDT notional göstermeli.
- +%1.50 eşiği görülürse stop +%1.00 civarına atomik güncellenmeli.
- MACD logları `🟣 [MACD SHADOW]` olarak görünmeli ve `Emir/stop etkisi YOK` demeli.
- MACD ledger: `data/st2-macd-shadow-ledger.jsonl`.
