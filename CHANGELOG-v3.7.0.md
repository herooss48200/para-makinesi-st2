# v3.7.0 — Volatility Behavior Engine

## Yeni
- `29_volatility_behavior_engine.js`
- DNA bazında kaydedilmiş PnL/fiyat yolu oynaklık analizi
- Gerçekleşen volatilite, ortalama/maksimum yol adımı
- Erken/orta/geç dönem volatilite karşılaştırması
- Genişleme, sıkışma-sonrası-genişleme, yön değişimi ve yol verimliliği
- Gürültü ve yüksek volatilitede kâr geri-verme davranışı
- Volatility Character sınıflandırması

## Behavior Profile
- Profit + Time + Trend + Volatility tek DNA kartında birleştirildi.
- Telegram kapanış raporunda birleşik profil her geçerli kapanışta görünür.
- Volatility verisi yetersizse örnek sayısı açıkça gösterilir.

## Migration
- `npm run migrate:exit-replay` eski replay kayıtlarından Profit, Time, Trend ve Volatility modellerini yeniden oluşturur.
- Migration öncesi state/model yedekleme davranışı korunur.

## Güvenlik
- Trade Engine, giriş, TP, SL, trailing stop ve kademe mantığı değiştirilmedi.
- Restart Gap işlemleri öğrenmeye dahil edilmez.
- ATR/OHLC serisi olmayan kayıtlarda sahte ATR veya Bollinger değeri üretilmez.
