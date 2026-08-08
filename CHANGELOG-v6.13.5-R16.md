# AGROS ST2 v6.13.5-R16 — PRICE FALLBACK & FULL CHAIN RECOVERY

## Canlı kök neden
R15 startup readiness'i 200/200 tamamladı; CORE refresh ve ST1 shadow ilk audit sonrasına ertelendi. Buna rağmen global Futures ticker canlı ağda tekrar tekrar `FUTURES_PRICES:HARD_TIMEOUT:6000ms` / socket hatası verdiği için ana loop Renko scan'e ulaşamıyordu.

## R16 düzeltmeleri
1. İlk Golden Renko auditinde global ticker çağrısı tamamen bypass edilir; startup'ta zaten alınmış kapanmış 1m mumların son close'u taze fiyat snapshot'ı olarak kullanılır.
2. Normal çalışma sırasında global ticker tercih edilir; geçici ticker arızasında yeterli ve taze kapanmış 1m kapsaması varsa ENTRY taraması kontrollü fallback ile devam eder.
3. Fallback fiyat maksimum yaşı 120 sn; stale snapshot yeni giriş yetkisi vermez.
4. Gerçek açık pozisyon koruması için network fiyatı zorunludur; ticker yokken gerçek pozisyon yönetimi fail-closed kalır.
5. Ticker arızasında exponential backoff uygulanır; her loop'ta 6 sn timeout fırtınası oluşmaz.
6. Startup ve periyodik 1m refresh, fiyat fallback metadata'sını aynı kapanmış mum kaynağından günceller.
7. Entry funnel DIRECT / CONFIRMED ayrımını görünür yapar. CONFIRMED dönüş bekleme nedenleri ayrı sayılır (`CLOSED_REVERSAL_NOT_FOUND`, `REVERSAL_PREDATES_SIGNAL`, vb.).
8. R12 rapor kontratı düzeltildi: ham 1m veri ile gerçekten hesaplanabilir 1m Renko-ST readiness ayrı gösterilir.
9. Eski v6.11.1 profit-floor testi güncel configurable 10-slot sözleşmesi altında legacy güvenlik invariant testine dönüştürüldü ve full suite'e geri alındı.
10. `test:v6131`, `v6147`, `v6148`, yeni `v6149`, `v6150` full suite zincirine dahil edildi.

## Yeni uçtan uca kanıtlar
- `v6149`: ilk audit ticker'a dokunmadan taze kapanmış 1m fiyatla devam eder; ticker failure giriş taramasını öldürmez; stale veri giriş vermez; gerçek açık pozisyon network yoksa fail-closed.
- `v6150`: DIRECT ve CONFIRMED uygun tetikler aynı `pozisyonAc` otoritesine ulaşır; CONFIRMED dönüş hazır değilse emir açılmaz ve gerçek bekleme nedeni audit'e yazılır.

## Değişmeyen karar matematiği
- Entry Evolution offset öğrenmesi
- SUCCESS-FIRST DIRECT/CONFIRMED Mode Policy seçim kuralları
- Premier/Shadow gerçek emir yetkisi
- 80→240→480 Renko-ST readiness onarımı
- Stop / early economy / profit-floor / Renko trail / gerçek emir execution matematiği
- Williams %R shadow-only davranışı
