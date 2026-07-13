# AGROS Expectancy Revolution — Aşama 2

## DNA Filter Simulator

Yeni bağımsız `34_dna_filter_simulator.js` analiz modülü eklendi.

### Yaptıkları
- Her DNA için “bu DNA hiç açılmasaydı ne olurdu?” senaryosu üretir.
- Tekli filtre adaylarını Net PNL ve Expectancy iyileşmesine göre sıralar.
- En riskli adayların kümülatif çıkarılmasını simüle eder.
- Yeni Net, Expectancy, Profit Factor ve işlem azalmasını raporlar.
- Filtrelenen DNA içindeki kaçırılacak brüt kârı ve önlenecek brüt zararı ayrıca hesaplar.

### Güvenlik
- Trade Engine değiştirilmedi.
- Otomatik filtre uygulanmadı.
- Emir açma, kapama, yön, TP, SL veya pozisyon büyüklüğü değiştirilmedi.
- Yalnızca `blackboxOzet.signatureMatrixStats` geçmiş kapanış verisi okunur.
