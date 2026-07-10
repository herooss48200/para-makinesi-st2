AGROS v3.6.2 - RESTART GAP PROTECTION

Amaç:
Bot kapalıyken fiyat yolu izlenemeyen, restart sonrası hafızadan geri yüklenen aktif
pozisyonların bilimsel istatistikleri bozmasını engellemek.

Davranış:
- Restart sonrası yüklenen tüm aktif pozisyonlar RESTART_GAP olarak işaretlenir.
- PNL ve komisyon muhasebede korunur.
- TP/SL/BE başarı sayaçlarına dahil edilmez.
- Pusu Kalite, Analiz Merkezi, BlackBox/DNA, Exit Optimizer ve Exit Replay'e dahil edilmez.
- Kapanışlar data/restart-gap-trades.jsonl dosyasına ayrı denetim kaydı olarak yazılır.
- Telegram kapanışında karantina uyarısı gösterilir.
- Restart sonrasında açılan yeni işlemler normal temiz öğrenme verisi olarak değerlendirilir.

Önemli:
Bu koruma sürüm kurulduktan sonraki kapanışlar için geçerlidir. Daha önce kapanmış
restart-gap işlemlerini otomatik geri saymaz; geçmiş sayaçlara güvenli olmayan otomatik
müdahale yapılmaz.
