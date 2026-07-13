# AGROS v3.7.0 A4.3 — Live Report Reliability Fix

- Trade Engine değiştirilmedi.
- Uzun canlı raporların `<pre>` HTML bloğunun ortasında kesilerek Telegram tarafından reddedilmesi düzeltildi.
- Uzun rapor, HTML etiketleri güvenli biçimde temizlendikten sonra kısaltılır.
- Canlı rapor HTML gönderimi başarısız olursa düz metin olarak bir kez yeniden denenir.
- Yeni canlı rapor başarıyla gönderilmeden eski canlı mesaj artık silinmez.
- Telegram geçici hata verirse son çalışan canlı panel korunur.
