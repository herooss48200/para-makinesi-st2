AGROS v3.5.3 - LEARNING VALIDATION

Amaç:
- Trade Engine'e dokunmadan öğrenmenin doğrulanması.
- Canlı portföy raporuna Floating PNL, Gerçek Net, Profit Factor, Expectancy ve Long/Short expectancy eklenmesi.
- Kapanmış işlemlerden ortalama TP, ortalama SL, ortalama BE, Payoff Ratio ve Edge hesaplanması.
- BlackBox snapshot verisinden Signature/DNA başarı-risk doğrulaması yapılması.
- Konsol çıktıları:
  data/agros-learning-validation.json
  data/agros-learning-validation-signatures.csv

Eklenen dosya:
- 20_learning_validation.js

Güncellenen dosyalar:
- 2_rapor.js
- 14_intelligence_console.js
- ayarlar.js
- package.json
- versiyon.js

Güvenlik Notu:
- Emir açma/kapatma mantığı değiştirilmedi.
- Stop/TP/trailing/miktar hesaplama motoruna dokunulmadı.
- Modül sadece okuma, analiz, rapor ve data export yapar.
