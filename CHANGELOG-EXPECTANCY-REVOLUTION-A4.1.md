# AGROS Expectancy Revolution — A4.1 Heat Map Coverage Fix

## Düzeltme

- DNA Heat Map artık yalnızca minimum örneği geçen `Confidence Engine v2` satırlarını değil, ham `blackboxOzet.signatureMatrixStats` kayıtlarını da okur.
- Minimum örnek eşiğinin altında kalan gözlenmiş DNA'lar `?` olarak gösterilir.
- Hiç gözlenmemiş DNA'lar `.` olarak kalır.
- Yeterli örnekli hücreler Confidence Engine v2 metrikleriyle yeniden zenginleştirilir.
- LONG ve SHORT haritalarında `+ + - + ~ + ? + . = 256` hücre bütünlüğü korunur.
- Rapor başlığına gözlenen, hazır ve düşük örnekli DNA toplamları eklendi.

## Güvenlik

- Trade Engine değiştirilmedi.
- Otomatik filtre veya emir davranışı eklenmedi.
- Yalnızca analiz/görselleştirme katmanı güncellendi.
