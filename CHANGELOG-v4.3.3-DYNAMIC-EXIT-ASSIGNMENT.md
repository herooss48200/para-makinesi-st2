# AGROS v4.3.3 — Dynamic Exit Assignment

- Exit bir DNA'ya ömür boyu sabitlenmez; dinamik model ve League her 25 kapanışlık transfer penceresinde yeniden değerlendirmeye devam eder.
- Replay kısa imzaları (`L_B0001_C0000_ORTA_ALT`) ile League temel anahtarları (`YON=LONG|BTC=0001|COIN=0000`) aynı DNA ailesinde güvenli biçimde eşleştirilir.
- Dinamik model hem detaylı DNA exit profillerini hem temel DNA ailesi exit profillerini üretir.
- Pozisyon açılırken önce detaylı DNA+rejim, yeterli kanıt yoksa temel DNA ailesi fallback'i kullanılır.
- Seçilen plan yalnız açılmış pozisyon için dondurulur; sonraki transfer dönemlerinde yeni işlemler için exit değişebilir.
- Eski dynamic exit modeli başlangıçta algılanırsa bir kez güvenli biçimde v4.3.3 anahtar modeline taşınır; sonrasında güncelleme yine kontrollü 25 kapanış aralığındadır.
