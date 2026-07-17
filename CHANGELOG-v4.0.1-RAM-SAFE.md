# AGROS v4.0.1 — Adaptive Trading League RAM-SAFE

- Dinamik exit modeli lig ve dashboard başlangıcında otomatik olarak yeniden kurulmaz.
- Model yoksa ACTUAL fallback ile bot kesintisiz çalışır.
- Büyük exit replay yeniden hesaplaması her kapanış yerine ayarlanabilir aralıkta yapılır (varsayılan 25).
- Başlangıç loguna Adaptive League, Exit Model ve Premier Observation sağlık satırı eklendi.
- Trade engine, mevcut pozisyonlar ve sanal-state verisi değiştirilmedi.
