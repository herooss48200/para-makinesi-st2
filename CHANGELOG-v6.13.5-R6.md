# AGROS ST2 v6.13.5-R6 — MARKET DATA RECOVERY FAIRNESS

## Amaç
R5 FAST REFRESH sonrasında görülen DEGRADED market-data durumunu, Golden Renko / Entry Evolution / canlı emir matematiğini değiştirmeden düzeltmek.

## Kök neden
- Worker havuzu ağ concurrency'sinden büyüktü (normal 3 socket / 8 worker, startup 10 socket / 20 worker); bu, shared request queue üzerinde gereksiz bekleme ve queue-timeout baskısı oluşturuyordu.
- DEGRADED durumda 15m ve 1m refresh her turda tüm evreni baştan tarıyordu. Tur deadline'ı dolunca listenin sonundaki eksik semboller tekrar tekrar aç kalabiliyordu.
- Startup yalnız tek repair turu yapıyordu.
- Eksik cache slotları gerçek istek hatası gibi `Hata` alanında gösteriliyordu.
- `delta limit 3` ifadesi belirsizdi; bu coin limiti değil, sembol başına çekilen kapanmış mum delta limitidir.

## R6 düzeltmeleri
1. Symbol worker sayısı network concurrency'yi aşamaz.
2. Startup worker sayısı concurrency ile hizalandı; bounded çoklu repair eklendi.
3. DEGRADED 15m refresh yalnız eksik cache sembollerini missing-first, bounded batch halinde işler.
4. DEGRADED 1m Renko refresh aynı missing-first recovery davranışını kullanır.
5. Recovery tamamlanınca normal tüm-evren delta refresh otomatik geri gelir.
6. Gerçek istek/veri hatası, deadline-atlanan ve eksik cache telemetrisi birbirinden ayrıldı.
7. Telegram operasyon paneli `Eksik cache | İstek/veri hata | Deadline` olarak gerçeği gösterir.
8. %95 Entry Gate fail-closed eşiği korunmuştur.
9. Golden Renko, Entry Evolution, W%R shadow, Renko confirmation, profit-floor ve gerçek emir matematiği değiştirilmemiştir.
10. `pusuDeltaMumLimiti=3` ve `superTrendDeltaMumLimiti=3` korunmuştur; 3 = mum sayısıdır, coin sayısı değildir.
