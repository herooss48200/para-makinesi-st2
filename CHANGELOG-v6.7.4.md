# AGROS ST2 v6.7.4 — Telegram Startup Reliable Delivery

- Açılış mesajı için teslim-öncelikli kritik Telegram hattı eklendi.
- Startup artık Native IPv4 ile başlar, curl IPv4 fallback ve kontrollü retry kullanır.
- Renko pusu bildirimlerinin at-most-once davranışı değiştirilmedi.
- Boş curl cevabı `CURL_EMPTY_RESPONSE`, geçersiz cevap `CURL_INVALID_JSON_RESPONSE` olarak ayrıştırılır.
- Varsayılan Telegram timeout 15 saniyeye, kritik retry 2 denemeye yükseltildi.
- Trade Engine, giriş, stop, BE, exit, LAB promotion/demotion ve muhasebe değiştirilmedi.
