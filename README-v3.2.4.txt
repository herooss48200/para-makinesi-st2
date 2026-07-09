AGROS v3.2.4 FEATURE IMPORTANCE LAB
Tarih: 09.07.2026

Amaç:
Trade Engine'e dokunmadan, mevcut blackboxOzet verisi üzerinden tek tek özelliklerin kazanan/kaybeden DNA içindeki ayırt ediciliğini ölçmek.

Eklenen dosya:
- 9_feature_importance_lab.js

Güncellenen dosyalar:
- 8_blackbox.js
- ayarlar.js
- versiyon.js

Argos Dev Console uyumu:
Feature Importance Lab her BlackBox rapor üretiminde aşağıdaki dosyaları üretir:
- data/agros-feature-importance-lab.json
- data/agros-feature-importance-lab.csv

Bu dosyalar Console tarafından doğrudan okunabilir şekilde tasarlandı.
JSON içinde:
- lab
- surum
- global
- grupOzetleri
- tumOzellikler
- yeterliOzellikler
- gucluOzellikler
- riskliOzellikler
- ayirtEdiciOzellikler
alanları bulunur.

Ölçülen alanlar:
- TP oranı
- SL oranı
- BE oranı
- Net PNL
- Ortalama net
- Profit Factor
- Kazanan DNA frekansı
- Kaybeden DNA frekansı
- Ayırt edicilik
- Importance Score
- Güven seviyesi

Mimari karar:
- BlackBox veri toplamaya devam eder.
- Feature Importance yeni veri üretmez, mevcut blackboxOzet verisini analiz eder.
- Emir motoruna müdahale yoktur.
- Watch Mode ve ilerideki Argos Dev Console ekranları için makine okunabilir model üretir.

Kontrol:
node --check tüm JS dosyalarında başarılı.
