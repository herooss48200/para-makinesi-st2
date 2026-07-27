# AGROS ST2 v5.7.0 — Historical Renko Replay & Offline Training

## Eklenenler
- Binance Futures public `/fapi/v1/klines` üzerinden sayfalı 15m geçmiş veri indirme.
- Canlı ST2 ile aynı `72_st2_renko_core.js` ATR, Renko, pattern ve Bollinger temas çekirdeği.
- Her tarihsel sinyal için 0.25 / 0.50 / 0.75 / 1.00 / 1.25 / 1.50 giriş replay'i.
- Komisyon sonrası TP, SL, BE, Net, PF, WR ve Expectancy ölçümü.
- Pattern bazında minimum N ve pozitif performans şartlarıyla en iyi tarihsel giriş seçimi.
- Atomik state, `.bak`, append-only ledger ve indirme checkpoint dosyaları.
- `--report` ile SHADOW eğitim özeti.

## Güvenlik
- Canlı Trade Engine değiştirilmez.
- `st2-renko-entry-evolution.json` dosyasına yazılmaz.
- Tarihsel sonuç Premier kararına otomatik bağlanmaz.
- İlk aşama yalnız SHADOW gözlem ve doğrulamadır.

## Kullanım
```bash
node 75_st2_historical_renko_training.js \
  --symbols=BTCUSDT,ETHUSDT \
  --start=2025-01-01 \
  --end=2026-07-01 \
  --minN=30 \
  --maxHoldBars=32 \
  --reset

node 75_st2_historical_renko_training.js --report
```

İlk AWS testi küçük sembol ve tarih aralığıyla yapılmalıdır. Büyük evren eğitiminden önce canlı–replay Renko eşitlik kanıtı incelenmelidir.
