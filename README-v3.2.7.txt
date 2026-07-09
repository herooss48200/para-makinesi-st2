# Para Makinesi Binance v3.2.7 - Confidence Engine

Bu sürüm v3.2.6 Triple DNA Lab üzerine inşa edildi.

Amaç:
- Feature Importance Lab, Pair Importance Lab ve Triple DNA Lab sonuçlarını tek matematiksel güven puanında birleştirmek.
- Her DNA kaynağı için TP/SL/BE, başarı oranı, net PNL, Profit Factor, DNA ayırt ediciliği ve veri ağırlığını birlikte değerlendirmek.
- Yüksek güven DNA adaylarını, düşük güven/riskli DNA adaylarını ve ileride Watch Mode için izlenecek adayları Telegram raporuna eklemek.
- Argos Dev Console için data/agros-confidence-engine.json ve data/agros-confidence-engine.csv çıktısı üretmek.

Korunan kurallar:
- Trade Engine'e dokunulmadı.
- Emir açma, stop, TP, BE, pusu ve sniper mantığı değiştirilmedi.
- Bu sürüm sadece Intelligence Layer / raporlama / analiz katmanıdır.
- .env, .git, node_modules ve data klasörü pakete dahil edilmez.

Yeni dosya:
- 12_confidence_engine.js

Güncellenen dosyalar:
- 8_blackbox.js
- ayarlar.js
- package.json
- versiyon.js

Standart kontrol:
- npm run check
