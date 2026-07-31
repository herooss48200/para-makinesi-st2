# AGROS ST2 v6.10.1 — REAL ORDER ENDPOINT AUTHORITY

## Kritik düzeltme

`binance-api-node@0.13.10` Futures endpoint seçimi `httpFutures` alanıyla yapılır. Önceki kaynak `baseURL` alanını gönderiyor ve başlangıç logunu sabit biçimde “Testnet” yazıyordu. Bu durum gerçek endpoint ile log/gerçek emir kapısının farklı gerçeklikler kullanmasına yol açabilirdi.

## Değişiklikler

- Yeni `86_st2_binance_endpoint_authority.js` tek endpoint otoritesi eklendi.
- İstemci artık doğru `httpFutures` alanıyla oluşturulur.
- Desteklenen değişken önceliği:
  1. `BINANCE_FUTURES_HTTP_BASE`
  2. `BINANCE_FUTURES_BASE_URL`
  3. Geriye uyumlu `BINANCE_BASE_URL`
- `AGROS_REAL_ORDER_ENV=MAINNET` olduğunda güvenli public/private başlangıç fallback’i `https://fapi.binance.com` olur.
- Gerçek emir yetkisi için endpointin ayrıca açıkça tanımlanmış olması ve tam olarak `https://fapi.binance.com` ile eşleşmesi zorunludur.
- Testnet veya bilinmeyen endpoint, ARM ve ACK doğru olsa bile mainnet gerçek emir yetkisi alamaz.
- Başlangıç logu artık gerçek endpointi ve `MAINNET/TESTNET/UNKNOWN` etiketini gösterir.
- Gerçek hesap process lock anahtarı, istemcinin kullandığı aynı normalize Futures endpointinden üretilir.
- v6.10.0 idempotency, fill mutabakatı, Algo SL/TP, restart recovery ve muhasebe güvenliği aynen korunur.

## AWS zorunlu `.env`

```dotenv
AGROS_REAL_ORDER_ENV=MAINNET
BINANCE_FUTURES_HTTP_BASE=https://fapi.binance.com
AGROS_REAL_ORDER_ARM=DISABLED
AGROS_REAL_ORDER_EXECUTION_ACK=DISABLED
```

ARM ve ACK yalnız mainnet read-only mutabakatı doğrulandıktan sonra açılır.
