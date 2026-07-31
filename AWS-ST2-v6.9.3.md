# AWS — AGROS ST2 v6.9.3 LIVE FINAL

## Zorunlu `.env` değerleri

```env
BINANCE_BASE_URL=https://fapi.binance.com
AGROS_REAL_ORDER_ARM=LIVE_5X_25USDT
AGROS_REAL_ORDER_ENV=MAINNET
```

Binance API anahtarında yalnız gerekli Futures işlem yetkisi açık olmalı; para çekme yetkisi kapalı ve mümkünse AWS IP kısıtlı olmalıdır.

## Canlı sözleşme

- Yalnız kalibre edilmiş Premier Score seçimi
- 25 USDT notional
- 5x isolated
- En fazla 1 aktif gerçek pozisyon
- SL + TP kurulmadan pozisyon state'e alınmaz
- Koruma kurulamazsa giriş anında geri kapatılır
