# AGROS v5.0.7 — Learning Telemetry Consistency

- LAB Premier kartına Kârlı/TP, Zararlı/SL, BE, brüt kâr ve brüt zarar adetleri eklendi.
- Öğrenme kartı artık eski genel açılış sayacını “yeni öğrenme” diye göstermiyor.
- Yeni öğrenme toplamı kesin defterden Premier + Gölge olarak hesaplanıyor.
- Premier ve gölge açılış/kapanış/aktif sayıları ayrı gösteriliyor.
- Migration/Restart GAP bilgileri ayrı muhasebe bölümüne taşındı ve öğrenme toplamından çıkarıldı.
- GAP kapanışlarının Premier/Gölge bilimsel kanıt sayaçlarına yazılması engellendi.
- Aktif ve takip işareti kalıcı Premier pozisyonlarının restart sonrası GAP’a dönüşmediğini doğrulayan regresyon testi eklendi.
- Trade Engine değiştirilmedi; öğrenilmiş tarihsel veri korunur.
