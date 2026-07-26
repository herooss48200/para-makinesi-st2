# AGROS ST2 v5.6.4 — Renko Exit Evolution & Manual Safety

- Pattern bazlı Renko Exit Evolution eklendi (0.50–2.00 tuğla replay).
- Çıkış mesafesi giriş ataması gibi pozisyon açılışında snapshot olarak bağlanır.
- Renko çıkış yalnız ilk kâr korumasından sonra yönetimi devralır.
- İlk kâr koruma stopu taban/tavan olarak korunur; stop geriye gidemez.
- Önceki dinamik exit, Renko devraldıktan sonra canlı kapanış yetkisini kaybeder ve shadow kalır.
- Telegram: açılış/pusu/stop ilerleme gürültüsü varsayılan kapalı; canlı rapor, kapanış, devralma, giriş/çıkış evrim raporları korunur.
- Binance uygulamasından manuel kapanış `MANUAL_EXTERNAL_CLOSE` olarak uzlaştırılır.
- Manuel kapanış Exit Evolution öğrenmesine dahil edilmez ve aynı sinyal için yeniden giriş kilidi uygulanır.
- State, backup, ledger ve duplicate koruması eklendi.
- `npm run verify:v564` ile v5.5.7–v5.6.4 zinciri doğrulandı.
