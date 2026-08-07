# AGROS ST2 v6.13.5-R9 — STARTUP PANEL GUARD

- AWS üzerinde network izolasyon testi: 10 tur / 320 kline çağrısı, 0 fail, 0 retry, 0 timeout.
- Kök neden: ST2 startup paneli ilk Renko taramasına ertelenmiş olmasına rağmen periyodik canlı rapor `sonCanliRapor=0` nedeniyle ilk ana döngüde guardı bypass ediyordu.
- Düzeltme: ST2 modunda periyodik canlı rapor yalnız `startupMarketReady === true` ve ilk ST2 Renko taraması tamamlandıktan sonra çalışabilir.
- Startup paneli planlandığında aynı turdaki periyodik panel tekrarı bastırılır.
- R8 known-good market-data/network motoruna, Golden Renko, Entry Evolution, gerçek emir, stop veya profit-floor matematiğine dokunulmadı.
