# AGROS ST2 v6.17.1-R29.1 — HA FORMATION OR + 3m SUPERTREND FINAL GATE

## Kesin giriş sözleşmesi
HA tarafında sıra değiştirilemez:
1. KAPANMIŞ 15m HA pusu mumu: LONG kırmızı-alt BB, SHORT yeşil-üst BB.
2. En fazla 3 KAPANMIŞ HA mum içinde karşı renk TEYİT tamamen kapanır.
3. Teyit gövde seviyesi dondurulur; iğne kullanılmaz.
4. Yalnız teyitten SONRAKİ tek 15m mumda gerçek Binance fiyatı gövdeyi kırarsa aday oluşur.
5. Bollinger rejimi ortam/konum kontrolü yapar.
6. Formasyon AL kapısı OR mantığıdır:
   - Fincan/Kulp doğru AL fazında **VEYA**
   - Butterfly doğru ve güncel D/PRZ bölgesinde.
7. En son kapı: kapanmış 3m SuperTrend. LONG=UP/YEŞİL, SHORT=DOWN/KIRMIZI.
8. Hepsi uygunsa REAL.

## Fincan/Kulp AL fazı
LONG:
- `CUP_BOTTOM` ancak higher-low + dip skoru >=70 + kısa eğim yukarı ise `CUP_BOTTOM_REVERSAL_LONG`.
- `HANDLE_REVERSAL` doğrudan doğru AL fazıdır.
- `RIGHT_RISE`, `RIGHT_RIM`, `BREAKOUT_EXTENDED`, `HANDLE_PULLBACK`, `HANDLE_BOTTOM` AL değildir; chase/bekleme/veto üretir.

SHORT aynası:
- `INVERSE_CUP_TOP` ancak lower-high + tepe skoru >=70 + kısa eğim aşağı ise AL fazıdır.
- `INVERSE_HANDLE_REVERSAL` doğru SHORT AL fazıdır.
- Sağ düşüş/rim/extended/inverse-handle bounce/top AL değildir.

## Butterfly D/PRZ AL yolu
- X-A-B-C-D Fibonacci motoru korunur.
- Güçlü Butterfly için skor >=72, D yaşı <=4 mum, fiyat-D mesafesi <=0.9 ATR.
- Bullish Butterfly D/PRZ LONG AL yoludur.
- Bearish Butterfly D/PRZ SHORT AL yoludur.
- Karşı yön D/PRZ hard veto üretir.

## Bollinger rejimi
- Bollinger tek başına AL sinyali üretmez; ortam kontrolüdür.
- Son 80 adet 15m geçmişe göre `NARROW / NORMAL / WIDE / EXTREME_WIDE` sınıflaması korunur.
- LONG için üst bölgeye uzamış (`Z>=82`) giriş veto; SHORT için alt bölgeye uzamış (`Z<=18`) giriş veto.
- Geniş bant + güçlü ters impuls, formasyon AL yoksa bounce/chase olarak reddedilir.
- Gerçek cup/handle dönüşü veya doğru Butterfly D/PRZ varsa geniş bant dönüş bağlamı olarak kaydedilir; yine de SuperTrend son kapısı zorunludur.

## 3m SuperTrend son kapı
- R26 çekirdeğine yeni 3m network/cache yolu eklenmedi.
- Mevcut kapanmış 1m `sniperMumlar` cache'i eksiksiz 3 dakikalık OHLC bucket'lara yerelde toplanır.
- Eksik 1m içeren 3m bucket kullanılmaz (fail-closed).
- SuperTrend period=10, multiplier=3.
- LONG için `UP/YEŞİL`, SHORT için `DOWN/KIRMIZI` gerekir.
- ST tersse pusu hemen silinmez; aynı tek 15m tetik penceresinde kapanmış 3m ST'nin doğru yöne dönmesi beklenir. Pencere biterse sinyal expire olur.

## Değişmeyenler
- Renko zinciri değişmedi: kendi CONFIRMED/T öğrenmesi + 1m Renko ST + Premier/N5.
- 10 Renko + 10 HA, toplam 20 slot.
- Stop ekonomisi değişmedi.
- Aynı sembolde ikinci gerçek pozisyon açılmaz.
- Mevcut açık pozisyonlara geriye dönük müdahale yoktur.
