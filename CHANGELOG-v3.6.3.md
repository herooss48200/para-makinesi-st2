# v3.6.3 - Exit Evolution Time Path

- Trade Engine değiştirilmeden açık pozisyonların örneklenmiş fiyat yolculuğu kaydedilmeye başlandı.
- Sabit TP seviyeleri `%0.40, %0.60, %0.80, %1.00, %1.50` olarak Exit Evolution yarışına eklendi.
- `5, 10, 15, 20, 30, 45, 60, 90, 120` dakika süre bazlı exit modelleri eklendi.
- MFE kâr koruma `%50, %60, %70, %80, %90` modelleri kaydedilmiş fiyat yolu üzerinden replay edilir hale getirildi.
- DNA bazlı exit sıralaması ve DNA zaman davranışı checkpoint modeli eklendi.
- Her checkpoint için ortalama net, MFE, MAE ve kâr geri verme ölçümleri üretildi.
- ATR, Trend, Dinamik, Hibrit ve alternatif kademe modelleri veri gereksinimleri tamamlanana kadar açıkça `pendingModels` olarak işaretlendi.
- Restart Gap karantinası korunmuştur; karantinadaki işlemler öğrenme verisine alınmaz.
