# AGROS v5.0.11 — Premier Canonical Ledger

- LAB Premier sanal test kartı artık yalnız `Açılan / Aktif / Kapanan` üçlüsünü göstermiyor.
- Yeniden başlatma sonrası öğrenme karantinasına alınan eski Premier pozisyonlar ayrı `Restart-GAP Aktif/Kapanan` kovasında görünür.
- Kanonik denklem zorunludur: `Açılan = Bilimsel Kapanan + Bilimsel Aktif + GAP Aktif + GAP Kapanan`.
- Denklem farkı Telegram ve terminalde açıkça gösterilir; hedef daima `Fark +0 ✅`.
- Başarı, Net, PF ve Expectancy yalnız bilimsel Premier kapanışlarından hesaplanır; GAP sonuçları öğrenmeye dahil edilmez.
- Mevcut öğrenilmiş veri, pozisyon, Trade Engine, Entry-Proven kuralı, Exit ataması ve gerçek emir kapısı değiştirilmemiştir.
