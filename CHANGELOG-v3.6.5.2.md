# AGROS v3.6.5.2 — Exit Oracle Separation

- DNA `bestExit` yalnız uygulanabilir (`isExecutable=true`) modellerden seçilir.
- `ORACLE_BENCHMARK` ve eski `MFE_CAPTURE_*` modelleri ayrı `oracleRanking` alanına taşınır.
- Her DNA için `oracleBestBenchmark` ayrıca raporlanır; canlı exit önerisi değildir.
- Telegram DNA profilinde uygulanabilir en iyi exit ile teorik üst sınır ayrı gösterilir.
- Migrasyon tekrar çalıştırılabilir; 17 tarihsel replay yeni ayrımla kayıpsız yeniden kurulur.
- Trade Engine, gerçek stop/TP ve muhasebe değiştirilmez.
