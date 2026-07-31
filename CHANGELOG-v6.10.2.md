# AGROS ST2 v6.10.2 — LIVE PROTECTION RECOVERY

- Gerçek risk yalnız `ayarlar.js` sayfasından yönetilir: 2 USDT marjin, 5x ve türetilmiş 10 USDT notional, maksimum 1 aktif gerçek pozisyon.
- `.env` içine notional/marjin/kaldıraç/pozisyon limiti eklenmez.
- Algo Service POST/GET yanıtlarında doğrudan, `data`, `orders`, `rows` ve `list` şekilleri normalize edilir.
- Stop/TP doğrulaması anlık tek sorgu yerine kademeli tekrar + açık Algo emir fallback ile yapılır.
- İlk dolum sonrası koruma zinciri başarısız olursa rollback başarılı olsa bile `GERCEK_KORUMA_ZINCIRI_BASARISIZ` global bloğu kalıcı olarak açılır; ikinci gerçek giriş mümkün değildir.
- Rollback muhasebesi entry order id ve fill zamanını taşır; giriş+çıkış komisyonları birlikte toplanır.
- Renko/Binance karşılaştırma bilgi satırının her değerlendirmede error loguna tekrarı kaldırıldı.
- Trade Engine matematiği, Entry/Exit Evolution ve öğrenme mantığı değiştirilmedi.

- Kök neden düzeltildi: `futuresGetAlgoOrder` ve `futuresCancelAlgoOrder` çağrıları zorunlu `symbol` ile gönderilir; yalnız `algoId/clientAlgoId` gönderilmez.

- Pozisyon limiti motor parametresi veya runtime kaydı tarafından ezilemez; yürütme katmanı her kontrolde `ayarlar.js` kaynağını okur.
