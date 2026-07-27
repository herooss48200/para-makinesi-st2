# AGROS ST2 v6.0.1 — Historical DNA Bootstrap

- `bestHistoricalEntry` alanı artık doğru okunur.
- Tarihsel training state/ledger hem `data/` hem `replay-results/v570-first-test/` altında otomatik bulunur.
- Ledger olayları tam Pattern DNA bağlamına (RBB, RBBW, RENKO6, ATR, TREND20, SESSION) göre bootstrap edilir.
- Canlı kapanış olmasa bile geçmiş DNA profilleri Adaptive DNA Registry ve Telegram raporunda görünür.
- Yeni canlı son-3 kanıt oluşana kadar tarihsel giriş aktif prior olarak kullanılır.
- Trade Engine ve açık pozisyonlar değiştirilmez.
