# AGROS ST2 v6.13.5-R3

- K0.5 erken ekonomi koruması eklendi: +%0.25 MFE sonrası stop brüt +%0.20 alana taşınır.
- Eski komisyon-güvenli K1 sözleşmesi geri korundu: +%0.50 tetik, +%0.40 brüt taban, min net +%0.30.
- K2 Renko aktivasyonu +%0.60 olarak korunur.
- CONFIRMED başarı-öncelikli seçim R2 düzeltmesi korunur (N15, WR>=75, pozitif PF/Exp/Net; DIRECT net üstünlüğü şartı yok).
- Gerçek emir miktarı hedefe en yakın Binance stepSize adayını seçer; SOL benzeri gereksiz GERCEK_BOYUT_FAIL_CLOSED engellenir.
- v672 güvenli taban sözleşmesi gevşetilmedi; yeni K0.5 ayrı katman olarak eklendi.
- Final regression reconciliation: v6105/v6109/v6110/v6122/v6123 stale version contracts updated to R3.
- v6108 historical trail test updated so K0.5 protection is recognized without falsely requiring a K3 stop move at takeover.
- v6123 confirmation lifecycle expectations reconciled with K0.5: a confirmed candidate may now close small-positive instead of falling back to the initial SL.
