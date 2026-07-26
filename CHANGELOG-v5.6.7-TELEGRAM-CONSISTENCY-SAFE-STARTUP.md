# AGROS ST2 v5.6.7 — Telegram Consistency & Safe Startup

- Renko Pattern Premier (`RENKO_PATTERN_PREMIER`) ana Premier bilimsel üst kasasına bağlandı.
- Açılan/kapanan Renko Premier işlemleri artık Premier aggregate, mutabakat ve sonuç metriklerine yazılır.
- Reverse Premier ayrı defterde kalır.
- Canlı raporda `Renko Premier Pattern`, `Canlı Premier` ve `Kapanan Premier N` kavramları ayrıldı.
- Boş Negative League, boş değişim ve tekrarlı Selection Intelligence açıklamaları gizlendi.
- ST2 Telegram'da periyodik BlackBox 14 parçalık Cluster/Similarity/Calibration/Karar Laboratuvarı raporları kapatıldı.
- Entry Evolution replay ve Exit Evolution replay raporları korundu.
- Renko Exit Evolution yönetimi devralma ve işlem kapanış mesajları korundu.
- Güvenli başlatma sırası: kalıcı state yükle → Entry State/Ledger doğrula → semboller/borsa devralma → motor.
- State/Ledger bozuk veya farklıysa sistem fail-closed davranır ve Trade Engine'i başlatmaz.
