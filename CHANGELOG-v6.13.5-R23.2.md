# AGROS ST2 v6.13.5-R23.2

- CONFIRMED giriş pusu sonrasındaki **ilk** kapanmış 15m Renko dönüşünü kullanır.
- Signal time otoritesi kapanmış Renko olay zamanıdır; daha yeni kaynak mum zamanı reversal başlangıcını ileri itemez.
- Aktif CONFIRMED pusu boyunca 15m Renko box pusu anındaki ATR değerinde dondurulur.
- Legacy `maxPusuBeklemeTugla=3` CONFIRMED yaşamını öldürmez.
- İlk reversal sonrası bir sonraki tam 15m Renko kapanmışsa 0.25/0.50/0.75T giriş penceresi kaçmış sayılır ve gerçek giriş fail-closed iptal edilir.
- İptal edilmiş/eskimiş Renko olayının ATR yeniden hesaplamasıyla yeni signature olarak hemen dirilmesi event-time watermark ile engellenir.
- 1m Renko SuperTrend son sniper teyidi olarak korunur.
- CONFIRMED long-life, 10 USDT notional, max 5 gerçek pozisyon ve 24h post-close takip aynen korunur.
