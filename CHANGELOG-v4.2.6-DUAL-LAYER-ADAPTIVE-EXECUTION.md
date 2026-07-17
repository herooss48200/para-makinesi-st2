# AGROS v4.2.6 — Dual Layer Adaptive Execution

## Alt öğrenme katmanı
- Tüm geçerli pusu + sniper tetikleri ligden bağımsız olarak sanal işlem açar.
- UNRANKED, Development, Championship ve Premier DNA kayıtları öğrenmeye devam eder.
- Her açılışta DNA için 33 exit yarışından o anda kanıtlı olan güncel kazanan exit yeniden seçilir.
- Kazanan exit değişirse aynı DNA'nın bir sonraki sanal işlemi yeni exit ile açılır.
- Kanıtlı/desteklenen exit yoksa mevcut kademe sistemi güvenli fallback olarak çalışır.

## Üst gerçek emir katmanı
- Gerçek emir kapısı fail-closed kalır.
- Yalnız Premier, pozitif expectancy, PF > 1, pozitif net, yeterli örnek, güncel model ve açık gerçek emir yetkisi geçebilir.
- Gerçek pozisyona da açılış anındaki güncel DNA exit planı atanır.
- `gercekDynamicExitAktif` ayrıca açılırsa plan gerçek pozisyonda uygulanabilir; varsayılan kapalıdır.

## Güvenlik
- Sanal mod Binance'e emir göndermez.
- Gerçek emir ve gerçek dinamik exit varsayılan olarak kilitlidir.
- Dinamik exit kanıtı yoksa mevcut SL/TP/kademe fallback korunur.
