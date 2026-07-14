# AGROS v3.11.1 — Exit Evolution Advanced Replay Models

- Trend Exit replay eklendi (kayıtlı SuperTrend uyum kırılması).
- Alternatif hızlı ve geniş kademe replay profilleri eklendi.
- Dinamik fiyat yolu exit modeli eklendi.
- Hibrit Trend + MFE exit modeli eklendi.
- ATR Trailing altyapısı eklendi; yalnızca pricePath üzerinde gerçek `atrPct` bulunduğunda ölçüm yapar, aksi halde açıkça veri bekler.
- Tüm modeller yalnızca replay/gölge analizidir; Trade Engine, stop ve gerçek kapanış davranışı değişmedi.
