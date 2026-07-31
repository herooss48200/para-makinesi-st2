# CHANGELOG — AGROS ST2 v6.9.2

## Fixed
- v6.9.1 kalibrasyon aramasında aynı dot-product ve kohort quantile hesaplarının yüz binlerce kez tekrarlanması kaldırıldı.
- Bütün uygun adayların bellekte tutulması yerine yalnız en iyi 10 aday saklanıyor.
- Kalibrasyon uygulanmadan `CALIBRATED` yazan yanıltıcı sürüm etiketi `CALIBRATION-READY` olarak düzeltildi.

## Added
- `PRECOMPUTED_SCORE_MATRIX` hızlı arama motoru.
- Eşik sonucu önbelleği.
- Yüzde ve süre içeren görünür CLI ilerlemesi.
- 392.000 model üretim yükü regresyon/performance testi.

## Unchanged
- 1.400 ağırlık adayı.
- 280 politika adayı.
- 70/30 kronolojik train/validation.
- Fail-closed apply koşulları.
- Trade Engine ve öğrenme kayıtları.
