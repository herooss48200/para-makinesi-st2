# AWS Deploy — v6.13.5-R21

Taban: v6.13.5-R20 commit `485e671e9a66e575b34679679eab20ce233b2964`.

Dağıtım öncesi yerel `npm test` zorunlu. AWS'de çalışma alanı temiz olmalı. Gerçek açık pozisyonlar varsa `.env`, `data/`, state/ledger ve loglar korunmalı; yeni klasör veya clean reset yapılmamalı.

## Canlı kabul kanıtı
R21 sonrası yeni CONFIRMED pusu mesajı `15m kapanmış dönüş sonrası hesaplanacak` demeli.

Gerçek CONFIRMED tetikten önce logda şu sıra görülmeli:

1. `YENİ ST2 RENKO PUSU`
2. `CONFIRMED 15m dönüş ... CLOSED_15M_REVERSAL_NOT_FOUND` bekleme
3. kapanmış 15m dönüş geldiğinde `✅ [CONFIRMED 15M DÖNÜŞ HAZIR]`
4. seçilen `0.25/0.50/0.75T` hedef fiyatı 15m base + 15m box ile hesaplanır
5. 1m Renko ST aynı yön olduğunda `🎯 [GOLDEN RENKO TETİK] ... Mode CONFIRMED`
6. Premier ve gerçek-entry fail-closed koşulları uygunsa ortak `pozisyonAc` / Binance gerçek emir zinciri

15m dönüş oluşmadan yalnız 1m GREEN->RED / RED->GREEN görülmesi gerçek CONFIRMED emir açmamalıdır.
