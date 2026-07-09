# v3.5.2 POSITION SIZING AUDIT

Tarih: 09.07.2026

Bu sürüm, BTCUSDT gibi fiyatı yüksek sembollerde emir miktarının neden minimum şartların altına düştüğünü tahminle değil, hesap zinciriyle görünür hale getirir.

## Eklenen modül

- `19_position_sizing_audit.js`

## Amaç

AGROS artık miktar reddinde şu zinciri raporlar:

- Ayrılan marjin
- Kaldıraç
- Ayrılan notional
- Canlı fiyat
- Raw quantity
- Step size
- Güvenli/kliplenmiş quantity
- MinQty
- MinNotional
- MinQty'nin gerektirdiği yaklaşık notional
- Gerekli marjin
- Eksik marjin
- Red sebebi

## Önemli davranış

- Trade Engine giriş stratejisine dokunulmadı.
- Risk otomatik büyütülmedi.
- Minimumu karşılamayan emir açılmaz.
- Pusu temizlenir.
- Hata spamı yerine 15 dakikada bir açıklayıcı audit log üretilir.

## Beklenen BTC örneği

5 USDT marjin x 10 kaldıraç = 50 USDT notional.
BTC fiyatı yaklaşık 62.000 olduğunda 0.001 BTC minimum miktar yaklaşık 62 USDT notional ister.
Bu durumda bot BTC işlem riskini artırmaz; işlemi atlar ve nedenini raporlar.

## Kontrol

`npm run check` içine yeni audit modülü eklendi.
