# AGROS ST2 v6.10.5 — Active Exit Report Reconciliation

- Operasyon panelindeki Exit Replay sayacı yalnız açık pozisyonları ölçtüğü açıkça belirtildi.
- `Exit Replay Hazır` ifadesi `Aktif Pozisyonlarda Exit Replay` olarak değiştirildi.
- FALLBACK ve atama kanıtı aynı aktif pozisyon kapsamı içinde raporlanır.
- Restart-GAP veya eski state'ten gelen pozisyonda Entry Replay N>0 ise, dondurulmuş eski `Entry Replay kanıtı yok` açıklaması rapor anında `Giriş kanıtlı` metniyle uzlaştırılır.
- Restart-GAP bilimsel dışlama kuralı değişmedi; yalnız rapor metni düzeltildi.
- Trade Engine, emir açılışı, SL/TP, Takeover, ATR ve muhasebe matematiği değiştirilmedi.
