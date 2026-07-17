# AGROS v4.3.0 — Final Validation

## Son mimari raporlama düzeltmesi

- Öğrenme havuzu, üst katman sanal testi ve Binance gerçek emir performansı üç ayrı kalıcı kasaya ayrıldı.
- `data/adaptive-league-observation.json` yalnız sanal Premier/Championship testini tutar.
- `data/real-trading-performance.json` yalnız Binance'e gerçekten iletilen emirleri tutar.
- Her pozisyon açılışta performans katmanı kimliği alır; kapanış sonucu aynı katmana yazılır.
- Gerçek emir raporu: açılan, aktif, kapanan, başarı, net, komisyon, PF ve expectancy gösterir.
- Canlı Portföy SANAL modda yalnız Premier/Championship sanal test pozisyonlarını gösterir.
- Canlı Portföy BINANCE modunda yalnız gerçek Binance pozisyonlarını gösterir.
- Alt lig/öğrenme pozisyonları üst katman aktif sayısına ve gerçek emir performansına karışmaz.
- Eski genel muhasebenin son kapanan işlemleri üst katman listesine taşınmaz.

Trade Engine, giriş şartları, lig kararları, exit uygulaması ve risk boyutlandırması değiştirilmedi.
