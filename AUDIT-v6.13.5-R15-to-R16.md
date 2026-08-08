# R15 → R16 Full Chain Audit

## Bulgu A — canlı ana döngü ölümü
R15 dedicated ticker shared KLINE queue/agent'tan ayrılmış olsa da canlı Binance global ticker çağrısı 6 sn hard timeout / socket hatası üretiyordu. Ana loop exception ile turu bitirdiği için `ST2 RENKO AUDIT` hiç oluşmuyordu.

### R16 kararı
Global ticker artık ENTRY motorunun tek varlık koşulu değildir. Golden startup'ta zaten başarıyla alınan kapanmış 1m mumlar, yalnız ENTRY taraması için sınırlı ve tazelik kontrollü fallback fiyat kaynağıdır.

## Bulgu B — gerçek pozisyon güvenliği
Fallback fiyat ile gerçek açık pozisyon trailing/manuel kapanış yönetmek güvenli değildir.

### R16 kararı
Herhangi bir `sanal:false` açık pozisyon varsa fresh network ticker zorunlu tutulur. Network yoksa loop koruma katmanına geçmez ve fail-closed raporlar. Exchange-native SL/TP bağımsız kalır.

## Bulgu C — işlem açmama nedeni görünürlüğü
Eski funnel `Evolution fiyat uygun 0` altında DIRECT fiyat bekleme ile CONFIRMED kapanmış dönüş beklemeyi birbirine karıştırıyordu.

### R16 kararı
Audit artık Mode D/C dağılımı, DIRECT price wait, CONFIRMED reversal wait + reason, CONFIRMED price wait ve 1m ST wait'i ayrı gösterir.

## Bulgu D — test kapsamı boşlukları
Hızlı suite canlı ticker→audit kopuşunu yakalamıyordu. Full suite ayrıca iki eski/uyumsuz kontratı görünür yaptı.

### R16 kararı
- v6149 market-price fallback live-chain eklendi.
- v6150 DIRECT/CONFIRMED → shared pozisyonAc authority eklendi.
- v6111 güncel legacy compatibility testine çevrilip full suite'e alındı.
- v6131 ve R14/R15/R16 liveness testleri full suite'e dahil edildi.
- R12 gerçek Renko-ST readiness rapor kontratı korundu.
