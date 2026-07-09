# Para Makinesi Binance v3.2.6 - TRIPLE DNA LAB

Bu sürüm yalnızca Intelligence Layer geliştirmesidir. Trade Engine, emir açma/kapama ve risk motoru değiştirilmemiştir.

## Eklenenler
- 11_triple_dna_lab.js modülü eklendi.
- Full Signature DNA içindeki özelliklerden üçlü kombinasyonlar çıkarılır.
- Her Triple DNA için TP, SL, BE, başarı oranı, Profit Factor, Net PNL, ortalama net, DNA Frequency, Discriminative Score ve Confidence Score hesaplanır.
- Triple sonuçları Single Feature ve Pair ortalamalarıyla kıyaslanır.
- Pair üstü katkı, tekil üstü katkı ve maksimum alt-küme farkı ölçülür.
- Telegram BlackBox raporuna TRIPLE DNA LAB v3.2.6 bölümü eklendi.
- Argos Dev Console için data/agros-triple-dna-lab.json ve data/agros-triple-dna-lab.csv çıktıları üretilecek.

## Değişmeyenler
- Trade Engine'e dokunulmadı.
- Pozisyon açma/kapatma mantığı değişmedi.
- Sanal emir, stop, TP, pusu ve sniper mantığı değişmedi.
- data, .env, .git ve node_modules paket dışında tutulmalıdır.

## Kontrol
Localde çalıştır:

npm run check

Başarılıysa standart GitHub ve AWS sürecine geçilebilir.
