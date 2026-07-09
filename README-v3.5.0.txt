Para Makinesi Binance v3.5.0 - SIMILARITY LEARNING CORE
Tarih: 09.07.2026

Amaç:
AGROS'un geçmiş başarılı ve riskli kümeleri sadece listelemesini değil,
gelecekteki işlemler için kullanılabilecek bir benzerlik öğrenme çekirdeğine çevirmesini sağlar.

Yeni modül:
- 18_similarity_learning_core.js

Ne yapar?
- Cluster Intelligence karar adaylarını okur.
- Başarılı geçmiş benzerlik çekirdeği üretir.
- Riskli geçmiş benzerlik çekirdeği üretir.
- Evidence Weight ve Learning Score hesaplar.
- Pozitif/Risk güçlerini karşılaştırır.
- Intelligence Console içine Similarity Learning bölümünü ekler.
- data/agros-similarity-learning-core.json ve .csv çıktısı üretir.

Önemli güvenlik notu:
- Trade Engine'e dokunmaz.
- Emir açmaz.
- Emir kapatmaz.
- Stop/TP değiştirmez.
- Sadece gözlem, öğrenme ve raporlama katmanıdır.

Nihai hedefe katkısı:
Bu sürüm, ileride yeni bir işlem açıldığında
"Bu işleme geçmişte en çok benzeyen başarılı/riskli kümeler hangileri?"
sorusunun temel veri modelini hazırlar.
