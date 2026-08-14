# AGROS ST2 v6.13.5-R25.1 — 5X/20USDT + REPLAY-KANITLI MACD SHADOW

- Gerçek giriş otoritesi CONFIRMED olarak korunur.
- Gerçek risk: 4 USDT marjin x exact 5x = 20 USDT notional, ISOLATED, 10 slot.
- 5x Binance tarafından doğrulanmazsa gerçek emir fail-closed; sessiz kaldıraç fallback yok.
- Başlangıç SL -%2.50.
- Yüzdesel ekonomi: +%1.50 => +%1.00, +%2.00 => +%1.50, +%2.50 => +%2.00; sonra 0.50 puan adım / 0.50 puan takip mesafesi.
- MACD 12/26/9 yalnız SHADOW. Emir açmaz, girişi engellemez, stop değiştirmez.
- Entry replay sonucu: 1m STRONG + 15m OPPOSED/EARLY_RECOVERY ayrı `MACD_EARLY_REVERSAL_PREMIER_SHADOW` cohort olarak kaydedilir.
- BOTH_ALIGNED canlı kapısı yapılmaz; replay bunu desteklemedi.
- Kâr yönetiminde DECAY tek başına yalnız gözlem; OPPOSED/REVERSAL_WARNING yalnız SHADOW koruma adayı üretir.
- 0.25T mevcut Confirmed fractional giriş korunur; MACD 0.25/0.50/0.75 seçicisi yapılmaz.
