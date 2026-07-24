# AGROS ST2 v5.5.2 — Renko 9 Pattern + Runtime Repair

## Giriş sözleşmesi
- 15m ATR(14) Renko üzerinde son kapanmış tuğla dizisi değerlendirilir.
- LONG için 8 adet dört-tuğlalı kombinasyon iki aileye ayrıldı.
- Özel `RGGRR` beş-tuğlalı yapı ayrı `L09 / L3` DNA etiketiyle korunur.
- SHORT desenleri renk ve HIGH/LOW aynası olarak otomatik üretilir.
- Her pattern referans HIGH/LOW + `renkoTetikYuzdesi` toleransı kullanır.
- Giriş anında 1m ATR Renko SuperTrend ve canlı fiyat tetiği aynı anda geçerli olmalıdır.

## Onarımlar
- Eski genel Bollinger pusu mantığının pattern tanımından bağımsız pusu açması kaldırıldı.
- Pattern oluşmadan pusu kurulması engellendi.
- Eski dönüş-tuğlası zorunluluğu kaldırıldı; bu zorunluluk yeni sözleşmeyle çelişiyordu.
- Yeniden üretilen Renko ID'lerine dayalı kırılgan `sonIslenenTugla` akışı kaldırıldı.
- Pattern imzası; renk, kapanış zamanı ve fiyatla kararlı biçimde oluşturuldu.
- Eski SuperTrend/fiyat onayının latch edilerek daha sonra yanlış giriş üretmesi engellendi.
- LAB/Blackbox giriş snapshot'ına Pattern ID, aile, kod, uzunluk, referans tipi ve seviye eklendi.
- Eksik state dizilerinde runtime çökmesini önleyen güvenli varsayılanlar eklendi.

## Doğrulama
- 8 LONG dört-tuğlalı desenin tamamı test edildi.
- Özel 5'li L09 testi eklendi.
- Aynalanmış SHORT testi eklendi.
- Toleranslı LONG/SHORT tetik fiyatı doğrulandı.
