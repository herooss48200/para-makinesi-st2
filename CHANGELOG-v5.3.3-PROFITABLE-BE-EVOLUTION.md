# AGROS ST1 v5.3.3 — Profitable BE Evolution

- BE öğrenme ve otomatik atama eşiği N=50'den N=5'e indirildi.
- Her LAB/DNA için BE+ seviyeleri bağımsız yarışır: %0.08, %0.12, %0.16, %0.20, %0.25, %0.30.
- Seçim komisyon sonrası Net > 0, PF > 1 ve Expectancy > 0 koşullarına bağlıdır.
- Mevcut +%0.12 yalnız başlangıç/fallback seviyesidir; daha güçlü aday kanıtlanınca yeni pozisyona uygulanır.
- Açık pozisyonun BE+ seviyesi geriye dönük değiştirilmez.
- BE+ değişim geçmişi eski/yeni seviye, N, Net, PF ve Expectancy ile kalıcı tutulur.
- Stop N=5, yedi seviyeli stop kataloğu ve Restart-GAP karantinası korunmuştur.
