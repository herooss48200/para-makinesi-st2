# AGROS v3.7 — Expectancy Revolution A6

## DNA Evolution Engine

- `data/blackbox-snapshots.jsonl` içindeki gerçek kapanış sırasını okur.
- Her yönlü DNA için rolling 10/20/50/100 performansı hesaplar.
- Son 20 işlem ile önceki 20 işlemi karşılaştırarak momentum üretir.
- Güçleniyor, hızla güçleniyor, stabil, zayıflıyor ve çöküyor durumlarını sınıflandırır.
- DNA yaşı, yaşam evresi, istikrar skoru ve ölüm riski hesaplar.
- Learning Validation Telegram raporuna kısa Evolution özeti ekler.
- Trade Engine, emir açma, pozisyon kapatma ve otomatik filtreleme davranışı değiştirilmemiştir.
