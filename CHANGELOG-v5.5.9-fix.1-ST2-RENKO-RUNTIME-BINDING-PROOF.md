# v5.5.9-fix.1 — ST2 Renko Runtime Binding Proof

- `4_pozisyon.js` içindeki canlı kapanış → `renkoEntryEvolution.close()` bağı test sözleşmesine alındı.
- Her kapanış köprü çağrısı kalıcı telemetriye yazılır: çağrı, kabul ve ret sayıları.
- Ret nedenleri görünürdür: `NOT_ST2_RENKO`, `RESTART_GAP`, `IDENTITY_MISSING`, `RENKO_REFERENCE_MISSING`, `PRICE_PATH_MISSING`, `LEARNING_DISABLED`.
- Telegram ST2 Renko Giriş Evrimi bölümüne kapanış köprüsü ve ret nedenleri eklendi.
- Trade Engine, giriş şartı, stop, BE ve exit kararları değiştirilmedi.
