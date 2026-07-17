# v4.3.9 Memory Safe Premier Observation

- Premier Observation Telegram raporu için hafif `summaryModel` eklendi.
- Rapor sırasında ağır `league.build()` çağrısı kaldırıldı.
- `byDna` için üç ayrı `Object.values().map().sort()` kopyası artık Telegram yolunda oluşturulmuyor.
- Aynı rapor için modelin iki kez okunup kurulması engellendi; oluşturulan özet model mesaj üretiminde yeniden kullanılıyor.
- Trade engine, pozisyon, muhasebe ve exit davranışı değiştirilmedi.
