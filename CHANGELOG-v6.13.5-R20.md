# AGROS ST2 v6.13.5-R20 — LIVE PANEL DIRECT & ENTRY TRUTH FINAL

- 30 saniyelik canlı operasyon paneli generic bulk/detail Telegram kuyruğundan ayrıldı.
- Panel kendi latest-only worker'ından doğrudan bounded Native IPv4 -> curl fallback taşımasına gider.
- Panel için ayrı rate lane ve son başarılı teslim telemetrisi eklendi.
- Canlı panel `Son teslim <sn>/<EDIT_DIRECT|SEND_DIRECT>` gösterir.
- 30 sn davranışı editMessageText olarak korunur; 3 dk davranışı yeni panel balonunu alta taşıma davranışıdır.
- CONFIRMED pusuda mutlak giriş seviyesi 1m dönüş tuğlası oluşmadan bilinmediği için artık `0.000000000` yazılmaz.
- CONFIRMED pusu mesajı `0.25T → 1m dönüş sonrası hesaplanacak` şeklinde doğru semantik kullanır.
- Gerçek giriş, Premier/Shadow, Entry Mode Policy, Renko/ST, stop/trailing ve pozisyon matematiği değiştirilmedi.
