# v5.5.3-ST2-RENKO-LIVE-DEBUG-SPRINT2

## Kök neden
ST2 başlangıç/tazeleme hattı yalnız `bollingerperiod + 5` (25) adet 15m mum çekiyordu. ATR(14) box size ile bu pencere çoğu sembolde BB(20) için gerekli 20 Renko tuğlasını üretmiyordu. Sonuç: `BB hazır 0`, pattern ve pusu üretimi 0.

## Düzeltmeler
- Yalnız `entryStrategyMode=ST2_RENKO` iken 15m kaynak geçmişi 250 kapanmış muma çıkarıldı.
- Renko kaynak periyodu `renkoKaynakPeriyodu` üzerinden kesinleştirildi.
- BB hazır kontrolü dizi/finite sözleşmesiyle fail-closed yapıldı.
- BB yetersiz ve BB geçersiz ayrı audit red nedenleri oldu.
- Pattern aday sayısı, yeni pattern/pusu sayısı ve Renko min/max tuğla sayısı canlı audite eklendi.
- Süresi dolan pusular `maxPusuBeklemeTugla` ile temizleniyor.
- Aynı kapanmış patternin yeniden tekrar pusu üretmesi engellendi.
- Mirror SHORT referans tuğla eşlemesi id aritmetiği yerine gerçek tail index ile sağlamlaştırıldı.

## Değişmeyenler
- Trade Engine ve pozisyon/exit katmanı değiştirilmedi.
- ST1 modu için mum limiti ve veri hattı aynı kaldı.
- 9 LONG pattern ve mirror SHORT sözleşmesi korundu.

## Test
- `node --check` tüm değişen JS dosyalarında geçti.
- `npm run test:st2-renko` geçti.
- 250 mum sentetik testinde 133 Renko tuğlası ve geçerli BB(20) üretildi.
- `npm run test:st2-identity` geçti.
