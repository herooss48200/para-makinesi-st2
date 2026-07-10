# Para Makinesi Binance v3.8.0 — Kademe Behavior Engine

## Eklenenler

- `30_ladder_behavior_engine.js` eklendi.
- Her DNA için gerçekleşmiş `execution.kademeHistory` yolu analiz edilir.
- Ortalama maksimum kademe ve kademe dağılımı hesaplanır.
- Her kademeye ulaşma oranı ile kademe sonrası TP/SL/BE ve kârlılık oranı hesaplanır.
- Kademeye ulaşma süresi ve kademeler arası ortalama geçiş süreleri öğrenilir.
- Kademe sonrası daha yukarı ilerleme ve geri dönüş oranları ölçülür.
- Yeterli örnek oluştuğunda en güvenli kâr kademesi belirlenir.
- DNA kademe karakterleri üretilir: erken sönen, istikrarlı tırmanan, uzun kademe koşucusu, kademe sonrası geri veren ve dengeli/değişken karakterler.

## Entegrasyon

- Exit Replay canlı öğrenme özetine `dnaLadderBehavior` eklendi.
- Tarihsel Exit Replay migration akışına Kademe Behavior modeli eklendi.
- BLACKBOX kapanış raporuna `DNA KADEME DAVRANIŞI` bölümü eklendi.
- Birleşik DNA Behavior Profile artık Profit, Time, Trend, Volatility ve Kademe karakterlerini birlikte gösterir.

## Veri ve güvenlik ilkeleri

- Trade Engine, pozisyon açma, TP, SL ve stop mantığı değiştirilmedi.
- Motor yalnızca gerçekleşmiş `kademeHistory` kayıtlarını kullanır; eksik geçmiş için kademe tahmini yapmaz.
- Restart Gap işlemlerinin mevcut öğrenme dışı bırakılma politikası korunur.
- Minimum varsayılan güven eşiği DNA başına 10 nitelikli kademe yoludur.
