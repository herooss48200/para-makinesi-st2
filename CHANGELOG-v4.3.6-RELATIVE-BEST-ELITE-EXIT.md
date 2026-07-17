# AGROS v4.3.6 – Relative Best Elite Exit

- Elite Exit değerlendirmesi 5 kapanışta bir canlı olarak yenilenir.
- Öncelik pozitif net, PF > 1 ve güçlenen doğrulanmış Exit modelidir.
- Bu şartları sağlayan Exit yoksa DNA exitsiz bırakılmaz.
- En az 5 örnekli Shadow Exit modelleri canlı performansa göre sıralanır ve göreceli en iyi model Elite atanır.
- Sıralamada zayıflamama/güçlenme, son 5 ortalama net, son 5 Beat Rate, toplam skor ve toplam net dikkate alınır.
- Hiçbir Shadow Exit 5 örneğe ulaşmadıysa mevcut kademe sistemi fallback olarak devam eder.
- Atama yalnızca yeni pozisyonlar için güncellenir; açık pozisyonun Exit planı işlem ortasında değiştirilmez.
