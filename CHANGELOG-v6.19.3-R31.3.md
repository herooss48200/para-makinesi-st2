# AGROS ST2 v6.19.3-R31.3

## Acil canlı düzeltmeler
- Onur Final Direction Guard simetrik hard-veto olarak korunur:
  - BTC+ETH güçlü UP ve iki gap >= %1.00 => SHORT hard veto.
  - BTC+ETH güçlü DOWN ve iki gap >= %1.00 => LONG hard veto.
  - Mixed/sideways => veto yok.
  - BTC/ETH veri eksik => fail-open.
- Gerçek mutabakat `positionRisk` okuması single-flight yapıldı. Timeout olan alttaki HTTP isteği gerçekten bitmeden yeni `positionRisk` isteği başlatılmaz; request pile-up önlenir.
- `gercekPozisyonMutabakatTimeoutMs`: 8000 -> 20000 ms.
- `st2ExchangeReconcileIntervalMs`: 5000 -> 30000 ms.
- `st2ExchangeReconcileFreshMs`: 180000 ms korunur.
- Telegram panel Native timeout'u panel lane için 3500 ms'ye zorla kırpılmıyor; ayardaki 6000 ms kullanılabilir.
- Gerçek açılış/kapanış kritik Telegram teslim hattı korunur.
- 15m REAL + 1m confirmation mimarisi korunur.

## Güvenlik
- Reconciliation başarısızsa gerçek yeni entry fail-closed kalır.
- Single-flight, timeout durumunda güvenliği fail-open yapmaz.
- Onur guard veri yokluğunda yalnız kendi veto katmanında fail-open davranır; ana gerçek emir safety gate değişmez.
