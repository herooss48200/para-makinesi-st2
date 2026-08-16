# AGROS ST2 v6.13.5-R25.8 — STARTUP CANCELLABLE LIVENESS

## Amaç
R25.7 dedicated KLINE hattında PM2 online kalırken startup worker'larının sessizce bekleyebilmesi riskini kapatır.

## Değişiklikler
- Startup worker sayısı ve dedicated HTTPS socket sayısı 4/4 olarak eşlendi.
- Her sembolün 15m + 1m startup çifti için 20 saniyelik cancellable deadline eklendi.
- Repair istekleri için 40 saniyelik cancellable deadline eklendi.
- Deadline dolduğunda queued veya aktif HTTPS request AbortController ile gerçek anlamda iptal edilir; orphan request bırakılmaz.
- HTTPS transport `signal` desteği kazandı ve abort `EABORTED` olarak kapanır.
- Startup boyunca her 10 saniyede `STARTUP LIVENESS` kanıtı üretilir.
- R25.4 200-core readiness, R25.3 Premier/N5, R25 stop ekonomisi, 20 slot x 20USDT ve MACD Shadow-only korunmuştur.

## Test
- `npm run check`: EXIT 0
- Tüm `test_*.js`: 82/82 PASS
- Syntax: 194 JavaScript PASS
- R25.8 hung-request testi: request gerçekten abort edildi; shared startup KLINE çağrısı 0; caller envelope max 8.
