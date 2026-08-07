# AGROS ST2 v6.13.5-R8 — MARKET DATA KNOWN GOOD ROLLBACK

## Neden
R5 MARKET-DATA-FAST-REFRESH canlıda Golden Renko market-data warmup zincirini bozdu. R6 fairness/recovery ve R7 transport toleransı semptomları iyileştirdi ancak R5 scheduler/queue mimarisini koruduğu için aynı problem çevresinde yeni semptomlar oluştu.

## Kesin çözüm
- `revizyon.js`: R5 öncesi, R4'e kadar canlıda kullanılan dosyaya byte-identical geri dönüş.
- `64_binance_network_resilience.js`: R5 öncesi ağ kuyruğu/transport dosyasına byte-identical geri dönüş.
- `ayarlar.js`: R5/R6/R7'ye ait startup/bulk override, delta/watchdog/recovery ayarları kaldırıldı.
- Kanıtlanmış ortak profil geri geldi: normal ağ 3 bağlantı, startup 8 bağlantı / 16 worker, 15 sn timeout, 2 retry, 90 sn toplu veri retry penceresi.
- `%95` startup fail-closed gate korunur.
- R5 ile gelen görünürlük iyileştirmeleri korunur: 1m veri cache sayısı, hesaplanan 1m Renko ST sayısı ve doğru rapor telemetrisi.
- Golden Renko, Entry Evolution, gerçek emir, stop/Restart-GAP, profit floor, Williams %R ve Renko confirmation matematiği değiştirilmedi.

## Canlı kabul kriteri
Yeni sürüm ancak gerçek 200 coin warmup'ta `%95+` 15m/1m cache, `Entry Gate READY`, ardından `ST2 RENKO AUDIT` ve pusu zinciri görülürse başarılı kabul edilir.

## R8 FINAL düzeltmesi — active-universe cache accounting
İlk R8 paketinde `revizyon.js` tam R4 byte rollback yapılırken v6.13.3 sonrası eklenen aktif-ticaret-evreni cache sayım yardımcı fonksiyonu da istemeden geri alınmıştı. Bu durum `test_v6133_profit_capture_and_cache_accounting.js` testini kırdı ve eski/yardımcı sembollerin startup cache hesabına sızabilmesine yol açabilirdi.

Düzeltme yalnız accounting shim'idir:
- `aktifEvrenSeti()` ve `cacheHazirSayisi(cache)` geri eklendi.
- startup 15m/1m hazır cache sayıları yalnız `h.state.semboller` aktif evreni üzerinden sayılır.
- pre-R5 scheduler/network motor davranışı değişmedi.
- R5/R6/R7 scheduler/transport katmanları geri getirilmedi.
