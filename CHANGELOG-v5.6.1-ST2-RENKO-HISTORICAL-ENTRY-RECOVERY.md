# AGROS ST2 v5.6.1 — Renko Historical Entry Recovery

- Entry Evolution boş başladığında eski ST2 veri yollarındaki `st2-renko-entry-evolution.json` hafızasını otomatik bulur ve en dolu bilimsel state'i geri yükler.
- Pattern bazında aktif öğrenilmiş giriş mesafesi korunur.
- Aday giriş havuzu: 0.25, 0.50, 0.75, 1.00, 1.25 ve 1.50 Renko tuğla.
- Her seviye için `Tetik/Toplam`, tetik oranı, TP/SL/BE, WR, Net, PF ve Expectancy raporlanır.
- En iyi giriş mesafesi N≥3, Net>0, PF>1, Expectancy>0 ve güncel ağırlıklı performansla otomatik atanır; açık pozisyonun seviyesi değişmez.
- Pusu Telegram kanıtı aynı sembol + pattern imzası için yalnız ilk oluşumda gönderilir; tekrar mesajları engellenir.
- Trade Engine değiştirilmemiştir; yalnız ST2 Renko giriş/raporlama ve hafıza köprüsü güncellenmiştir.
