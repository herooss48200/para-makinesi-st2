# AGROS ST2 v6.15.0-R27 — DUAL REAL RENKO vs HEIKIN ASHI

- R26.1 phased-startup ve fiziksel core-only mimarisi korunur.
- RENKO_REAL mevcut 15m ATR-Renko/BB -> Confirmed -> 1m Renko ST -> Premier/N5 zincirini aynen korur.
- HEIKIN_ASHI_REAL bağımsız 15m Heikin Ashi Bollinger pususu kurar.
- HA SHORT: üst BB temas/geçiş/%0.50 yaklaşma + yeşil HA kaynak mum -> en geç 3 kapanmış HA mum içinde kırmızı teyit -> çalışan gerçek Binance fiyatı kırmızı teyit mumunun dolu gövde altını kırar. İğne tetik değildir.
- HA LONG bunun aynasıdır: alt BB + kırmızı kaynak -> yeşil teyit -> çalışan gerçek fiyat teyit gövde üstünü kırar.
- İki strateji aynı sembolde aynı anda gerçek pozisyon açamaz; Binance one-way güvenliği fail-closed korunur.
- RENKO max 10 gerçek slot, HA max 10 gerçek slot, hesap toplam max 20 gerçek slot.
- Her işlem position/execution state içinde strategyLane kimliğiyle kalıcıdır.
- Canlı panelde RENKO ve HA için ayrı açık slot, pusu, açılan, kapanan, W/L/BE, WR, net PnL ve komisyon sayaçları geri gelir.
- Yarış sayaçları ilk R27 çalışmasında `data/st2-dual-strategy-race.json` başlangıç damgası oluşturur; eski kapanışlar yarışı kirletmez.
- HA kapanışları Renko N5/Entry Evolution öğrenmesine yazılmaz.
- Ortak gerçek execution, Binance reconciliation ve mevcut yüzde stop ekonomisi korunur: başlangıç SL -%2.50; +%1.50 -> SL +%1.00; sonra %0.50 geriden / 0.50 puan.
