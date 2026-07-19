# AGROS v5.0.1 — Binance Network Resilience

- Trade Engine ve strateji kuralları değiştirilmedi.
- Binance mum istekleri sınırlı eşzamanlı havuza alındı (varsayılan 5).
- `socket hang up`, TLS kopması, timeout ve geçici ağ hatalarında kontrollü exponential retry eklendi.
- Pusu ve SuperTrend zamanlayıcılarının üst üste binmesi engellendi.
- Başarısız semboller diğer sembolleri durdurmaz; mevcut son başarılı veri korunur.
- Futures fiyat listesi timeout/retry korumasına alındı.
- Telegram HTTP isteğine 12 saniye timeout eklendi.
- Öğrenilmiş veri ve `data/` içeriği değiştirilmez.
