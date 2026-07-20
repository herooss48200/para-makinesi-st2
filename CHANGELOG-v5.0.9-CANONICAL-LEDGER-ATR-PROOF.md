# AGROS v5.0.9 — Canonical Ledger & ATR Proof

- Canlıdaki `121 = 78 + 26 + 32 + 1` çakışması birebir regresyon vakası yapıldı.
- Premier, Shadow ve Real sınıfları açılış/kapanış/aktif/GAP olarak tekil bölümlere ayrıldı.
- Eski kümülatif `closedRestartGap` çakışması ham değeri korunarak kesin artık değere otomatik onarılır.
- Doğru canlı denklem: `121 = 78 + 10 + 32 + 1`.
- ATR testi artık elle `atrPct` vermekle yetinmez: sniper mumlarından ATR üretilir, pricePath'e yazılır, dondurulmuş ATR exit planı executor tarafından geri çekilmede kapatılır.
- Mevcut `test_atr_exit_scoreboard.js` ve yeni uçtan uca ATR testi tam `npm run check` zincirine bağlandı.
- Exit Zafer Denetimi'ne ATR executor/veri/tetik kanıt satırı eklendi.
- Trade Engine ve gerçek emir kapısı değiştirilmedi.
