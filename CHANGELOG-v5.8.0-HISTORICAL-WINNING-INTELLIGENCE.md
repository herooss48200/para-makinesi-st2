# AGROS ST2 v5.8.0 — Historical Winning Intelligence

## Temel
- v5.7.0-fix.1 CLI bayrak düzeltmesi korunur (`--report`, `--reset`).
- Tarihsel replay SHADOW kalır; Trade Engine, Premier ve canlı Entry Evolution değişmez.

## Yeni öğrenme
Her kapanan tarihsel aday için sinyal anındaki bağlam çıkarılır:
- Renko son 6 tuğla dizisi
- Bollinger bölgesi ve bant genişliği
- ATR rejimi
- Hacim rejimi
- 5 mum momentum ve 20 mum trend
- UTC seansı
- MFE, MAE ve işlem süresi

Tekil özellikler ve ikili kombinasyonlar; N, WR, PF, Net ve Expectancy ile biriktirilir. En iyi tarihsel giriş için raporda kazandıran ve kaybettiren ortak koşullar gösterilir. Bulgular korelasyon/ortaklık analizidir; otomatik nedensellik veya canlı emir yetkisi vermez.

## Doğrulama
- `npm run verify:v580`
- Eski v5.6.10, v5.6.9 ve v5.6.7 regresyonları korunur.
