# AGROS ST2 v6.10.6 — MANUAL CLOSE AUTO-REARM & PROFIT ECONOMY

Tarih: 01.08.2026

## Amaç

Bu sürüm yeni özellik eklemez. İki üretim sorununu düzeltir:

1. Binance ekranından manuel/harici kapatılan gerçek pozisyonun hesap-geneli gerçek emir motorunu kilitlemesi.
2. Güvenli kâr başlangıcından sonra ATR/MFE stopunun küçük hareketi aşırı sıkı koruyup uzun kazanan üretmesini engellemesi.

## Gerçek emir düzeltmesi

- `MANUAL_EXTERNAL_CLOSE` artık `MANUAL_EXTERNAL_CLOSE_REARM_REQUIRED` global blok oluşturmaz.
- Manuel kapanış; fill, komisyon ve net PNL ile mutabakat edildikten sonra ilgili kalıcı kayıt `CLOSED` olur.
- Koruma emirleri temizlenir ve gerçek pozisyon slotu restart/disarm gerektirmeden yeniden kullanılabilir.
- Aynı sembol/yön için mevcut yerel `manualCloseLocks` cooldown koruması korunur; diğer semboller ve hesap-geneli gerçek emir motoru bloke edilmez.
- v6.10.3 state dosyasından kalan legacy manuel rearm kilidi, kapanan sembol Binance'te artık açık değilse otomatik temizlenir. Diğer açık gerçek pozisyonlar bu temizliği engellemez.
- Diğer gerçek güvenlik global blokları fail-closed davranışını aynen korur.

## Kâr ekonomisi düzeltmesi

- Güvenli kâr tabanı `+%0.15` korunur.
- Takeover sonrası ATR ve MFE, hareket runner seviyesine ulaşmadan stopu sıkılaştırmaz.
- Runner aktivasyonu varsayılan olarak takeover eşiğinin `2.00×` seviyesidir.
- Eski `ATR 1.05× / MFE %87` benzeri aşırı sıkı profiller güvenli ekonomi profiline migrate edilir.
- ATR alt sınırı `1.25×`, MFE capture üst sınırı `%70` olarak korunur.
- ATR stopu, küçük ATR nedeniyle peak kârın `%70`inden daha fazlasını kilitleyemez.
- Replay seçimi brüt kapanış yerine round-trip komisyon sonrası net PNL ile değerlendirilir.
- Online profil en az `N5`, pozitif Net, pozitif Expectancy ve `PF >= 1.00` olmadan canlıya atanmaz.
- Seçim skoru MFE capture yüzdesi yerine net expectancy, ortalama kazanan, payoff ve PF'yi önceler.
- Ekonomik kanıt yoksa işlem açılması engellenmez; güvenli varsayılan exit profili kullanılır.

## Korunan alanlar

- Trade Engine giriş matematiği değiştirilmedi.
- Renko pusu şartları değiştirilmedi.
- Başlangıç SL matematiği değiştirilmedi.
- Gerçek emir miktarı, kaldıraç ve pozisyon limiti değiştirilmedi.
- Entry Evolution ve Premier Score matematiği değiştirilmedi.
- State, ledger ve muhasebe geçmişi sıfırlanmaz.

## Değişen kaynaklar

- `74_st2_renko_exit_evolution.js`
- `85_st2_real_order_execution.js`
- `ayarlar.js`
- `versiyon.js`
- `package.json`
- `package-lock.json`
- `test_v672_single_delivery_safe_exit.js`
- `test_v6103_manual_close_shadow_safe_trailing.js`
- `test_v6105_active_exit_report_reconciliation.js`
- `test_v6106_manual_close_auto_rearm_profit_economy.js`
