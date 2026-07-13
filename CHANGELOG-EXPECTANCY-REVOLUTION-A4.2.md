# AGROS Expectancy Revolution A4.2 — Heat Map Data Source Fix

## Düzeltilen kök neden

Ham `signatureMatrixStats` kayıtlarında DNA imzası çoğu zaman obje anahtarında değil `etiket`/`label` alanında bulunuyordu. A4.1 eşleme sırasında teknik obje anahtarını öncelediği için geçerli etikete bakmadan kaydı eşlenemeyen sayıyor, düşük örnekli DNA hücreleri `?` yerine `.` görünüyordu.

## Değişiklikler

- DNA çözümleme sırası `label → etiket → signature → key → rawObjectKey` olarak sağlamlaştırıldı.
- Ham kayıt eşleme sayaçları eklendi: toplam, işlemli, eşlenen ve eşlenemeyen.
- Eşlenemeyen ham kayıt varsa Telegram Heat Map başlığında uyarı gösterilir.
- LONG ve SHORT matris bütünlüğü 256'şar hücre olarak korunur.
- Trade Engine ve otomatik filtreleme değiştirilmedi.
