# Para Makinesi Binance v2.1.11

Bu sürüm, SuperTrend onay periyodunu sniper periyodundan ayırır.

## Varsayılan yapı

- Trend / SuperTrend onayı: `4h`
- Pusu / Bollinger setup: `1h`
- Sniper / canlı tetik ve mum teşhisi: `5m`

## Amaç

8h/1h testinde görülen “SuperTrend dönene kadar hareketin bitmesi” riskini azaltmak için, SuperTrend artık ayrı bir trend/onay katmanı olarak izlenir. 5m sniper ise hassas giriş ve debug teşhisi üretir.

## Not

Strateji mantığı hâlâ hedef kırılımı + SuperTrend yön onayıdır. Kalite motoru ve gecikmeli başabaş koruması korunmuştur.
