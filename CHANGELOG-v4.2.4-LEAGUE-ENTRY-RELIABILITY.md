# AGROS v4.2.4 — League Entry Reliability

- DNA anahtarları lig oluşturma ve emir anında aynı kanonik formata çevrilir.
- Eski yalnızca YON/BTC/COIN anahtarlı lig kayıtları için yalnızca tek aday varsa güvenli geriye uyumlu eşleşme yapılır.
- Birden fazla BB/TF varyantı varsa yanlış izin verilmez; sistem fail-closed kalır.
- Her emir adayında lig, eşleşme türü, exit ve izin/engel sebebi teşhis loguna yazılır.
- Telegram açılış mesajında DNA, lig, eşleşme ve atanan exit açıkça görünür.
- Kanıtlı özel exit yoksa Mevcut Kademe Sistemi fallback olarak korunur.
- Engellenen giriş sayacı aynı adayın döngüsel tekrarlarını benzersiz giriş gibi saymaz; ham kontrol ayrıca tutulur.
- Sanal dinamik exit aktif, gerçek emir güvenlik kilidi değişmedi.
