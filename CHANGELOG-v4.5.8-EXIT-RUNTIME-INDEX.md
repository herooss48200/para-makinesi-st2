# AGROS v4.5.8 — Exit Runtime Index

- 96+ MB ana dinamik-exit öğrenme modeli korunur; silinmez ve küçültülmez.
- Canlı bot ana modeli tekrar tekrar parse etmez.
- Aynı seçim sırasını taşıyan küçük `dynamic-dna-exit-runtime.json` çalışma indeksi kullanılır.
- Her rejim için pozitif doğrulanmış en iyi aday ve göreceli en iyi aday korunur.
- Tam DNA ve Base DNA fallback zinciri korunur.
- Runtime index her kontrollü model güncellemesinde atomik olarak yenilenir.
- Eski büyük model için tek seferlik `npm run build:exit-runtime` migrasyonu eklenmiştir.
- Trade Engine, pozisyon, lig, muhasebe ve exit uygulama kuralları değiştirilmemiştir.
