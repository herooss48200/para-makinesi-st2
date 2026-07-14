# AGROS v3.11.0 — DNA Exit Selector Shadow Mode

## Amaç
Exit Evolution ve Exit Consensus sonuçlarından her DNA için kanıtlı bir exit adayı seçmek ve bu adayı gerçek kademe sistemine dokunmadan canlı sanal işlemlerde gölge olarak doğrulamak.

## Davranış
- Yeni pozisyon açıldığında DNA imzası üzerinden `exit-replay-model.json` okunur.
- Minimum örnek, gerçeği geçme oranı, toplam üstünlük, Profit Factor ve Consensus eşikleri birlikte kontrol edilir.
- Eşikler geçilirse pozisyona `exitPlanShadow` atanır.
- Eşikler geçilmezse `CURRENT_LADDER_FALLBACK` kullanılır.
- Gerçek çıkış her durumda mevcut kademe sistemiyle devam eder.
- Kapanışta seçilen gölge modelin replay sonucu gerçek kademe sonucu ile karşılaştırılır.
- Sonuçlar `data/dna-exit-shadow-validation.jsonl` ve özet model dosyasına yazılır.

## Güvenlik
- Trade Engine değişmedi.
- SL/TP ve kademe güncellemesi değişmedi.
- Gerçek emir davranışına etkisi yoktur.
- Otomatik uygulama ancak ileri doğrulama yeterli kanıt ürettikten sonra ayrı aşamada değerlendirilecektir.
