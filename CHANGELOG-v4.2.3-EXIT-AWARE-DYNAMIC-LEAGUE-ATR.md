# AGROS v4.2.3 — Exit-Aware Dynamic League + ATR Trailing

## Değişiklikler
- İşlem fiyat yoluna gerçek ATR yüzdesi kaydı sağlamlaştırıldı.
- Mum verisi nesne ve Binance dizi biçiminde desteklendi.
- Kısa veri boşlukları için son geçerli ATR önbelleği eklendi.
- ATR verisi bulunmayan işlemler ATR model doğrulama örneği sayılmıyor.
- ATR Trailing modelleri shadow exit yarışında çalışmaya devam ediyor.
- Dynamic Exit modeli ATR veri uygunluğunu dikkate alıyor.
- Lig değerlendirmesi doğrulanmış `DNA + en iyi Exit` çiftinin Exp, PF ve Net sonuçlarına bağlandı.
- Ham kademe sonucu negatif olan DNA, doğrulanmış exit ile pozitif hale gelirse Premier'e yükselebilir.
- Ham DNA metrikleri korunur; `pairMetrics` ve effective metrikler ayrıca saklanır.
- Gerçek emir hazırlık kapısı `DNA + Exit` çiftinin örnek, Exp, PF ve Net değerlerini kontrol eder.
- Eski işlemler ve öğrenme dosyaları silinmez veya sıfırlanmaz.
- Trade Engine giriş mantığı değiştirilmedi.

## Doğrulama
- Tüm JavaScript dosyaları `npm run check` kontrolünden geçti.
- ATR trailing sentetik path testi geçti.
- Negatif ham DNA + pozitif doğrulanmış ATR Exit ile Premier terfi testi geçti.
