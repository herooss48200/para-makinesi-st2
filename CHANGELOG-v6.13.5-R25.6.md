# AGROS ST2 v6.13.5-R25.6 — STARTUP QUEUE-BOUND REPAIR

## Kök neden
R25.5 dış sembol deadline'ı, Binance network kuyruğuna eklenme anında başlıyordu. Kuyrukta deadline'a uğrayan promise reddediliyor fakat alttaki queued request yaşamaya devam ediyordu. Worker sonraki sembole geçtikçe stale istekler birikiyor; canlıda queue 200+ ve ilk tur Hata 394 görülüyordu.

## Düzeltme
- Startup 15m ve 1m çağrılarındaki dış `startupDeadlineIle(...)` kaldırıldı.
- Timeout yalnız network katmanında HTTP isteği gerçekten ACTIVE olduktan sonra uygulanır.
- 8 startup worker / 4 shared network concurrency korunur.
- İlk tur retry=0 ve 7sn aktif HTTP timeout korunur.
- Gerçek aktif request hatası 15m repair veya 1m 240/480 repair'e bırakılır.
- 200-core readiness ve restart protection-extra ayrımı korunur.
- R25.3 N5 Premier recovery, 20 slot x 20USDT, R24.2 yüzde-stop ekonomisi değişmedi.
- MACD R25.1 SHADOW-only kalır; giriş/stop yetkisi YOK.

## Canlı başarı kriteri
- Queue startup boyunca runaway yapmamalı; 8 worker x 2 request ve 4 aktif ağ slotu ile bekleyen iş doğal olarak sınırlı kalmalı.
- `Mum` ve `1m Veri` gerçek cache sayıları ilk turda artmalı.
- `Hata` her işlenen sembolde +2 biçiminde patlamamalı.
- Repair yalnız gerçek aktif request başarısızlıklarını yeniden denemeli.
- Entry Gate, gerçek 200-core readiness >= %95 olduğunda READY olmalı.
