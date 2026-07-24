# AGROS ST2 v5.5.6 — Renko Proof Mode

- Yeni Renko pususu oluştuğu anda ayrıntılı Binance karşılaştırma kanıtı konsola ve Telegram'a gönderilir.
- Kanıt: sembol, yön, pattern, ATR box, BB alt/orta/üst, band farkı, tolerans, temas, tetik, canlı fiyat ve son 10 Renko OHLC/zaman dizisi.
- Her periyodik audit turunda Bollinger temasını en az farkla kaçıran ilk 3 aday `ST2 RENKO YAKIN RED` satırlarıyla raporlanır.
- Böylece `BB temas 0` durumunun piyasa kaynaklı mı yoksa tolerans/hesap kaynaklı mı olduğu sayısal olarak incelenebilir.
- Trade Engine, stop, exit, Premier ve gerçek emir kapısı değiştirilmedi.
