# AGROS ST2 v6.13.5-R12 — RENKO 1M ST READINESS & ENTRY FUNNEL RECOVERY

- Entry Gate artık `sniperMumlar` ham cache sayısını 1m Renko ST hazır kabul etmez; gerçek ATR-Renko + SuperTrend UP/DOWN readiness sayılır.
- 80 adet 1m mum yeterli Renko tuğlası üretmezse aynı strateji korunarak yalnız o sembolde 240, gerekirse 480 kapanmış 1m mum ile derin onarım yapılır.
- Refresh, daha önce derin onarım gerektiren sembolün gerekli tarihçe derinliğini korur.
- `72_st2_renko_entry.js` hazır 1m Renko-ST cache'i kullanır; aynı kapalı 1m mum için ağır hesap tekrar edilmez.
- Panel ham 1m veri ile gerçek 1m Renko ST readiness'i ayırır ve giriş hunisini gösterir.
- DIRECT/CONFIRMED policy, Entry Evolution, Bollinger/Renko pattern, stop/exit/real-order matematiği değiştirilmedi.
