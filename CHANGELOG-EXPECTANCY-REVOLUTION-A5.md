# AGROS v3.7.0 — A5 Direction Intelligence Lab

- `37_direction_intelligence_lab.js` eklendi.
- Aynı BTC 4-bit + Coin 4-bit koşulundaki LONG ve SHORT DNA kayıtları birebir eşleştirildi.
- Yön üstünlüğü win rate yerine expectancy, Profit Factor, net/işlem ve konservatif win-rate farkı ile ölçülür.
- Az örnekli eşleşmeler güven katsayısıyla baskılanır; iki yönde de minimum örnek koşulu aranır.
- Genel LONG/SHORT performans özeti, hazır eşleşme sayısı, LONG üstün, SHORT üstün ve nötr DNA sayıları üretilir.
- A5 modeli `20_learning_validation.js` içine analiz çıktısı olarak bağlandı.
- A4.4 sade canlı portföy paneli korunur; A5 canlı portföy mesajını şişirmez.
- Trade Engine, giriş, çıkış, pozisyon ve emir mantığı değiştirilmedi.
