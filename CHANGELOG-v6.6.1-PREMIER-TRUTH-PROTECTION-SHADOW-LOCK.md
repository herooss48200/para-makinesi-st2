# AGROS ST2 v6.6.1 — Premier Truth, Protection Truth & Shadow Optimizer Lock

- `RENKO_PATTERN_PREMIER` kapanışları ana Premier aggregate ve Telegram sonucuna dahil edildi.
- Defterde mevcut Renko Premier kapanışları veri taşımaya gerek kalmadan geriye dönük doğru raporlanır.
- K3 koruma aşaması stop hareketinden sonra kalıcıdır; sonraki fiyat döngüsünde yanlışlıkla K2'ye düşmez.
- K aşaması ve açıklama aynı durum haritasından üretilir; K2/K3 metin çelişkisi engellendi.
- Global optimizer açıkça `SHADOW_ONLY` ve `liveGateAuthorized=false` olarak kilitlendi.
- Global optimizer Telegram başlığı deneysel replay olduğunu ve Trade Engine yetkisi bulunmadığını açıkça yazar.
- Giriş, pusu, stop/BE matematiği, gerçek emir yetkisi ve açık pozisyon assignment'ları değiştirilmedi.
