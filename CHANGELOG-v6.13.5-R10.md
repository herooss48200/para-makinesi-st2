# AGROS ST2 v6.13.5-R10 — Telegram Live Panel Delivery Truth

## Kök neden
30 saniyelik `bot.js` zamanlayıcısı ve R9 startup guard çalışıyordu. Sorun Telegram canlı panel teslim hattındaydı:

- `editMessageText` native taşımasında timeout/ECONNRESET gibi **belirsiz teslim** oluştuğunda çağrı, `sendMessage` ile aynı at-most-once mantığına düşüyordu.
- Oysa `editMessageText` aynı `message_id` ve aynı metinle idempotenttir; güvenli biçimde curl üzerinden doğrulanabilir/tekrarlanabilir.
- Canlı panel kodu başarısız/dropped teslimden sonra bile global `sonCanliRaporMetni` hafızasını ilerletebiliyor, böylece Telegram'daki görünür panel ile iç hafıza ayrışabiliyordu.
- Başarısız canlı panel teslimi ayrıca yeterince görünür log üretmiyordu.

## Düzeltme
- Yalnız `editMessageText` idempotent retry hattına alındı; `sendMessage` çift mesaj güvenliği aynen korunur.
- Native edit belirsiz kalırsa curl ile güvenli doğrulama yapılabilir.
- Tekrar sonucunda Telegram `message is not modified` döndürürse bu, editin zaten uygulanmış olduğunun teslim kanıtı kabul edilir.
- `sonCanliRaporMetni` / chat-bazlı son metin yalnız doğrulanmış edit veya send başarısından sonra ilerler.
- `coalesced` artık canlı panel teslim başarısı sayılmaz.
- Teslim edilemeyen panel `CANLI_RAPOR_TESLIM_EDILEMEDI` ile görünür hata üretir.

## Korunan sözleşmeler
- 30 saniyelik `canliRaporGuncellemeMs: 30000` değişmedi.
- R9 startup panel guard değişmedi.
- %95 startup Entry Gate değişmedi.
- Market-data / Binance network katmanı değişmedi.
- Golden Renko, Entry Evolution, DIRECT/CONFIRMED, gerçek emir, stop/kâr koruma ve Williams katmanları değişmedi.
