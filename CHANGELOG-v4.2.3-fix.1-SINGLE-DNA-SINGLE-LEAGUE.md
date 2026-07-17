# AGROS v4.2.3-fix.1 — Single DNA, Single League

- Her DNA yalnızca tek ligde tutulur.
- Exit modelleri ayrı lig üyeleri değildir; DNA kaydının altında yarışan adaylardır.
- Seçilmiş en iyi doğrulanmış exit, DNA'nın `pairMetrics` ve lig puanını belirler.
- Eski `dna-league-state.json` içinde mükerrer kayıt bulunursa otomatik temizlenir.
- Temizleme önceliği: Premier → Championship → Development → Historical.
- Transfer karşılaştırması gerçek lig yapısı üzerinden düzeltilmiştir.
- Lig denetimine `singleDnaSingleLeague` ve `duplicateLeagueKeys` alanları eklendi.
- Eski işlem ve öğrenme verileri korunur; Trade Engine değiştirilmemiştir.
