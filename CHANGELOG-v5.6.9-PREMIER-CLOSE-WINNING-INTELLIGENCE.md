# AGROS ST2 v5.6.9 — Premier Close & Winning Intelligence

## Çözülen dört konu

1. Premier kapanış kaydı
   - `labPremierObservation` eksik olsa bile açılışta dondurulan `labPremierDecision` ana Premier olduğunu kanıtlıyorsa kapanış kaybolmaz.
   - Kapanış anında kanonik gözlem geri üretilir.
   - Deterministik kapanış kimliğiyle duplicate kapanış engellenir.

2. K1 canlı görünümü
   - Satırdaki zarar artık `Anlık` olarak açıkça etiketlenir.
   - K1 için `K1 koruma aktif` yazılır.
   - Böylece anlık fiyat zararı ile girişe taşınmış stop birbirine karıştırılmaz.
   - Trade Engine, stop ve K1 çalışma mantığı değiştirilmemiştir.

3. LONG başarı desteği ve BTC/Coin ilişkisi
   - Yeni `75_st2_winning_intelligence.js`, bilimsel Entry Evolution ledger'ını okur.
   - LONG/SHORT için N, kazanma/kaybetme, WR, Net, PF, Expectancy, ortalama kazanç ve ortalama kayıp üretir.
   - Pattern ve BTC/Coin açılış imzası bazında pozitif ilişkileri raporlar.

4. SHORT yüksek WR fakat negatif Net
   - Ortalama kazanç ve ortalama kayıp birlikte gösterilir.
   - Kazanan sayısı yüksek olduğu halde Net negatifse rapor ekonomik dengesizliği açıkça işaretler.

## Güvenlik
- ST1 değiştirilmedi.
- Trade Engine giriş/çıkış kapıları değiştirilmedi.
- Yeni Winning Intelligence yalnız analiz/raporlama katmanıdır.
