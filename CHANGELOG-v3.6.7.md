# v3.6.7 — DNA Time Behavior Engine

## Amaç
Kör bir “N. dakikada çık” kuralı üretmek yerine, her DNA'nın zaman içindeki davranışını öğrenmek.

## Eklenenler
- `26_time_behavior_engine.js`
- DNA bazında ortalama tepe kâr zamanı
- İlk pozitif bölgeye geçiş süresi
- 5/10/15/20/30/45/60/90/120 dakika davranış kontrol noktaları
- Dakika bazında ortalama PNL, MFE, MAE ve giveback
- Kontrol noktasından sonra yeni zirve olasılığı
- Kontrol noktasından sonra kâr geri-verme olasılığı
- Fırsat penceresi ve yorgunluk başlangıcı
- Hızlı / orta hızlı / yavaş / uzun soluklu DNA karakteri
- Telegram kapanış ve periyodik Exit Evolution raporuna Time Behavior özeti
- Tarihsel replay migration desteği

## Güvenlik
- Trade Engine değiştirilmedi.
- Canlı TP, SL, stop veya emir kararları değiştirilmedi.
- Time Behavior yalnızca kapanmış işlemlerin kaydedilmiş fiyat yolunu analiz eder.
