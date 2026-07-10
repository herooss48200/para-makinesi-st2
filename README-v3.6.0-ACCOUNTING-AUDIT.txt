AGROS v3.6.0 - ACCOUNTING AUDIT FOUNDATION
Tarih: 10.07.2026

Bu paket strateji/trade motorunun giriş ve çıkış kararlarını değiştirmez.
Amaç kritik muhasebe verisini kalıcı kapanış defteriyle doğrulamaktır.

Yapılanlar:
1) Yeni 21_accounting_audit.js
   - data/argos-trade-analiz.jsonl içindeki KAPANIS kayıtlarını okur.
   - tradeId ile tekrar kayıtları tekilleştirir.
   - Genel, LONG ve SHORT için TP/SL/BE, net PNL ve komisyonu yeniden hesaplar.
   - State kapanış sayılarıyla ledger sayıları birebir eşleşirse bozuk muhasebeyi otomatik onarır.
   - Log eksikse otomatik onarım yapmaz; KAPSAM_EKSIK uyarısı üretir.

2) Son Kapanan 5 düzeltmesi
   - son10Islem dizisi en yeni kayıt başta tutulduğu halde eski kod dizinin sonunu gösteriyordu.
   - Artık gerçekten en son kapanan 5 işlem gösterilir.

3) Saat dilimi sabitlemesi
   - PM2 ecosystem ortamına TZ=Europe/Istanbul eklendi.
   - AWS/UTC kaynaklı Telegram saat karışıklığı engellendi.

4) Canlı rapora audit satırı
   - DOGRU: state ve kalıcı ledger uyumlu.
   - ONARILDI: fark bulundu ve ledger üzerinden güvenli onarım yapıldı.
   - KAPSAM_EKSIK: log kapanışları state ile eşleşmedi; hiçbir rakam değiştirilmedi.
   - LOG_YOK: kalıcı analiz dosyası bulunamadı.

Beklenen örnek:
🧾 Muhasebe Audit: ONARILDI | Ledger 391 kapanış | ΔGenel ... | ΔLong ... | ΔShort ...

Önemli güvenlik:
Otomatik onarım yalnızca genel TP/SL/BE ve toplam kapanış sayıları kalıcı ledger ile tam eşleşirse çalışır.
Eksik veya parçalı geçmişte state'e dokunmaz.
