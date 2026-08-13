# AGROS ST2 v6.13.5-R24.2 — UNIFIED PERCENT ECONOMY

- Gerçek Premier ve ana Shadow/Development başlangıç execution SL tek otoriteye bağlandı: -%2.50.
- LAB Lifecycle `stopPct` öğrenmeye/replay'e devam eder ancak ana execution SL'yi artık override edemez.
- Entry Evolution stop audit/frozen risk, `executionInitialStopPct` veya global `sabitStopYuzdesi` kullanır.
- Yüzdesel ekonomi değişmedi: +%2.50 -> SL +%1.50; ardından her +%0.50 yeni kademede stop +%0.50 yükselir (yaklaşık %1 geriden).
- 10 gerçek slot, 20 USDT notional ve R23.2 CONFIRMED first-reversal fresh-window korunur.
- LEGACY 1m Renko confirmation laboratuvarı ayrı tanı/replay katmanıdır; gerçek mode yetkisi yoktur.
