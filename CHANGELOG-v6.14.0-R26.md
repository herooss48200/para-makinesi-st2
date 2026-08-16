# AGROS ST2 v6.14.0-R26 — CORE ONLY

## Amaç
Canlı strateji dışında kalan tarihsel deney, shadow, replay ve legacy runtime yollarını fiziksel olarak kaldırmak; startup sırasında CPU'yu yalnız Renko veri hazırlığı ve açık gerçek pozisyon korumasına ayırmak.

## Kanıtlanan kök neden
Aynı AWS üzerinde dedicated KLINE transport ayrı Node processinde 8/8 başarılı ve toplam ~1.12 sn iken ana PM2 bot processi ~%115 CPU kullanıyordu. Network boşken FUTURES_PRICES watchdog ~21 sn gecikiyordu. Bu nedenle sorun Binance/AWS ağı değil, şişmiş ana runtime/event-loop yükü olarak ele alındı.

## R26 değişiklikleri
- Canlı dependency graph 35 JS'e indirildi.
- 160 eski JS explicit prune listesine alındı.
- ayarlar.js yalnız çekirdeğin okuduğu ayarlara indirildi.
- Warmup READY olana kadar ana loop tarama yapmaz; gerçek pozisyon varsa yalnız seyrek koruma çalışır.
- Entry Evolution yalnız mevcut yüzde-stop ekonomisiyle aday giriş mesafelerini replay eder.
- Premier score eski exit/takeover state'ini okumaz.
- N5 canlı ekonomi ayrı `62_n5_premier_economy.js` çekirdeğine indirildi.
- Eski Premier/Shadow/GAP accounting continuity runtime kaldırıldı.
- Direct/Confirmed, Premier/N5, 20x20 ve stop ekonomisi korunur.

## Güvenlik
Yeni gerçek emir, exchange reconciliation ve network fiyat doğrulaması taze değilse fail-closed kalır. Prune script data/ledger/.env/log dosyalarına dokunmaz.
