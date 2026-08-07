# AGROS ST2 v6.13.5-R14 — CRITICAL TICKER DEADLINE & FIRST-AUDIT ISOLATION

## Canlı kök neden
R13 canlıda Golden Renko startup readiness'i 200/200 tamamladı ve ST1 shadow'ı ilk audit sonrasına erteledi.
Buna rağmen ana işlem döngüsü ilk Renko auditine ulaşamadı.

Canlı watchdog kanıtı:
- FUTURES_PRICES 60+ saniye bloklandı.
- Sonraki örneklerde 136s ve 211s seviyesine ulaştı.
- Aynı anda Binance ağ motorunda aktif/inFlight işler vardı.
- req.setTimeout(15s) Agent socket bekleme süresini kesin olarak sınırlamıyordu.
- Startup sonunda periyodik 1m Renko-ST refresh planı 15 saniye sonra yeniden 200 sembollük bulk ağ işi başlatabiliyordu.

## R14 düzeltmesi
1. İlk gerçek ST2 Renko auditinden önce hiçbir 15m/1m periyodik 200-sembol refresh başlatılmaz.
2. İlk audit tamamlandıktan sonra çekirdek periyodik refresh planı başlatılır.
3. ST1 shadow bundan sonra ayrıca ve düşük öncelikle planlanır.
4. Binance ortak ağ kuyruğunda normal bulk concurrency korunur; yalnız CRITICAL istek için +1 ayrılmış overflow socket vardır.
5. HTTPS isteğine socket bekleme dahil tüm yaşamı sınırlayan wall-clock HARD_TIMEOUT eklendi.
6. FUTURES_PRICES fail-fast: 6000 ms, retry 0. Sonraki ana loop doğal retry görevi görür.

## Değişmeyenler
- Entry Evolution ve Entry Mode Policy matematiği
- DIRECT / CONFIRMED karar modeli
- Renko 80 -> 240 -> 480 readiness onarımı
- Stop, profit-floor, exit ve gerçek emir matematiği
- R8 bulk KLINE retry/spacing/keep-alive semantiği
- Telegram bağımsız 30 sn scheduler
- Williams %R shadow-only davranışı
