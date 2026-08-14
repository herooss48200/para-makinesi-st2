# AGROS ST2 v6.13.5-R25 — EARLY PROFIT LOCK + MACD SHADOW + EXACT LEVERAGE

Taban commit: `eb0a6fa`
Yayın: 14.08.2026

## Canlı ekonomi
- Başlangıç risk SL: -%2.50.
- +%1.50 görülünce stop +%1.00.
- +%2.00 görülünce stop +%1.50.
- +%2.50 görülünce stop +%2.00.
- Sonrasında her +%0.50 yeni kâr kademesinde stop +%0.50 ilerler.
- Takip mesafesi ayarı (%0.50) artık gerçek hesap otoritesidir; stop hiçbir zaman gevşetilmez.
- Gerçek Premier ve ana Shadow/Development yaşamı aynı yüzde-ekonomi otoritesini kullanır.

## MACD Shadow
- Standart MACD 12/26/9.
- Yalnız mevcut kapanmış 1m ve 15m cache kullanılır; yeni Binance market-data isteği açılmaz.
- LONG/SHORT yönüne göre histogram gücü normalize edilir.
- İki ardışık kapanmış histogram çubuğu işlem yönündeki momentumu azaltırsa `DECAY`.
- İşlem yönünün karşısına geçiş `REVERSAL_WARNING`; karşı momentumdan toparlanma `EARLY_RECOVERY`.
- Girişte 1m + 15m MACD snapshot dondurulur.
- 0.25T/0.50T/0.75T legacy delayed-entry Shadow adaylarında da MACD snapshot tutulur ve kapanış sonucuna taşınır.
- Açık pozisyonda MFE +%1.50 ve üstündeyken DECAY/REVERSAL_WARNING yalnız Shadow kâr-koruma önerisi üretir.
- **MACD emir açamaz, girişi engelleyemez ve stop değiştiremez.**
- Ledger: `data/st2-macd-shadow-ledger.jsonl`.

## Kaldıraç / gerçek boyut
- Canlı risk profili 10 USDT marjin x 2x = 20 USDT notional olarak korunur.
- Binance 2x'i doğrulamazsa artık sessiz 1x fallback yapılmaz; gerçek giriş fail-closed kalır.
- LOT_SIZE aşağı-yuvarlama hotfix'i ve %5 güvenli under-target toleransı korunur.
- Gerçek fill/notional sapma güvenliği %2 olarak korunur.

## Giriş otoritesi
- R23.2 CONFIRMED ilk kapanmış 15m reversal + frozen box + fresh fractional window + stale-rearm guard aynen korunur.
- 1m Renko SuperTrend son sniper teyidi aynen korunur.
- Canlı Confirmed pencere bu sürümde genişletilmemiştir; önce MACD ve delayed-entry Shadow kanıtı toplanacaktır.

## Sürüm
- Bot: `6.13.5-R25-EARLY-PROFIT-LOCK-MACD-SHADOW-EXACT-LEVERAGE-10SLOT-20USDT-POSTCLOSE-24H`
- Strateji: `1.0.48`
