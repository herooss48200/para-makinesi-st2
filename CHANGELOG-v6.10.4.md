# AGROS ST2 v6.10.4 — Premier Close Counter Reconciliation

## Düzeltilenler
- Operasyon panelindeki Premier N/başarılı/başarısız sayaçları eski LAB aggregate yerine bilimsel kapanış ledger'ından üretilir.
- Gerçek Score-Premier kapanışları bilimsel Premier toplamına dahil edilir.
- Gerçek Premier sonuçları sanal Premier sonuçlarından ayrı satırda gösterilir.
- Shadow sonuçları ayrı bilimsel partition olarak korunur.
- Entry Replay N>0 olduğu halde Exit fallback açıklamasının “Entry kanıtı yok” demesi engellenir.

## Değişmeyenler
- Trade Engine ve giriş koşulları
- Gerçek emir gönderimi
- SL/TP, Takeover ve ATR trailing matematiği
- 2 USDT marjin, 5x kaldıraç, 1 gerçek pozisyon ve 200 Shadow ayarları
