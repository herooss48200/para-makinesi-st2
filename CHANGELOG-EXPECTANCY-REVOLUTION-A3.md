# AGROS Expectancy Revolution — Aşama 3

## Confidence Engine v2

- Yeni bağımsız modül: `35_confidence_engine_v2.js`
- DNA Profit Ranking ve DNA Filter Simulator sonuçlarını açıklanabilir Meta Score'da birleştirir.
- Expectancy, Profit Factor, konservatif başarı, Net PNL, payoff/BE istikrarı ve filtre uyumunu değerlendirir.
- `Meta Score` ile yön kalitesini, `Confidence v2` ile sonucun kanıt güvenilirliğini ayrı hesaplar.
- Her DNA için puan katkı dökümü üretir.
- Recent Form, Drawdown ve Market Regime verisi yoksa sahte değer üretmez; eksik metrik olarak açıkça bildirir.
- Canlı Learning Validation raporuna kısa güçlü/riskli DNA özeti eklenmiştir.
- Trade Engine, emir açma, TP/SL, pusu ve pozisyon yönetimi değiştirilmemiştir.
