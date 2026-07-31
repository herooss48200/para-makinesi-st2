# AGROS ST2 v6.9.1 — FINAL CALIBRATED PREMIER

## Amaç

v6.9.0 Premier Score altyapısını gerçek bilimsel kapanışlarla kronolojik olarak doğrulamak ve yalnız validation üstünlüğü varsa ağırlık/eşik politikasını etkinleştirmek.

## Değişiklikler

- `84_st2_premier_score_calibration.js` eklendi.
- Gerçek `SCIENTIFIC_CLOSE` ledger kayıtları zaman sırasıyla işlenir.
- Her kapanış yalnız kendisinden önceki canlı, Entry ve Takeover kanıtıyla puanlanır.
- Restart-GAP, manuel/harici kapanış ve eksik exact-context kayıtları audit dışı tutulur.
- Eski katı Premier, v6.9.0 varsayılan skor ve optimize aday model aynı tabloda karşılaştırılır.
- Veri ilk %70 train, son %30 validation olarak ayrılır.
- Validation PF/expectancy/net pozitif değilse kalibrasyon fail-closed kalır.
- Optimize model güvenli bulunursa `data/st2-premier-score-calibration.json` atomik yazılır.
- Runtime bu dosyayı otomatik okur; dosya yoksa v6.9.0 varsayılan ağırlıklar korunur.
- Pusu Telegram mesajında skor bileşenleri, ağırlıklar, tarihsel ekonomi, son 5, Entry ve Takeover kanıtı gösterilir.
- Operasyon raporunda aktif model kaynağı, eşik politikası ve ağırlıklar görünür.

## Değişmeyenler

Trade Engine, Renko pusu oluşumu, giriş fiyatı, stop, BE, MFE Capture, ATR Takeover, exit matematiği, state/ledger formatı ve 200 coin evreni değiştirilmedi.
