# AGROS v4.4.5 — Filter Simulator Top-10 Alignment

## Düzeltme
- Telegram DNA Filter Simulator kümülatif senaryosu 5 yerine 10 aday üzerinden hesaplanır.
- `İlk 10 aday çıkarılırsa` satırı artık gerçek Top-10 hesap sonucunu gösterir.
- Simülasyon raporunun, aktif `Dinamik En Kötü 10` sanal-kasa-dışı gölge kuralından ayrı olduğu Telegram'da açıkça belirtilir.

## Değişmeyen davranış
- Trade Engine, pusu, sniper, lig ve exit motorlarına dokunulmadı.
- Aktif Dinamik En Kötü 10 gölge öğrenme kuralı aynen korunur.
- Bu rapor geçmiş veri simülasyonudur; doğrudan emir filtresi değildir.
