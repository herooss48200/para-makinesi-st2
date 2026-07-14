# AGROS v3.7 — A9.1 Telegram Intelligence Trigger Fix

## Sorun
A5–A9 modelleri `20_learning_validation.js` içinde üretiliyordu ancak ana rapor akışı bu modülü hiç çağırmıyordu. Bu nedenle dosyalar ve hesaplamalar mevcut olsa da Telegram'da Direction, Evolution, Consensus, Dashboard ve Performance Validation görünmüyordu.

## Çözüm
- `2_rapor.js`, `20_learning_validation.js` ile bağlandı.
- Bot başlangıcında AGROS Intelligence raporu bir kez gönderilir.
- Sonrasında yalnızca TP/SL/BE kapanış sayacı değiştiğinde yeni rapor gönderilir.
- Stop güncellemeleri rapor spam'i oluşturmaz.
- Restart Gap kapanışları öğrenme sayaçlarını değiştirmediği için yanlış doğrulama raporu tetiklemez.
- Intelligence raporu hata verse bile canlı portföy raporu ve Trade Engine çalışmaya devam eder.

## Trade Engine
Değiştirilmedi.
