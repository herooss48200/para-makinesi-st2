# Para Makinesi Binance - AWS Stable v2.1.10

## Amaç

Bu sürüm, 1h pusu + 5m sniper test düzeninde başabaş stop davranışını iyileştirir.

## Ana değişiklikler

- Varsayılan zaman dilimi: `1h` pusu + `5m` sniper.
- KADEME stop modunda eski davranış olan “1. kademe görülür görülmez SL girişe çekilir” mantığı yumuşatıldı.
- Başabaş artık `breakevenTetikKademe` ayarından sonra devreye girer. Varsayılan: 2. kademe.
- Stop kademeleri `kademeStopGeridenKademe` ile geriden takip eder. Varsayılan: 2 kademe.
- İlk BE için küçük tampon eklendi: `breakevenTamponYuzde`. Varsayılan: %0.03.
- Pusu mum teşhisi başlığı artık sabit `15m` değil, seçili `pusuPeriyodu` değerini gösterir.

## Neden?

Canlı gözlemde fiyat ilk kâr kademesini gördükten sonra SL hemen girişe çekildiğinde, normal geri çekilme pozisyonu başabaş/nötr kapatabiliyordu. Bu sürüm pozisyona daha fazla nefes vermek için BE'yi geciktirir.

## Önemli

Strateji giriş mantığı değiştirilmedi. Pusu, sniper, SuperTrend ve kalite motoru korunmuştur. Bu sürüm sadece stop yönetimini daha sakin hale getirir.
