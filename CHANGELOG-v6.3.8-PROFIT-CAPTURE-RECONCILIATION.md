# AGROS ST2 v6.3.8 — PROFIT CAPTURE RECONCILIATION

- Giriş, pusu, Premier, stop başlangıcı ve Trade Engine yapısı değiştirilmedi.
- Mevcut Renko çıkış yönetimine, anlamlı MFE sonrası tepe kârın yapılandırılabilir asgari bölümünü koruyan stop tabanı eklendi.
- Varsayılan tetik: MFE %0.40; varsayılan koruma: tepe kârın %60'ı.
- Tuğla bazlı Renko stopu çalışmaya devam eder; yeni MFE tabanı yalnız daha güçlü stop üretiyorsa uygulanır.
- Stop geriye gidemez; mevcut monotonic stop güvenliği korunur.
- Canlı portföydeki yanıltıcı “K1 koruma aktif” kaldırıldı.
- Portföy satırı artık gerçek durumu gösterir: “Koruma bekliyor”, “Güvenli koruma” veya “Renko yönetimi”.
