# AGROS ST2 v6.13.5-R25.7 — STARTUP DEDICATED KLINE

## Amaç
R25.6 canlı kanıtında startup sırasında 15m/1m core cache ilerlemesi kabul edilemez derecede yavaştı. R25.7 yalnız market-data startup liveness hattını değiştirir.

## Değişiklikler
- 200-sembol startup KLINE trafiği normal shared Binance request queue’dan ayrıldı.
- Startup için ayrı bounded keep-alive HTTPS Agent kullanılır; maksimum soket ayarı 8’dir.
- Açık pozisyon/Blackbox/diğer runtime KLINE işleri startup çekirdeğinin kuyruğunu artık paylaşmaz.
- HTTP hard timeout Agent kuyruğunda değil, request socket aldıktan sonra başlar.
- 15m repair ve 1m Renko ST 240/480 repair zinciri korunur.
- Shared runtime Binance concurrency değiştirilmez.
- Entry Gate gösterimi artık işlenen sembolü hazır veri gibi göstermiyor; READY sayısı ayrıca görünür.

## Değişmeyenler
- R25.3 Premier/N5 seçim otoritesi korunur.
- 20 gerçek slot × 20 USDT korunur.
- SL -%2.50; +%1.50 → +%1.00; sonra %0.50 geriden / 0.50 puan adım korunur.
- MACD SHADOW-only; emir/stop yetkisi yoktur.
- Canlı data/ledger dosyaları pakete dahil değildir.
