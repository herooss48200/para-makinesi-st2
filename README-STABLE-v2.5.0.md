# Para Makinesi Binance v2.5.0 BLACKBOX-STATS-ENGINE

Bu sürüm strateji/emir yönü revizyonu yapmaz. Amaç doğru ölçüm ve otomatik istatistik toplamaktır.

## Eklenenler
- Tam BTC/Coin SuperTrend kombinasyon istatistiği: BTC 5m/15m/1h/4h + Coin 5m/15m/1h/4h + işlem yönü + BB bölgesi.
- Canlı rapora en karlı tam kombinasyonlar eklendi.
- Canlı rapora BTC timeframe -> işlem yönü başarı istatistiği eklendi.
- Canlı rapora Coin timeframe -> işlem yönü başarı istatistiği eklendi.
- BB + işlem yönü başarı/net istatistiği eklendi.
- BlackBox özetleri kalıcı hafızaya yazılır; restart sonrası kaybolmaz.
- v2.4.1 duplicate close ve LONG Telegram güvenlik düzeltmeleri korunmuştur.

## Not
Temiz ölçüm için yerelde ve AWS üzerinde eski data klasörü yedeklenip temizlenmelidir.
