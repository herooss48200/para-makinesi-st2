# AGROS ST2 v6.13.5-R21 — 15M CONFIRMED TIMEFRAME AUTHORITY FINAL

## Kritik düzeltme
R20'de gerçek `CONFIRMED` giriş hedefi kapanmış **1m Renko dönüşünden** üretiliyordu. Bu, 15m pusu kurulduktan sonra 15m yapı henüz dönmeden 1m mikro dönüş ile erken gerçek emir açılmasına izin verebiliyordu.

R21 gerçek `CONFIRMED` zaman/fiyat otoritesini tekrar 15m'e bağlar:

- LONG: pusu sonrası kapanmış **15m RED -> GREEN** dönüşü zorunlu.
- SHORT: pusu sonrası kapanmış **15m GREEN -> RED** dönüşü zorunlu.
- Seçilen Entry Evolution mesafesi `0.25T / 0.50T / 0.75T`, **15m dönüş tuğlasının kapanışından ve 15m box size'dan** ölçülür.
- 1m Renko SuperTrend yalnız son sniper/yön teyididir (`UP` LONG, `DOWN` SHORT).
- 1m Renko Entry Confirmation Full-Lifecycle laboratuvarı gölge olarak korunur; gerçek CONFIRMED hedef fiyatını üretmez.

## Pusu yaşam sözleşmesi
CONFIRMED pusu, beklenen 15m renk dönüşü son patterni değiştirdi diye iptal edilmez veya yeni pusuya çevrilmez. Pusu sinyal bağlamı dondurulur ve yalnız mevcut `maxPusuBeklemeTugla` ömrü/gerçek giriş ile sonlanır.

## Canlı kanıt / görünürlük
Yeni log:

`✅ [CONFIRMED 15M DÖNÜŞ HAZIR] SYMBOL LONG/SHORT | RED->GREEN / GREEN->RED | Base ... | Offset ...T | Tetik ... | 1m Renko ST son teyit`

Pusu Telegram metni artık:

`Entry Evolution 0.25T → 15m kapanmış dönüş sonrası hesaplanacak`

şeklindedir. `1m dönüş sonrası` ifadesi gerçek CONFIRMED otoritesinden kaldırılmıştır.

## Korunan R20 davranışları
- 30sn DIRECT Telegram live-panel hattı değişmedi.
- Renko CPU isolation ve nonblocking control-plane değişmedi.
- Premier/Shadow yeterlilik kapısı değişmedi.
- Binance gerçek emir, sizing, native SL/TP, atomik stop ve exit matematiği değişmedi.
- 1m Renko ST cache/fail-closed davranışı değişmedi.

## Bilimsel veri notu
R20'ye kadar birikmiş 1m Full-Lifecycle istatistiği silinmez. R21 bunu `LEGACY_1M_SHADOW` olarak açıkça etiketler. Bu veri geriye dönük mode tercihi uyumluluğunda okunabilir; **15m dönüş fiyatı/box/timeframe kanıtı gibi kullanılmaz**. Gerçek CONFIRMED target yalnız kapanmış 15m Renko serisinden hesaplanır.
