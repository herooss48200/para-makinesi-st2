# AGROS Expectancy Revolution — Aşama 1

## DNA Profit Ranking Engine

Eklenen dosya:
- `33_dna_profit_ranking_engine.js`

Entegrasyon:
- `20_learning_validation.js` mevcut BlackBox `signatureMatrixStats` verisini yeni motorla sıralar.
- Canlı portföy raporuna en güçlü 2 pozitif ve en riskli 2 negatif DNA eklenir.
- `ayarlar.js` içine `dnaProfitRankingMinOrnek: 10` eklendi.
- `npm run check` kapsamına yeni modül eklendi.

Hesaplanan metrikler:
- İşlem sayısı, TP, SL, BE
- Win rate ve Wilson alt güven sınırı
- Brüt kâr, brüt zarar, ortalama kazanç, ortalama kayıp
- Profit Factor
- Net Expectancy (USDT / kapanan işlem)
- Örnek sayısına göre güven skoru
- Pozitif / negatif karar etiketi
- Güven ağırlıklı sıralama skoru

Güvenlik:
- Trade Engine değiştirilmedi.
- Emir açma/kapatma, yön, TP, SL veya stop mantığı değiştirilmedi.
- Modül yalnızca kapanmış BlackBox DNA istatistiklerini okur.

Önerilen commit mesajı:
`feat(analysis): add DNA Profit Ranking Engine`
