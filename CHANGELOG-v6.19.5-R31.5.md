# AGROS ST2 v6.19.5-R31.5 — STARTUP ENTRY FAST RECONCILE

- Warmup sonrası REAL giriş kapısı artık ağır `startupReconcile()` yerine `startupEntryReconcile()` kullanır.
- Startup güvenlik otoritesi: iki aşamalı `positionRisk`, hesap-geneli AGST2 orphan normal/algo emir temizliği, yön/unknown pozisyon fail-closed ve mevcut açık pozisyon koruma doğrulaması.
- Borsada artık açık olmayan eski `OPEN/CLOSING/QUARANTINED` kayıtlar `CLOSE_ACCOUNTING_PENDING` durumuna alınır; tarihsel fill/algo/komisyon muhasebesi REAL giriş kapısını tutmaz.
- Pending kapanış muhasebesi background reconcile worker içinde sınırlı sayıda ve bounded signed-read ile tamamlanır.
- Muhasebe fill'i henüz görülemiyorsa kayıt pending kalır; tek başına hesap-geneli REAL kapısını kilitlemez. Aktif orphan emir veya bilinmeyen/ters yönlü borsa pozisyonu yine HARD FAIL-CLOSED'dur.
- R31.4 snapshot liveness, R31.3 single-flight, simetrik Onur Guard, 15m/1m Renko, 20 slot ve R26 stop ekonomisi korunur.
