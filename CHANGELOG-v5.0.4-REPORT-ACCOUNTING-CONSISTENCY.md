# AGROS v5.0.4 — Report & Accounting Consistency

- Kapanış başlığı artık açılışta dondurulmuş LAB kararından üretilir: Premier, gölge, gerçek ve Restart Gap birbirine karışmaz.
- Restart Gap pozisyonları yanlışlıkla “LAB Premier” başlığıyla gösterilmez.
- Eski pozisyonlarda mevcut DNA anahtarından Family/LAB/FULL kimliği güvenli biçimde geri kazanılır.
- Kimliği gerçekten bulunamayan eski kayıtlar `#YOK` yerine açık bir “ESKİ KAYIT” açıklamasıyla gösterilir.
- Eski `Açılan 2702 / Kapanan 2105` satırı bilimsel olarak ayrıştırıldı.
- Geçmiş sayaçlar değiştirilmez: bilimsel kapanış, Restart Gap kapanışı ve tarihsel sayaç farkı ayrı gösterilir.
- v5.0.4 sonrası her pozisyon tek açılış/tek kapanış ilkesiyle yeni kesin muhasebe defterinde izlenir.
- Yeni defter Premier, gölge, gerçek ve Restart Gap kategorilerini ayrı tutar ve her raporda mutabakat farkını gösterir.
- Trade Engine, Exit seçimi, League kabul şartları ve geçmiş öğrenme verileri değiştirilmedi.
