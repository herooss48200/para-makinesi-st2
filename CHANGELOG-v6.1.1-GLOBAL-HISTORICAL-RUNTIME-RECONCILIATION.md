# AGROS ST2 v6.1.1 — Global Historical Runtime & Reconciliation

- 30 coin tarihsel öğrenme katmanı bot başlangıcında shadow runtime olarak aktive edildi.
- Varsayılan çalışma güvenli READ_ONLY_ACTIVE modudur; mevcut tarihsel state/ledger hemen kullanılır.
- İsteğe bağlı otomatik eksik-coin eğitimi `AGROS_ST2_GLOBAL_HISTORICAL_AUTO_TRAIN=true` ile açılır.
- Entry Evolution ve Winning Intelligence gerçek sonuç hesabı tek `actualNet` kaynağında birleştirildi.
- Global Reconciliation artık canlı ledger, kabul, state, yön ve pattern sayılarını aynı ledger kimliğiyle karşılaştırır.
- Telegram Global Historical bloğu v6.1.1 olarak güncellendi.
- Trade Engine, Renko pusu şartları, stop/BE/exit ve gerçek emir yetkisi değiştirilmedi.
