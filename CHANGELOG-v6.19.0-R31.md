# AGROS ST2 v6.19.0-R31 — MTF LIVE / STRUCTURAL STOP / FALSE-BRICK HARDENING

## Canli timeframe hatlari
- 15m, 30m, 1h, 2h ve 4h ATR-Renko/BB kaynaklari canli GERCEK emir yetkilidir.
- 30m/1h/2h/4h OHLC, kapanmis 15m Binance kaynak mumlarindan UTC bucket ile lokal uretilir; ek KLINE istekleri acilmaz.
- Ayni sembolde Binance one-way tek pozisyon kilidi korunur; toplam gercek slot 20 olarak kalir.
- Her pozisyon sourceTimeframe ile dondurulur ve Telegram acilis/kapanis/panel satirinda gosterilir.

## Yalanci tugla / repaint sertlestirme
- R30.2 frozen Renko source korunur.
- Frozen source gecmisi immutable hale getirildi: rolling cache eski timestamp OHLC'yi overwrite edemez, yalniz daha yeni kapanmis kaynak mum append edilir.
- Her timeframe ayri Renko/pusu store kullanir.
- Kaynak mum degismediyse agir ATR/Renko/BB/pattern yeniden uretilmez; aktif pusu yalniz fiyat + hazir 1m Renko-ST ile degerlendirilir.

## Yapısal ilk stop
- LONG: CONFIRMED RED->GREEN donusunden onceki RED low - 0.25T.
- SHORT: CONFIRMED GREEN->RED donusunden onceki GREEN high + 0.25T.
- Yapısal stop giristen %2.50'den daha uzak olamaz; daha yakin olan koruma kullanilir.
- Yapısal referans/fill tarafi gecersizse yeni giris fail-closed olur.
- Mevcut +%1.50 -> SL +%1.00 ve 0.50 puan ilerleyen kar koruma zinciri korunur.
- Eski acik pozisyonlar geriye donuk yeni stop geometrisine zorlanmaz; yeni kural yeni acilislara uygulanir.

## Telegram ve sayaç
- Kapanis ikonu net PNL ile belirlenir: kar ✅, zarar ❌, net sifir ⚖️.
- Kapanista TRT giris/çikis saati ve tam sure bulunur.
- Aktif pozisyon satirinda TF, TRT giris saati ve anlik kar/zarar rengi bulunur.
- R31 baslangicindan itibaren 15m/30m/1h/2h/4h icin ayri Aç/Kap/W/L/BE/WR/Net/PF sayaci tutulur.
- 30m+ kapanislar 15m N5/Entry-Evolution ogrenme havuzuna karistirilmaz; gercek trade ve ayri TF performans sayacinda kalir.

## Test
- test_v6190_r31_mtf_live_struct_stop.js PASS
- R30 core regression PASS
- R26 percent-stop/profit-lock regression PASS
- R26 startup isolation PASS
- R26 phased startup PASS
- R30 Renko-only 20-slot PASS
- Tum JS dosyalari node --check PASS
