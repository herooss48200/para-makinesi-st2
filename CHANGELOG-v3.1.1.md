# ParaMakinesiBinance v3.1.1 Live Dashboard Fix

## Değişen dosya
- `2_rapor.js`

## Amaç
Telegram canlı portföy panelinde açık pozisyonların `BILINMIYOR` görünmesini düzeltmek.

## Düzeltmeler
- Açık pozisyon sembol alanına `sym` desteği eklendi.
- Korunan kâr alanına `korunanKarYuzdesi` desteği eklendi.
- Eski güvenli kısa canlı rapor mimarisi korundu.
- Strategy Lab ve BlackBox canlı rapora eklenmiyor; ayrı rapor olarak kalıyor.

## Beklenen sonuç
Canlı portföy panelinde `BILINMIYOR` yerine `ETCUSDT`, `PEOPLEUSDT` gibi gerçek semboller görünür.
