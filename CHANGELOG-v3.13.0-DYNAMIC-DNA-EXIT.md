# AGROS v3.13.0 — Dynamic DNA Exit Shadow

- Bir DNA'ya tek ve kalıcı exit bağlama kaldırıldı.
- DNA × piyasa rejimi × volatilite × exit modeli matrisi eklendi.
- Son 10/20/50 ve tüm geçmiş performans birlikte puanlanır.
- Seçim zinciri: tam rejim+volatilite → rejim ailesi → DNA geneli → mevcut kademe.
- DNA League güncel rejimde kanıtlı dinamik exit verisini kullanır.
- Sistem yalnızca SHADOW modda çalışır; gerçek stop/TP/kapanış davranışını değiştirmez.
- Kalıcı çıktılar:
  - data/dynamic-dna-exit-model.json
  - data/dynamic-dna-exit-decisions.jsonl
